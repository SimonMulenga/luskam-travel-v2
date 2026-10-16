-- Session A: staging-only concurrency fixture. Use a persistent interactive connection.
-- Verify project ikbffvqkxwhkwlocjufc and the synthetic customer before running.
-- These fixture identifiers are unique for this prepared run; replace them in
-- both Session A and Session B before any rerun, including the reference UUID.
-- Use a fresh dedicated connection with no unrelated open transaction.
-- Do not run this file in a one-shot connection: it intentionally leaves BEGIN open.
-- After Session B is visibly blocked on replay lookup, enter COMMIT in this session.

BEGIN;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

SELECT set_config('phase9d.concurrent_user', '2e33f3a7-61e6-4971-8c2e-4dc817df7937', true);
SELECT set_config('phase9d.concurrent_nonce', 'aabf8133-3ff1-4a6c-8b7c-c0fd91a02e01', true);
SELECT set_config('phase9d.concurrent_key', 'bb0d3584-8aab-4e9e-8442-84badd9aa102', true);
SELECT set_config('phase9d.concurrent_hash', repeat('e', 43), true);
SELECT set_config('phase9d.concurrent_reference', 'PHASE9D-STAGING-7a4edeb7-bfd3-4d80-aac5-1bb8e0bdc202', true);

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
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE reference = current_setting('phase9d.concurrent_reference')
  ) OR EXISTS (
    SELECT 1 FROM private.booking_quote_claims
    WHERE user_id = current_setting('phase9d.concurrent_user')::uuid
      AND quote_nonce = current_setting('phase9d.concurrent_nonce')::uuid
  ) THEN
    RAISE EXCEPTION 'Fixture reference or nonce already exists; generate fresh shared identifiers';
  END IF;
END;
$$;

SELECT set_config('phase9d.concurrent_expiry', (clock_timestamp() + interval '60 seconds')::text, true);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
BEGIN
  IF current_user <> 'service_role' OR auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Expected service_role database role and JWT claim';
  END IF;
END;
$$;

DO $$
BEGIN
  IF current_setting('phase9d.concurrent_expiry')::timestamptz <= clock_timestamp() + interval '30 seconds' THEN
    RAISE EXCEPTION 'Quote expiry is too close; restart with fresh shared fixture identifiers';
  END IF;
END;
$$;

SELECT set_config(
  'phase9d.created_result',
  public.create_flight_booking_request_once(
    current_setting('phase9d.concurrent_user')::uuid,
    current_setting('phase9d.concurrent_nonce')::uuid,
    current_setting('phase9d.concurrent_key')::uuid,
    current_setting('phase9d.concurrent_hash'),
    current_setting('phase9d.concurrent_expiry')::timestamptz,
    current_setting('phase9d.concurrent_reference'),
    123.45, 'USD', current_date + 30,
    '{"requestOnly":true,"synthetic":true,"test_only":true}'::jsonb
  )::text,
  true
);

DO $$
DECLARE result jsonb;
BEGIN
  result := current_setting('phase9d.created_result')::jsonb;
  IF result ->> 'outcome' IS DISTINCT FROM 'created'
     OR result #>> '{booking,status}' IS DISTINCT FROM 'pending'
     OR result #>> '{booking,payment_status}' IS DISTINCT FROM 'pending'
     OR result #>> '{booking,reference}' IS DISTINCT FROM current_setting('phase9d.concurrent_reference') THEN
    RAISE EXCEPTION 'Session A did not create the expected pending synthetic request: %', result;
  END IF;
END;
$$;

SELECT current_setting('phase9d.created_result')::jsonb AS session_a_created_result,
       current_setting('phase9d.concurrent_expiry')::timestamptz AS exact_shared_quote_expiry,
       pg_backend_pid() AS session_a_backend_pid;

SELECT pg_sleep(70);
-- Keep this transaction open. Session B reads the exact expiry from the claim.
