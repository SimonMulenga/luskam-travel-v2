# Local-only idempotency concurrency check

This two-session check is for a disposable local Supabase database only. Do not
run it against production or staging. Use an existing synthetic local Auth user
UID and discard/reset the local database after the check because Session A must
commit before Session B can observe its booking.

The check verifies that the replay lookup waiting on an in-flight nonce claim
sees the committed booking after the quote expires, then that creation returns
the same booking. Use two interactive `psql` sessions or other confirmed
persistent independent connections to the same local database. Do not assume
two SQL Editor tabs retain separate open transactions. `service_role` is set
only to simulate the trusted Edge Function RPC caller.

## Session A

Replace `LOCAL_SYNTHETIC_AUTH_UID` with a synthetic user in local `auth.users`.
Run this script and leave its transaction open after `pg_sleep` completes:

```sql
BEGIN;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$ BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Expected READ COMMITTED isolation';
  END IF;
END $$;
SELECT set_config('phase9d.concurrent_expiry', (clock_timestamp() + interval '5 seconds')::text, false);
SELECT set_config('phase9d.concurrent_user', 'LOCAL_SYNTHETIC_AUTH_UID', false);

SELECT public.create_flight_booking_request_once(
  current_setting('phase9d.concurrent_user')::uuid,
  '9d9d9d9d-9d9d-49d9-89d9-9d9d9d9d9d9d'::uuid,
  '8c8c8c8c-8c8c-48c8-88c8-8c8c8c8c8c8c'::uuid,
  repeat('e', 43),
  current_setting('phase9d.concurrent_expiry')::timestamptz,
  'PHASE9D-CONCURRENCY-LOCAL-ONLY', 123.45, 'USD', current_date + 30,
  '{"requestOnly":true,"synthetic":true,"test_only":true}'::jsonb
);
SELECT pg_sleep(10);
-- Keep this transaction open. Copy the displayed expiry value from Session A.
```

## Session B

Start this while Session A is sleeping, and replace `COPY_EXPIRY_FROM_SESSION_A`
with the exact expiry value displayed by Session A. The RPC should block on the
same customer/nonce advisory transaction lock.

```sql
BEGIN;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$ BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Expected READ COMMITTED isolation';
  END IF;
END $$;

SELECT public.resolve_flight_booking_request_replay(
  'LOCAL_SYNTHETIC_AUTH_UID'::uuid,
  '9d9d9d9d-9d9d-49d9-89d9-9d9d9d9d9d9d'::uuid,
  '8c8c8c8c-8c8c-48c8-88c8-8c8c8c8c8c8c'::uuid,
  repeat('e', 43)
);
SELECT public.create_flight_booking_request_once(
  'LOCAL_SYNTHETIC_AUTH_UID'::uuid,
  '9d9d9d9d-9d9d-49d9-89d9-9d9d9d9d9d9d'::uuid,
  '8c8c8c8c-8c8c-48c8-88c8-8c8c8c8c8c8c'::uuid,
  repeat('e', 43),
  'COPY_EXPIRY_FROM_SESSION_A'::timestamptz,
  'PHASE9D-CONCURRENCY-RETRY-LOCAL-ONLY', 999.99, 'USD', current_date + 30,
  '{"requestOnly":true,"synthetic":true,"test_only":true}'::jsonb
);
```

After Session B is visibly waiting, run `COMMIT;` in Session A. Session B's
resolver must return `outcome = replay` with the same booking ID as Session A,
despite its quote having expired while it waited. Its subsequent creation call
must also return `outcome = replay` with that same ID. The second amount and
reference must not replace the original booking. Roll back Session B after
inspecting both results.

This test requires a disposable local database because Session A must commit to
release the lock and make the first booking visible. It intentionally does not
claim that concurrency has been executed by this repository change.

## Staging verification plan (not executed; earlier draft superseded)

The five-second/ten-second staging SQL blocks and inline cleanup example below
are superseded by the separate staging scripts listed at the end of this file.
Do not execute those older staging blocks. Use the persistent-connection
procedure below, the 60-second quote expiry, 70-second hold, lock monitor, and
guarded cleanup script instead.

The SQL below exercises service-role database RPCs directly. It verifies the
database's nonce/idempotency transaction behavior; it does **not** test JWT
verification, signed-quote validation, provider fare revalidation, or the full
Edge Function. Run only after explicit staging approval, against project
`ikbffvqkxwhkwlocjufc`, with a dedicated synthetic Auth user and after the
pending migration is applied. Never use the original Lovable project or
production. Use new UUIDs and a unique `PHASE9D-STAGING-<UUID>` reference for
each run. Do not include real passenger or contact data.

Before concurrency, run the single-transaction cases from
`booking_request_edge_security_sql_editor.sql` in staging. That rollback-only
script covers first create, same-key/hash retries before and after expiry,
different key/hash conflicts, expired unused quote rejection, failure rollback
and retry, and rate-limit behavior. Review the whole SQL Editor result: a PASS
row is meaningful only if every preceding block completed without error and the
script reached its final `ROLLBACK`.

For the two-session boundary test, use distinct random values for `nonce`,
`idempotency_key`, and `reference`, and keep the request hash identical in both
sessions (43 base64url characters). Set both sessions' JWT role claim to
`service_role`; run from the SQL Editor's privileged staging context. As the
first command after `BEGIN` in both sessions, execute
`SET TRANSACTION ISOLATION LEVEL READ COMMITTED;` and assert
`current_setting('transaction_isolation') = 'read committed'` before any RPC.
The SQL blocks above include that assertion.

1. Session A begins a transaction, selects `service_role`, sets its service
   role claim, and calls `create_flight_booking_request_once` with the dedicated
   synthetic user, new nonce/key/hash, a quote expiry about five seconds ahead,
   a unique staging test reference, positive synthetic amount, USD, and
   `requestOnly: true` plus `synthetic: true` details. Require `outcome=created`
   and record the returned booking ID. Keep the transaction open and sleep for
   about ten seconds so the quote expires while the lock remains held.
2. While Session A is still open, Session B begins a transaction, selects
   `service_role`, sets the same claims/values, and calls
   `resolve_flight_booking_request_replay`. Confirm that it waits. Commit
   Session A, then require Session B to return `outcome=replay` with the exact
   booking ID from Session A.
3. In Session B, call `create_flight_booking_request_once` with the same
   customer/nonce/key/hash and now-expired timestamp. Require `outcome=replay`
   and the same ID. Then call it once with a new idempotency key and once with
   the original key but a different 43-character request hash; both must return
   `outcome=conflict`, without creating a booking or changing the original
   amount/reference. Roll back Session B after recording results.
4. In a separate rollback-only transaction, call creation for a distinct
   unused nonce with an already expired timestamp. Require `outcome=conflict`
   and verify no claim and no booking exist for its unique test reference.
5. Verify exactly one `public.bookings` row exists for the concurrency test
   reference and that exactly one `private.booking_quote_claims` row exists for
   the synthetic user/nonce, pointing to that booking. Verify the booking is a
   pending request with pending payment status and contains no provider order,
   PNR, or ticket issuance claim.

Because Session A commits, the concurrency fixture is intentionally not
rollback-only. After collecting results, use the SQL Editor as the original
privileged staging role to inspect the exact user ID, reference, booking ID,
and nonce. Replace the three cleanup placeholders below with the recorded
synthetic values, inspect them before execution, and run only in the verified
staging project. It is deliberately a separate cleanup transaction because
Session A must commit for Session B to observe it:

```sql
BEGIN;
SELECT set_config('phase9d.cleanup_user_id', 'SYNTHETIC_AUTH_UID', true);
SELECT set_config('phase9d.cleanup_booking_id', 'RECORDED_BOOKING_UUID', true);
SELECT set_config('phase9d.cleanup_reference', 'PHASE9D-STAGING-RECORDED-UUID', true);

DO $$
DECLARE child_rows integer; booking_rows integer; tombstone_rows integer;
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Unexpected cleanup role %', current_user;
  END IF;
  IF current_setting('phase9d.cleanup_reference') !~ '^PHASE9D-STAGING-[A-Fa-f0-9-]{36}$' THEN
    RAISE EXCEPTION 'Reference is not an explicitly tagged staging fixture';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id = current_setting('phase9d.cleanup_booking_id')::uuid
      AND (user_id <> current_setting('phase9d.cleanup_user_id')::uuid
           OR reference <> current_setting('phase9d.cleanup_reference'))
  ) THEN
    RAISE EXCEPTION 'Booking ID does not match the supplied synthetic owner and reference';
  END IF;
  SELECT count(*) INTO tombstone_rows
  FROM private.booking_quote_claims
  WHERE booking_id = current_setting('phase9d.cleanup_booking_id')::uuid;
  IF tombstone_rows <> 1 OR NOT EXISTS (
    SELECT 1 FROM private.booking_quote_claims
    WHERE booking_id = current_setting('phase9d.cleanup_booking_id')::uuid
      AND user_id = current_setting('phase9d.cleanup_user_id')::uuid
  ) THEN
    RAISE EXCEPTION 'Expected exactly one nonce tombstone for this synthetic booking and owner';
  END IF;

  DELETE FROM public.flight_bookings
  WHERE booking_id = current_setting('phase9d.cleanup_booking_id')::uuid;
  GET DIAGNOSTICS child_rows = ROW_COUNT;

  DELETE FROM public.bookings
  WHERE id = current_setting('phase9d.cleanup_booking_id')::uuid
    AND user_id = current_setting('phase9d.cleanup_user_id')::uuid
    AND reference = current_setting('phase9d.cleanup_reference');
  GET DIAGNOSTICS booking_rows = ROW_COUNT;

  IF booking_rows <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one matching booking; deleted %', booking_rows;
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings
             WHERE id = current_setting('phase9d.cleanup_booking_id')::uuid
                OR reference = current_setting('phase9d.cleanup_reference'))
     OR EXISTS (SELECT 1 FROM public.flight_bookings
                WHERE booking_id = current_setting('phase9d.cleanup_booking_id')::uuid) THEN
    RAISE EXCEPTION 'Synthetic booking or child records remain after cleanup';
  END IF;
  IF (SELECT count(*) FROM private.booking_quote_claims
      WHERE booking_id = current_setting('phase9d.cleanup_booking_id')::uuid
        AND user_id = current_setting('phase9d.cleanup_user_id')::uuid) <> 1 THEN
    RAISE EXCEPTION 'Replay tombstone is missing or does not match the synthetic owner';
  END IF;
  RAISE NOTICE 'Cleanup verified: % child rows removed; booking deleted; one replay tombstone retained', child_rows;
END;
$$;

COMMIT;
```

Do not run cleanup if any guard fails; the transaction will abort and should be
rolled back. Do not delete unrelated rows or the synthetic Auth user. Since the
quote expiry has passed, retain the private nonce claim. It contains only the
synthetic owner, nonce, request hash, expiry, and deleted booking ID, not
passenger details. Keeping it prevents reuse of the consumed nonce; the expired
quote is not usable to create another booking.

If cleanup cannot be positively scoped or verified, leave the tagged synthetic
records for review and do not broaden the deletion. This procedure is
prepared-only; no staging SQL has been run.

## Separate executable staging scripts

The staging procedure is split into SQL-only files:

- `phase9d_staging_concurrency_session_a.sql`
- `phase9d_staging_concurrency_session_b.sql`
- `phase9d_staging_concurrency_verify.sql`
- `phase9d_staging_concurrency_cleanup.sql`
- `phase9d_staging_concurrency_lock_monitor.sql`

Use the prepared synthetic staging customer A and shared fixture identifiers
embedded in both session scripts. If rerunning, replace the nonce, original
idempotency key, user ID if needed, original reference UUID, and every matching
value in both files with fresh synthetic values. Keep the request hash identical
between sessions. Session B reads the exact quote expiry from Session A's
committed nonce claim, so it does not calculate a separate timestamp.

Use two independent persistent database connections, preferably two
interactive `psql` sessions connected directly or through a session-mode pooler.
Do not use one-shot `psql -f` processes, transaction-mode pooling, or assume two
Supabase SQL Editor tabs preserve independent open transactions. SQL Editor
execution may use request-scoped backend connections and may close or commit a
transaction when a script finishes; confirm persistent independent sessions
before attempting this test. The scripts print each backend PID to help confirm
that the connections differ.

In each interactive `psql` session, run the corresponding file with `\i` using
its full path. Before running a file, set `\set ON_ERROR_STOP on` in that psql
session so an assertion failure stops the script; issue `ROLLBACK;` manually if
the session is left in an aborted transaction. Start Session A and let its
70-second sleep finish; its transaction remains open. Start Session B while A
is open. Compare the printed backend PIDs. From a third privileged connection,
run `phase9d_staging_concurrency_lock_monitor.sql` and require its detailed rows
to show Session A granted the expected advisory lock and Session B waiting on
that same advisory lock (`wait_event_type = 'Lock'`, `wait_event = 'advisory'`).
Only then enter `COMMIT;` manually in Session A. Session B checks the expired
identical retry and changed-key/hash conflicts, then rolls its own transaction
back. Run the verification file with the exact booking UUID returned by both
sessions. Run cleanup only after verification succeeds; it explicitly commits
deletion of that exact synthetic booking while retaining the replay tombstone.

Session A intentionally commits one staging fixture so Session B can observe
the completed request. If B is interrupted or assertions fail after A commits,
do not rerun with the same identifiers. Inspect the fixture using the verification
script, then clean it up with the exact returned booking UUID or leave it for
review. This staging procedure has not been executed.
