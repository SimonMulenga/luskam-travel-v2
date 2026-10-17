# Flight quotation RPC concurrency check (staging only)

This two-session check verifies PostgreSQL advisory-lock serialization for the
new service-only `create_flight_quote_request_once` RPC. It is not a frontend
or gateway-IP spoof test. Use only after both Phase 9G migrations are applied
to the isolated staging project. Use two independent persistent `psql`
connections, not two SQL Editor tabs whose transaction lifetime is uncertain.

Use a unique synthetic idempotency UUID for each session, the **same** 43-byte
request hash and dedupe key, and different references. The hash and dedupe key
must be generated from the same synthetic canonical request, with no real
contact details. Keep all values unique to this run. Session A must commit so
Session B can observe the result; clean up only the exact synthetic rows after
recording both results.

## Session A

Replace the UUID/key values with fresh values. Begin the transaction and leave
it open after the sleep. The displayed result must say `created`.

```sql
BEGIN;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT public.create_flight_quote_request_once(
  '11111111-1111-4111-8111-111111111111', repeat('a', 43), repeat('a', 43),
  'LTA-20991231-AAAAAAAAAAAAAAAA', 'LUN', 'JNB', current_date + 30, NULL,
  'oneway', 1, 0, 0, 'economy', 'Synthetic Concurrency Customer',
  'synthetic-concurrency@example.test', '+260 977 000 111', 'synthetic concurrency test'
);
SELECT pg_sleep(12);
-- Keep this transaction open until Session B is waiting, then COMMIT.
```

## Session B

Start while Session A is sleeping. Use a different idempotency key and
reference, but exactly the same dedupe key/hash and normalized request fields.
Confirm it blocks on the advisory transaction lock. From a third observer
connection, `pg_stat_activity.wait_event_type` should be `Lock` for Session B;
`pg_locks` should show an ungranted advisory lock. Do not commit Session A
until that wait is observed.

```sql
BEGIN;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT public.create_flight_quote_request_once(
  '22222222-2222-4222-8222-222222222222', repeat('a', 43), repeat('a', 43),
  'LTA-20991231-BBBBBBBBBBBBBBBB', 'LUN', 'JNB', current_date + 30, NULL,
  'oneway', 1, 0, 0, 'economy', 'Synthetic Concurrency Customer',
  'synthetic-concurrency@example.test', '+260 977 000 111', 'synthetic concurrency test'
);
```

After Session B is observed waiting, issue `COMMIT;` in Session A. Session B
must return `outcome=duplicate` and the exact reference from Session A. Then
`ROLLBACK;` Session B. Inspect as the privileged SQL Editor role and verify
exactly one row exists for the Session A reference, exactly one active private
dedupe claim exists, and both references were not created.

## Cleanup after verification

Use the privileged SQL Editor role in a fresh transaction. Replace the
dedupe-key and reference placeholders with the exact values from this run.
The guard aborts if the reference does not carry the test-only prefix.

```sql
BEGIN;
DO $$
DECLARE removed_rows integer;
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Unexpected cleanup role %', current_user;
  END IF;
  IF 'LTA-20991231-AAAAAAAAAAAAAAAA' !~ '^LTA-20991231-[A-F0-9]{16}$' THEN
    RAISE EXCEPTION 'Reference is not a tagged synthetic test reference';
  END IF;
  DELETE FROM public.flight_quote_requests
  WHERE reference = 'LTA-20991231-AAAAAAAAAAAAAAAA'
    AND customer_email = 'synthetic-concurrency@example.test'
    AND customer_name = 'Synthetic Concurrency Customer';
  GET DIAGNOSTICS removed_rows = ROW_COUNT;
  IF removed_rows <> 1 THEN RAISE EXCEPTION 'Expected one exact fixture row, deleted %', removed_rows; END IF;
  DELETE FROM private.flight_quote_dedupe_claims
  WHERE dedupe_key = repeat('a', 43)
    AND request_hash = repeat('a', 43)
    AND reference = 'LTA-20991231-AAAAAAAAAAAAAAAA';
  GET DIAGNOSTICS removed_rows = ROW_COUNT;
  IF removed_rows <> 1 THEN RAISE EXCEPTION 'Expected one exact fixture claim, deleted %', removed_rows; END IF;
  IF EXISTS (SELECT 1 FROM public.flight_quote_requests WHERE reference IN
       ('LTA-20991231-AAAAAAAAAAAAAAAA', 'LTA-20991231-BBBBBBBBBBBBBBBB'))
     OR EXISTS (SELECT 1 FROM private.flight_quote_dedupe_claims WHERE dedupe_key = repeat('a', 43)) THEN
    RAISE EXCEPTION 'Synthetic concurrency records remain';
  END IF;
END;
$$;
COMMIT;
```

If a lock wait is not observed, do not commit or broaden the test. Roll back
both sessions and investigate. This procedure is prepared only and has not
been executed.
