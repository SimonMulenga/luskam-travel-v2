# Flight quotation RPC concurrency check

Staging project: `ikbffvqkxwhkwlocjufc`
Function: `public.create_flight_quote_request_once`
Status: prepared only; no SQL has been run.

This test verifies PostgreSQL advisory-lock serialization for the service-role quotation RPC. It does not test the frontend, Edge Function authentication, rate limiting, or gateway IP handling. Run only against the isolated staging project after migrations `20261016100000` and `20261017100000` are applied. Never use production. Confirm the project reference in the Supabase dashboard before opening database connections.

The fixture values below are fresh synthetic values for one run. The function requires the request hash and dedupe key to match, so both sessions use the same value for both fields. Each session uses a different idempotency UUID and reference. Customer details are fake and use the reserved `.test` domain.

| Value | Session A | Session B |
| --- | --- | --- |
| Idempotency UUID | `39a4ed4c-02f2-4158-9bdf-190e6b0191f7` | `9b46eae5-8e89-4abf-b29b-f2c8b057419b` |
| Reference | `LTA-20261017-C98E80CF3B61973C` | `LTA-20261017-806F9724323B21A8` |
| Request hash and dedupe key | `7I4wJzuA6-aPoyGG068gLi6EYBdBt2Uzkh7j9QRbK-E` | same |

Both use LUN to JNB, one-way, future departure date 2027-12-15, one adult, economy, and identical synthetic contact details. Do not reuse these values for another run. Generate fresh UUIDs, references in the format `LTA-YYYYMMDD-<16 uppercase hex characters>`, and a 32-byte base64url hash (43 characters). Use the generated hash as both request hash and dedupe key.

The RPC treats the hash as an opaque server-generated fingerprint and checks that it equals the dedupe key. This direct service-role test uses a synthetic fingerprint to exercise database locking; it does not verify the Edge Function's keyed HMAC calculation or request canonicalization.

## Open persistent PostgreSQL sessions in Windows PowerShell

Use a direct staging connection or a session-mode pooler. Do not use transaction-mode pooling: the transactions must remain open across commands. Obtain host, port, and username from the staging project's Connect panel. Do not put a password in a command, script, environment variable, or this document. `psql -W` prompts for it without putting it on the command line.

Open two separate PowerShell terminals for Sessions A and B. A third terminal is optional if you prefer to observe the lock from a separate connection. In each terminal, enter the staging host, port, and username from the Connect panel, set the terminal-specific application name below, and connect:

```powershell
$StagingDbHost = Read-Host 'Staging database host'
$StagingDbPort = Read-Host 'Staging database port'
$StagingDbUser = Read-Host 'Staging database username'
$env:PGSSLMODE = 'require'
$env:PGAPPNAME = 'luskam-9g-5ad760eb-c22e-4a4e-a312-116c56dd4538-A'
psql -h $StagingDbHost -p $StagingDbPort -U $StagingDbUser -d postgres -W -v ON_ERROR_STOP=1
```

Use these application names, setting `$env:PGAPPNAME` before launching `psql` in each terminal:

- Session A: `luskam-9g-5ad760eb-c22e-4a4e-a312-116c56dd4538-A`
- Session B: `luskam-9g-5ad760eb-c22e-4a4e-a312-116c56dd4538-B`
- Observer: `luskam-9g-5ad760eb-c22e-4a4e-a312-116c56dd4538-observer`

If using a third observer, connect with a role allowed to inspect the other sessions in `pg_stat_activity`, usually the staging `postgres` role. With only two sessions, Session A can run the observer query after `RESET ROLE`; its transaction remains open and continues holding its advisory locks. This two-session observation requires Session A's original login role to have visibility into Session B's activity; otherwise use the optional privileged observer.

## Session A: create and hold the request

Paste this into Session A. Wait for `outcome = created`. The transaction remains open at the `psql` prompt and holds its advisory transaction locks. Do not commit yet. No sleep or timing guess is needed.

```sql
BEGIN;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT public.create_flight_quote_request_once(
  '39a4ed4c-02f2-4158-9bdf-190e6b0191f7',
  '7I4wJzuA6-aPoyGG068gLi6EYBdBt2Uzkh7j9QRbK-E',
  '7I4wJzuA6-aPoyGG068gLi6EYBdBt2Uzkh7j9QRbK-E',
  'LTA-20261017-C98E80CF3B61973C',
  'LUN', 'JNB', DATE '2027-12-15', NULL, 'oneway', 1, 0, 0, 'economy',
  'Synthetic Concurrency Customer', 'synthetic-concurrency@example.test',
  '+00000000000', 'Synthetic concurrency test only'
);
```

## Session B: submit the concurrent request

Only after Session A returned `created`, paste this into Session B. It has a 120-second timeout so a missing lock does not leave it waiting indefinitely. Leave the statement running while the observer checks the wait.

```sql
BEGIN;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout = '120s';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT public.create_flight_quote_request_once(
  '9b46eae5-8e89-4abf-b29b-f2c8b057419b',
  '7I4wJzuA6-aPoyGG068gLi6EYBdBt2Uzkh7j9QRbK-E',
  '7I4wJzuA6-aPoyGG068gLi6EYBdBt2Uzkh7j9QRbK-E',
  'LTA-20261017-806F9724323B21A8',
  'LUN', 'JNB', DATE '2027-12-15', NULL, 'oneway', 1, 0, 0, 'economy',
  'Synthetic Concurrency Customer', 'synthetic-concurrency@example.test',
  '+00000000000', 'Synthetic concurrency test only'
);
```

## Observer: confirm the advisory lock wait

While Session B's RPC is running, execute this read-only query in the optional observer terminal. If using only two terminals, run `RESET ROLE;` in Session A (this does not commit or release its transaction locks), then run the query there:

```sql
SELECT a.pid, a.application_name, a.state, a.wait_event_type, a.wait_event,
       l.locktype, l.granted, left(a.query, 180) AS active_query
FROM pg_stat_activity AS a
JOIN pg_locks AS l ON l.pid = a.pid
WHERE a.application_name = 'luskam-9g-5ad760eb-c22e-4a4e-a312-116c56dd4538-B'
  AND l.locktype = 'advisory'
  AND NOT l.granted
  AND a.wait_event_type = 'Lock'
  AND a.wait_event = 'advisory'
  AND a.query ILIKE '%create_flight_quote_request_once%';
```

Require one row showing Session B waiting on an ungranted advisory lock for this RPC. If there is no row, repeat the query. For continuous polling, enter `\watch 1` in `psql` and press Ctrl+C after the row appears; that cancels only the observer query. Do not commit Session A until the wait is visible.

## Release and check the result

After the observer confirms the wait, enter `COMMIT;` in Session A. Session B should return `outcome = duplicate` and Session A's reference, `LTA-20261017-C98E80CF3B61973C`. Its own reference must not be created. Then enter `ROLLBACK;` in Session B; do not commit it.

If Session A does not return `created`, Session B does not wait, or Session B returns any other result, the test failed. If Session A has not committed, roll back both sessions. If Session A has committed, do not retry with these identifiers; run the read-only verification below before considering cleanup. If a connection drops or a statement times out, do not assume success or rollback; inspect the exact records first. Never broaden cleanup filters.

## Read-only verification

After Session B has rolled back, run these queries from the privileged staging connection. Expected: one Session A row, zero Session B rows, one active claim pointing to Session A's reference, and a matching hash.

```sql
SELECT
  count(*) FILTER (WHERE reference = 'LTA-20261017-C98E80CF3B61973C'
    AND idempotency_key = '39a4ed4c-02f2-4158-9bdf-190e6b0191f7'::uuid) AS session_a_rows,
  count(*) FILTER (WHERE reference = 'LTA-20261017-806F9724323B21A8'
    OR idempotency_key = '9b46eae5-8e89-4abf-b29b-f2c8b057419b'::uuid) AS session_b_rows
FROM public.flight_quote_requests
WHERE reference IN ('LTA-20261017-C98E80CF3B61973C', 'LTA-20261017-806F9724323B21A8')
   OR idempotency_key IN (
     '39a4ed4c-02f2-4158-9bdf-190e6b0191f7'::uuid,
     '9b46eae5-8e89-4abf-b29b-f2c8b057419b'::uuid
   );

SELECT count(*) AS active_claims,
       min(reference) AS claimed_reference,
       bool_and(request_hash = '7I4wJzuA6-aPoyGG068gLi6EYBdBt2Uzkh7j9QRbK-E') AS hash_matches
FROM private.flight_quote_dedupe_claims
WHERE dedupe_key = '7I4wJzuA6-aPoyGG068gLi6EYBdBt2Uzkh7j9QRbK-E'
  AND expires_at > pg_catalog.clock_timestamp();
```

Expected values: `session_a_rows = 1`, `session_b_rows = 0`, `active_claims = 1`, `claimed_reference = LTA-20261017-C98E80CF3B61973C`, and `hash_matches = true`. Do not clean up if any result differs.

## Guarded cleanup

Cleanup is a separate explicit transaction because Session A must commit for Session B to observe its result. Confirm the dashboard still shows staging project `ikbffvqkxwhkwlocjufc` and the read-only verification matches before running this script.

The script checks the exact synthetic request and claim before deleting either. It deletes only Session A's request and matching private claim, then checks that neither session's request or claim remains. It prints `READY_TO_COMMIT` only if every check succeeds. After inspecting that notice, enter `COMMIT;` manually. If any guard fails, enter `ROLLBACK;` and investigate; do not widen the filters.

```sql
BEGIN;
DO $$
DECLARE request_rows integer; claim_rows integer;
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Unexpected cleanup role %', current_user;
  END IF;

  SELECT count(*) INTO request_rows
  FROM public.flight_quote_requests
  WHERE reference = 'LTA-20261017-C98E80CF3B61973C'
    AND idempotency_key = '39a4ed4c-02f2-4158-9bdf-190e6b0191f7'::uuid
    AND request_hash = '7I4wJzuA6-aPoyGG068gLi6EYBdBt2Uzkh7j9QRbK-E'
    AND dedupe_key = '7I4wJzuA6-aPoyGG068gLi6EYBdBt2Uzkh7j9QRbK-E'
    AND origin = 'LUN' AND destination = 'JNB'
    AND departure_date = DATE '2027-12-15' AND return_date IS NULL
    AND trip_type = 'oneway' AND adults = 1 AND children = 0 AND infants = 0
    AND cabin_class = 'economy' AND status = 'pending'
    AND customer_name = 'Synthetic Concurrency Customer'
    AND customer_email = 'synthetic-concurrency@example.test'
    AND customer_phone = '+00000000000'
    AND special_requests = 'Synthetic concurrency test only';
  IF request_rows <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one exact Session A synthetic request; found %', request_rows;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.flight_quote_requests
    WHERE reference = 'LTA-20261017-806F9724323B21A8'
       OR idempotency_key = '9b46eae5-8e89-4abf-b29b-f2c8b057419b'::uuid
  ) THEN
    RAISE EXCEPTION 'Unexpected Session B request exists; stop and inspect manually';
  END IF;

  SELECT count(*) INTO claim_rows
  FROM private.flight_quote_dedupe_claims
  WHERE dedupe_key = '7I4wJzuA6-aPoyGG068gLi6EYBdBt2Uzkh7j9QRbK-E'
    AND request_hash = '7I4wJzuA6-aPoyGG068gLi6EYBdBt2Uzkh7j9QRbK-E'
    AND reference = 'LTA-20261017-C98E80CF3B61973C';
  IF claim_rows <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one matching Session A dedupe claim; found %', claim_rows;
  END IF;

  DELETE FROM public.flight_quote_requests
  WHERE reference = 'LTA-20261017-C98E80CF3B61973C'
    AND idempotency_key = '39a4ed4c-02f2-4158-9bdf-190e6b0191f7'::uuid
    AND request_hash = '7I4wJzuA6-aPoyGG068gLi6EYBdBt2Uzkh7j9QRbK-E'
    AND dedupe_key = '7I4wJzuA6-aPoyGG068gLi6EYBdBt2Uzkh7j9QRbK-E'
    AND origin = 'LUN' AND destination = 'JNB'
    AND departure_date = DATE '2027-12-15' AND return_date IS NULL
    AND trip_type = 'oneway' AND adults = 1 AND children = 0 AND infants = 0
    AND cabin_class = 'economy' AND status = 'pending'
    AND customer_name = 'Synthetic Concurrency Customer'
    AND customer_email = 'synthetic-concurrency@example.test';
  GET DIAGNOSTICS request_rows = ROW_COUNT;
  IF request_rows <> 1 THEN
    RAISE EXCEPTION 'Expected to delete exactly one exact Session A request; deleted %', request_rows;
  END IF;

  DELETE FROM private.flight_quote_dedupe_claims
  WHERE dedupe_key = '7I4wJzuA6-aPoyGG068gLi6EYBdBt2Uzkh7j9QRbK-E'
    AND request_hash = '7I4wJzuA6-aPoyGG068gLi6EYBdBt2Uzkh7j9QRbK-E'
    AND reference = 'LTA-20261017-C98E80CF3B61973C';
  GET DIAGNOSTICS claim_rows = ROW_COUNT;
  IF claim_rows <> 1 THEN
    RAISE EXCEPTION 'Expected to delete exactly one matching dedupe claim; deleted %', claim_rows;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.flight_quote_requests
    WHERE reference IN ('LTA-20261017-C98E80CF3B61973C', 'LTA-20261017-806F9724323B21A8')
       OR idempotency_key IN (
         '39a4ed4c-02f2-4158-9bdf-190e6b0191f7'::uuid,
         '9b46eae5-8e89-4abf-b29b-f2c8b057419b'::uuid
       )
  ) OR EXISTS (
    SELECT 1 FROM private.flight_quote_dedupe_claims
    WHERE dedupe_key = '7I4wJzuA6-aPoyGG068gLi6EYBdBt2Uzkh7j9QRbK-E'
  ) THEN
    RAISE EXCEPTION 'Synthetic request or dedupe claim remains after cleanup';
  END IF;

  RAISE NOTICE 'READY_TO_COMMIT: exact synthetic request and claim removed; no matching rows remain';
END;
$$;
-- Only after confirming READY_TO_COMMIT, enter COMMIT; manually.
-- Otherwise enter ROLLBACK; and investigate.
```

This is explicit test-data cleanup, not application behavior. Never reuse the hash/key. If any verification or cleanup guard fails, leave the records for review rather than widening a deletion.
