-- Session B: staging-only replay and conflict checks. Use a second persistent connection.
-- Start while Session A is open. The resolver call must visibly wait until A commits.
-- This script rolls back its transaction after all assertions.
-- Keep the customer, nonce, original key, hash, and original reference identical
-- to Session A. Replace those shared identifiers in both files before any rerun.
-- Use a fresh dedicated connection with no unrelated open transaction.

BEGIN;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

SELECT set_config('phase9d.concurrent_user', '2e33f3a7-61e6-4971-8c2e-4dc817df7937', true);
SELECT set_config('phase9d.concurrent_nonce', 'aabf8133-3ff1-4a6c-8b7c-c0fd91a02e01', true);
SELECT set_config('phase9d.concurrent_key', 'bb0d3584-8aab-4e9e-8442-84badd9aa102', true);
SELECT set_config('phase9d.concurrent_hash', repeat('e', 43), true);
SELECT set_config('phase9d.alternate_key', 'cc1e4b95-9bbc-4f0f-9553-95cceeabb203', true);

DO $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Unexpected SQL Editor/connection role %', current_user;
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Expected READ COMMITTED isolation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = current_setting('phase9d.concurrent_user')::uuid
  ) THEN
    RAISE EXCEPTION 'Synthetic staging customer does not exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = current_setting('phase9d.concurrent_user')::uuid
      AND role IN ('admin'::public.app_role, 'agent'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Concurrency test identity must not have admin or agent role';
  END IF;
END;
$$;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT pg_backend_pid() AS session_b_backend_pid;
DO $$
BEGIN
  IF current_user <> 'service_role' OR auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Expected service_role database role and JWT claim';
  END IF;
END;
$$;

-- This statement blocks on Session A's customer/nonce advisory transaction lock.
SELECT set_config(
  'phase9d.resolver_result',
  public.resolve_flight_booking_request_replay(
    current_setting('phase9d.concurrent_user')::uuid,
    current_setting('phase9d.concurrent_nonce')::uuid,
    current_setting('phase9d.concurrent_key')::uuid,
    current_setting('phase9d.concurrent_hash')
  )::text,
  true
);

DO $$
DECLARE result jsonb;
BEGIN
  result := current_setting('phase9d.resolver_result')::jsonb;
  IF result ->> 'outcome' IS DISTINCT FROM 'replay'
     OR result #>> '{booking,id}' IS NULL THEN
    RAISE EXCEPTION 'Resolver did not return the committed booking after waiting: %', result;
  END IF;
  PERFORM set_config('phase9d.concurrent_booking_id', result #>> '{booking,id}', true);
END;
$$;

-- Read the exact expiry stored by Session A, then return to service_role.
RESET ROLE;
DO $$
DECLARE expiry_count integer; exact_expiry timestamptz;
BEGIN
  SELECT count(*), min(quote_expires_at)
  INTO expiry_count, exact_expiry
  FROM private.booking_quote_claims
  WHERE user_id = current_setting('phase9d.concurrent_user')::uuid
    AND quote_nonce = current_setting('phase9d.concurrent_nonce')::uuid
    AND idempotency_key = current_setting('phase9d.concurrent_key')::uuid
    AND request_hash = current_setting('phase9d.concurrent_hash')
    AND booking_id = current_setting('phase9d.concurrent_booking_id')::uuid;
  IF expiry_count <> 1 OR exact_expiry IS NULL OR exact_expiry >= clock_timestamp() THEN
    RAISE EXCEPTION 'Expected exactly one matching claim with an expired quote; rows=% expiry=%', expiry_count, exact_expiry;
  END IF;
  PERFORM set_config('phase9d.concurrent_expiry', exact_expiry::text, true);
END;
$$;
SET LOCAL ROLE service_role;

SELECT set_config(
  'phase9d.retry_result',
  public.create_flight_booking_request_once(
    current_setting('phase9d.concurrent_user')::uuid,
    current_setting('phase9d.concurrent_nonce')::uuid,
    current_setting('phase9d.concurrent_key')::uuid,
    current_setting('phase9d.concurrent_hash'),
    current_setting('phase9d.concurrent_expiry')::timestamptz,
    'PHASE9D-REPLAY-7a4edeb7-bfd3-4d80-aac5-1bb8e0bdc202',
    999.99, 'USD', current_date + 30,
    '{"requestOnly":true,"synthetic":true,"test_only":true}'::jsonb
  )::text,
  true
);

SELECT set_config(
  'phase9d.changed_key_result',
  public.create_flight_booking_request_once(
    current_setting('phase9d.concurrent_user')::uuid,
    current_setting('phase9d.concurrent_nonce')::uuid,
    current_setting('phase9d.alternate_key')::uuid,
    current_setting('phase9d.concurrent_hash'),
    current_setting('phase9d.concurrent_expiry')::timestamptz,
    'PHASE9D-KEY-CONFLICT-7a4edeb7-bfd3-4d80-aac5-1bb8e0bdc202',
    999.99, 'USD', current_date + 30,
    '{"requestOnly":true,"synthetic":true,"test_only":true}'::jsonb
  )::text,
  true
);

SELECT set_config(
  'phase9d.changed_hash_result',
  public.create_flight_booking_request_once(
    current_setting('phase9d.concurrent_user')::uuid,
    current_setting('phase9d.concurrent_nonce')::uuid,
    current_setting('phase9d.concurrent_key')::uuid,
    repeat('f', 43),
    current_setting('phase9d.concurrent_expiry')::timestamptz,
    'PHASE9D-HASH-CONFLICT-7a4edeb7-bfd3-4d80-aac5-1bb8e0bdc202',
    999.99, 'USD', current_date + 30,
    '{"requestOnly":true,"synthetic":true,"test_only":true}'::jsonb
  )::text,
  true
);

DO $$
DECLARE result jsonb;
BEGIN
  result := current_setting('phase9d.retry_result')::jsonb;
  IF result ->> 'outcome' IS DISTINCT FROM 'replay'
     OR result #>> '{booking,id}' IS DISTINCT FROM current_setting('phase9d.concurrent_booking_id')
     OR result #>> '{booking,reference}' IS DISTINCT FROM 'PHASE9D-STAGING-7a4edeb7-bfd3-4d80-aac5-1bb8e0bdc202'
     OR (result #>> '{booking,total_amount}')::numeric IS DISTINCT FROM 123.45 THEN
    RAISE EXCEPTION 'Expired identical retry did not replay the original booking unchanged: %', result;
  END IF;
  IF current_setting('phase9d.changed_key_result')::jsonb ->> 'outcome' IS DISTINCT FROM 'conflict' THEN
    RAISE EXCEPTION 'Changed idempotency key was not rejected';
  END IF;
  IF current_setting('phase9d.changed_hash_result')::jsonb ->> 'outcome' IS DISTINCT FROM 'conflict' THEN
    RAISE EXCEPTION 'Changed request hash was not rejected';
  END IF;
END;
$$;

SELECT current_setting('phase9d.resolver_result')::jsonb AS resolver_result,
       current_setting('phase9d.retry_result')::jsonb AS identical_expired_retry_result,
       current_setting('phase9d.changed_key_result')::jsonb AS changed_key_result,
       current_setting('phase9d.changed_hash_result')::jsonb AS changed_hash_result,
       current_setting('phase9d.concurrent_booking_id') AS verified_booking_id,
       pg_backend_pid() AS session_b_backend_pid;

ROLLBACK;
