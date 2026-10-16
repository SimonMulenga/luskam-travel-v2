# Phase 9D Edge Function hardening (staging review)

This change set is local only. Do not run it against production. The staging project reference is `ikbffvqkxwhkwlocjufc`; the original Lovable project remains out of scope.

## Changes

- `create-booking-request` creates a random signed-quote nonce and verifies signature, authenticated owner, expiry, search, and offer before any provider re-search. Valid retries first check the persisted nonce claim, so an already-created request can be returned idempotently even if the fare later changes. A single database transaction consumes the nonce and inserts one pending request. A second idempotency key for that nonce returns conflict.
- Persistent per-user fixed-window limits are enforced in PostgreSQL: quote generation 10/minute, priced submissions 5/10 minutes, other inquiries 10/hour. Database failures fail closed; limit responses are HTTP 429 with `Retry-After`.
- The body is capped at 32 KiB. Dates require a real `YYYY-MM-DD` calendar date. Submission identifiers must be canonical UUIDv4 values. Inquiry details use service-specific field allowlists; ticket/PNR, payment, status, provider and financial authority fields are excluded.
- Client errors use generic messages with a request correlation ID. Internal logs include operation, correlation ID and error class, not error text, credentials, or passenger/contact data.
- Booking-function CORS allows only exact HTTPS origins listed in BOOKING_ALLOWED_ORIGINS (or localhost HTTP for local development); the default allowlist is empty. CORS is not used for authentication; Supabase user verification remains mandatory.
- Flight fare is re-searched and repriced server-side. Missing active rules reject the priced quote. The flow still creates only manual pending requests and never calls reservation, ticketing, or payment APIs.

## Migration

Apply `supabase/migrations/20261015170000_secure_booking_request_replay_and_rate_limits.sql` after the current booking authorization migrations. It creates private, RLS-enabled nonce and rate-limit tables with no client grants, and service-role-only RPCs with a pinned search path. It does not alter existing status values, booking RLS, pricing rules, Edge Function deployment, or supplier operations.

The migration is forward-only. Do not drop the replay ledger or counters as a routine rollback: doing so would reopen replay windows and remove throttling history. If an issue appears, first redeploy the previous Edge Function while retaining tables/RPCs; disable function access if needed. Review any eventual cleanup migration separately after all outstanding quote tokens have expired and records are no longer needed.

## Required Edge Function environment

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the Edge Function runtime. Keep the service-role key only in function secrets; never add it to Vite variables or a checked-in file. Existing FlightAPI configuration remains server-side.

Set `BOOKING_ALLOWED_ORIGINS` to a comma-separated list of exact staging web origins, including the Vercel preview origin used for QA. Do not use wildcards. Origin values have no trailing slash.

## Verification sequence (staging only)

1. Confirm the dashboard project reference is `ikbffvqkxwhkwlocjufc`; do not link or target the old project.
2. In PowerShell, from the repository directory, confirm the staging dashboard reference, then inspect migration history and the dry run with explicit targeting:

   ```powershell
   $ExpectedStagingRef = 'ikbffvqkxwhkwlocjufc'
   npx.cmd supabase migration list --project-ref $ExpectedStagingRef
   if ($LASTEXITCODE -ne 0) { throw 'Could not read staging migration history; stop.' }
   npx.cmd supabase db push --dry-run --project-ref $ExpectedStagingRef
   if ($LASTEXITCODE -ne 0) { throw 'Staging migration dry run failed; stop.' }
   ```

   `supabase/config.toml` names staging, but keep the explicit `--project-ref` argument on every remote command. Verify manually that every earlier local migration through `20261015160000` is recorded remotely and the dry run lists exactly `20261015170000_secure_booking_request_replay_and_rate_limits.sql`. `db push` applies **all** pending local migrations; there is no single-file target flag. If any earlier migration is missing or the dry run lists anything else, stop. Only when the explicit target and both checks match, the apply command is:

   ```powershell
   npx.cmd supabase db push --project-ref $ExpectedStagingRef
   ```

   This command is intentionally not run as part of this preparation. Do not add `--include-all`, `--include-seed`, `--local`, or `db reset`. After applying, verify migration history again before running `supabase/tests/booking_request_edge_security_sql_editor.sql` from SQL Editor as `postgres`/`supabase_admin`. That script uses a synthetic existing auth user, generates temporary fixtures, and ends in `ROLLBACK`. It tests service-role RPC denial, pending status, retry resolution, nonce conflict, and rate-limit behavior. It does not test concurrent database sessions.
3. Deploy the updated `create-booking-request` function only to staging, with the staging URL, publishable key, service-role key, FlightAPI credential, and `BOOKING_ALLOWED_ORIGINS` configured as function secrets. Never print secret values in terminal output.
4. Run the non-writing probes in `phase9d_edge_function_security_probes.ps1` with `-ConfirmStaging` for anonymous and forged authority fields.
5. For provider-backed concurrency checks, use a synthetic Customer A token and an actual current staging offer reference:

   ```powershell
   $env:LUSKAM_STAGING_PUBLISHABLE_KEY = '<staging publishable key>'
   $env:LUSKAM_CUSTOMER_A_ACCESS_TOKEN = '<synthetic Customer A access token>'
   .\supabase\operations\phase9d_booking_request_staging_verification.ps1 `
     -ConfirmStaging -Origin LUN -Destination JNB -DepartureDate 2026-12-01 `
     -ProviderReference '<offer reference from staging search>'
   ```

   The script validates concurrent same-key retry, same-quote/different-key rejection, idempotent retry, and HTTP 429. It creates at most two synthetic pending booking requests, does not reserve inventory or collect payment, and prints only the created booking IDs. Use synthetic passenger/contact values only. If the provider offer is unavailable or fare rules are inactive, the script stops without booking rows.

6. For the quote-expiry path, use the same synthetic account and a fresh current staging offer. Generate a separate unique `P9D` plus 32-hex run marker, use it as the synthetic passenger first name with last name `Synthetic`, and use an `example.invalid` contact email. Record the marker and UTC start time. Request a quote and retain its response only in the local shell. Submit it once with a new UUID idempotency key, then wait until at least 10 seconds after its `expiresAt` and retry the exact same body. The retry should return HTTP 200 with `duplicate: true` and the original booking ID without a provider re-search. Request a second quote, do not submit it, wait until 10 seconds after expiry, then submit it; it should return HTTP 409 and create no booking. This test creates one pending request, which must be cleaned using its own marker and start time in step 7. The unit tests cover the pure expiry condition; this staging sequence verifies the complete endpoint path.

7. Clean up the Edge test's synthetic bookings after recording the outcomes. The PowerShell script generates and prints a unique `P9D` run marker before it submits requests and again in `finally`; this also lets cleanup find a request that committed but whose HTTP response was lost. In the staging SQL Editor, first verify the dashboard project ref and run the guarded cleanup below with the synthetic Customer A UID and exact marker from that one run. It matches the user, flight type, pending states, `requestOnly`, and exact synthetic passenger marker, refuses more than two rows, deletes only those bookings and their dependent flight rows, then verifies no matching bookings remain while retaining exactly one nonce tombstone per removed booking:

   ```sql
   BEGIN;
   SELECT set_config('phase9d.cleanup_user_id', '<synthetic-customer-a-uuid>', true);
   SELECT set_config('phase9d.cleanup_marker', '<printed-P9D-run-marker>', true);
   SELECT set_config('phase9d.cleanup_started_at', '<printed-UTC-start-time>', true);

   DO $$
   DECLARE v_ids uuid[]; v_count integer; v_deleted integer; v_tombstones integer; v_rate_rows integer;
   BEGIN
     IF current_user NOT IN ('postgres', 'supabase_admin') THEN
       RAISE EXCEPTION 'Unexpected cleanup role %', current_user;
     END IF;
     IF current_setting('phase9d.cleanup_marker') !~ '^P9D[0-9a-f]{32}$' THEN
       RAISE EXCEPTION 'Invalid run marker; stop without cleanup';
     END IF;

     SELECT array_agg(id ORDER BY id) INTO v_ids
     FROM public.bookings
     WHERE user_id = current_setting('phase9d.cleanup_user_id')::uuid
       AND type = 'flight' AND status = 'pending' AND payment_status = 'pending'
       AND details ->> 'requestOnly' = 'true'
       AND details #>> '{pax,0,firstName}' = current_setting('phase9d.cleanup_marker')
       AND details #>> '{pax,0,lastName}' = 'Synthetic';
     v_count := COALESCE(cardinality(v_ids), 0);
     IF v_count > 2 THEN
       RAISE EXCEPTION 'Expected at most two bookings from this run, found %', v_count;
     END IF;
     IF v_count = 0 THEN
       RAISE NOTICE 'No committed booking found for this run marker';
     END IF;

     DELETE FROM public.flight_bookings WHERE booking_id = ANY(v_ids);
     DELETE FROM public.bookings
     WHERE id = ANY(v_ids)
       AND user_id = current_setting('phase9d.cleanup_user_id')::uuid
       AND type = 'flight' AND status = 'pending' AND payment_status = 'pending'
       AND details ->> 'requestOnly' = 'true'
       AND details #>> '{pax,0,firstName}' = current_setting('phase9d.cleanup_marker')
       AND details #>> '{pax,0,lastName}' = 'Synthetic';
     GET DIAGNOSTICS v_deleted = ROW_COUNT;
     IF v_deleted <> v_count THEN
       RAISE EXCEPTION 'Expected to delete % exact synthetic bookings, deleted %', v_count, v_deleted;
     END IF;

     IF EXISTS (SELECT 1 FROM public.bookings
                WHERE id = ANY(v_ids)
                   OR (user_id = current_setting('phase9d.cleanup_user_id')::uuid
                       AND details #>> '{pax,0,firstName}' = current_setting('phase9d.cleanup_marker'))) THEN
       RAISE EXCEPTION 'Synthetic booking remains after cleanup';
     END IF;
     IF EXISTS (SELECT 1 FROM public.flight_bookings WHERE booking_id = ANY(v_ids)) THEN
       RAISE EXCEPTION 'Synthetic flight booking child row remains after cleanup';
     END IF;

     -- Run only when this synthetic identity was reserved for this test and
     -- no other staging checks used it after the printed start time.
     DELETE FROM private.booking_edge_rate_limits
     WHERE user_id = current_setting('phase9d.cleanup_user_id')::uuid
       AND scope IN ('quote', 'submit_flight')
       AND updated_at >= current_setting('phase9d.cleanup_started_at')::timestamptz;
     GET DIAGNOSTICS v_rate_rows = ROW_COUNT;
     IF EXISTS (SELECT 1 FROM private.booking_edge_rate_limits
                WHERE user_id = current_setting('phase9d.cleanup_user_id')::uuid
                  AND scope IN ('quote', 'submit_flight')
                  AND updated_at >= current_setting('phase9d.cleanup_started_at')::timestamptz) THEN
       RAISE EXCEPTION 'Run-scoped synthetic rate-limit rows remain';
     END IF;

     SELECT count(*) INTO v_tombstones
     FROM private.booking_quote_claims
     WHERE user_id = current_setting('phase9d.cleanup_user_id')::uuid
       AND booking_id = ANY(v_ids);
     IF v_tombstones <> v_count THEN
       RAISE EXCEPTION 'Expected % replay tombstones to remain, found %', v_count, v_tombstones;
     END IF;
     RAISE NOTICE 'Cleanup verified: % synthetic bookings and % run-scoped rate-limit rows removed; % replay tombstones retained', v_deleted, v_rate_rows, v_tombstones;
   END;
   $$;
   COMMIT;
   ```

   Use this cleanup only if the synthetic account was reserved for this run, with no overlapping staging tests. If the account was shared, omit the rate-limit DELETE and let those counters expire; do not risk deleting another test's limits. If any guard or post-cleanup check raises an error, roll back and investigate; do not broaden the booking deletion. The private nonce ledger intentionally remains as a replay tombstone.

## Local automated checks

Vitest covers controlled fields, strict dates/UUIDs, inquiry allowlists, quote nonce/expiry matching, and missing pricing rules. The SQL Editor script is rollback-only. The PowerShell HTTP script covers real concurrent requests and throttling but must only be run against staging after the function and migration are deployed. The expiry sequence above is staging-only and explicitly creates one synthetic pending request. None of these staging tests have been executed as part of this local implementation.
