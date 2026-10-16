-- Rollback-only checks for the Phase 9D service-role RPCs. Staging only.
-- Replace the customer UID with an existing synthetic staging Auth user.
-- Run from Supabase SQL Editor as postgres/supabase_admin. Do not add COMMIT.

BEGIN;
SELECT set_config('phase9d.user_id', '2e33f3a7-61e6-4971-8c2e-4dc817df7937', true);
SELECT set_config('phase9d.rate_user_id', gen_random_uuid()::text, true);
SELECT set_config('phase9d.quote_nonce', gen_random_uuid()::text, true);
SELECT set_config('phase9d.idempotency_key', gen_random_uuid()::text, true);
SELECT set_config('phase9d.booking_reference', 'PHASE9D-ROLLBACK-' || gen_random_uuid()::text, true);
SELECT set_config('phase9d.expired_nonce', gen_random_uuid()::text, true);
SELECT set_config('phase9d.expired_key', gen_random_uuid()::text, true);
SELECT set_config('phase9d.failed_nonce', gen_random_uuid()::text, true);
SELECT set_config('phase9d.failed_key', gen_random_uuid()::text, true);
SELECT set_config('phase9d.collision_reference', 'PHASE9D-COLLISION-' || gen_random_uuid()::text, true);
SELECT set_config('phase9d.failed_retry_reference', 'PHASE9D-RETRY-' || gen_random_uuid()::text, true);

DO $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Unexpected SQL Editor role %; stop before running tests', current_user;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase9d.user_id')::uuid) THEN
    RAISE EXCEPTION 'Configured synthetic customer is not present in staging Auth';
  END IF;
END;
$$;

-- This synthetic row forces the trusted booking INSERT to fail after its
-- nonce claim is attempted. The surrounding transaction rolls it back.
INSERT INTO public.bookings
  (user_id, reference, type, status, payment_status, total_amount, currency, details)
VALUES
  (current_setting('phase9d.user_id')::uuid, current_setting('phase9d.collision_reference'),
   'flight', 'pending', 'pending', 1, 'USD', '{"synthetic":true,"test_only":true}'::jsonb);

-- Browser roles must not be able to execute either privileged RPC.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('phase9d.user_id'))::text, true);
DO $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.consume_booking_edge_rate_limit(current_setting('phase9d.user_id')::uuid, 'quote', 1, 60);
  EXCEPTION WHEN SQLSTATE '42501' THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Authenticated caller executed rate-limit RPC'; END IF;
  rejected := false;
  BEGIN
    PERFORM public.resolve_flight_booking_request_replay(
      current_setting('phase9d.user_id')::uuid, current_setting('phase9d.quote_nonce')::uuid,
      current_setting('phase9d.idempotency_key')::uuid, repeat('a',43)
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Authenticated caller executed replay lookup RPC'; END IF;
  rejected := false;
  BEGIN
    PERFORM public.create_flight_booking_request_once(
      current_setting('phase9d.user_id')::uuid, current_setting('phase9d.quote_nonce')::uuid,
      current_setting('phase9d.idempotency_key')::uuid, repeat('a',43), now() + interval '5 minutes',
      'FORGED', 100, 'USD', current_date + 30, '{"requestOnly":true}'::jsonb
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Authenticated caller executed booking creation RPC'; END IF;
END;
$$;
RESET ROLE;

-- Exercise replay and rate semantics through the same service role used by the
-- Edge Function. This synthetic booking and all limiter rows are rolled back.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
DECLARE first_result jsonb; replay_result jsonb; conflict_result jsonb; rate1 jsonb; rate2 jsonb; rate3 jsonb;
  replay_lookup jsonb; expired_result jsonb; recovered_result jsonb; failed_retry jsonb;
  failed_as_expected boolean := false;
BEGIN
  first_result := public.create_flight_booking_request_once(
    current_setting('phase9d.user_id')::uuid, current_setting('phase9d.quote_nonce')::uuid,
    current_setting('phase9d.idempotency_key')::uuid, repeat('a',43), now() + interval '5 minutes',
    current_setting('phase9d.booking_reference'), 123.45, 'USD', current_date + 30,
    '{"requestOnly":true,"synthetic":true}'::jsonb
  );
  IF first_result ->> 'outcome' <> 'created' OR first_result #>> '{booking,status}' <> 'pending'
     OR first_result #>> '{booking,payment_status}' <> 'pending' THEN
    RAISE EXCEPTION 'Trusted Option A booking creation did not return a pending request';
  END IF;

  replay_lookup := public.resolve_flight_booking_request_replay(
    current_setting('phase9d.user_id')::uuid, current_setting('phase9d.quote_nonce')::uuid,
    current_setting('phase9d.idempotency_key')::uuid, repeat('a',43)
  );
  IF replay_lookup ->> 'outcome' <> 'replay'
     OR replay_lookup #>> '{booking,id}' <> first_result #>> '{booking,id}' THEN
    RAISE EXCEPTION 'Replay preflight did not find the existing request';
  END IF;

  replay_result := public.create_flight_booking_request_once(
    current_setting('phase9d.user_id')::uuid, current_setting('phase9d.quote_nonce')::uuid,
    current_setting('phase9d.idempotency_key')::uuid, repeat('a',43), now() + interval '5 minutes',
    current_setting('phase9d.booking_reference'), 999.99, 'USD', current_date + 30,
    '{"requestOnly":true,"synthetic":true}'::jsonb
  );
  IF replay_result ->> 'outcome' <> 'replay'
     OR replay_result #>> '{booking,id}' <> first_result #>> '{booking,id}' THEN
    RAISE EXCEPTION 'Same customer, nonce, key and request did not return the existing booking';
  END IF;

  -- A successful request remains replayable when its signed quote has expired.
  replay_result := public.create_flight_booking_request_once(
    current_setting('phase9d.user_id')::uuid, current_setting('phase9d.quote_nonce')::uuid,
    current_setting('phase9d.idempotency_key')::uuid, repeat('a',43), now() - interval '1 second',
    'PHASE9D-EXPIRED-REPLAY-' || gen_random_uuid()::text, 999.99, 'USD', current_date + 30,
    '{"requestOnly":true,"synthetic":true}'::jsonb
  );
  IF replay_result ->> 'outcome' <> 'replay'
     OR replay_result #>> '{booking,id}' <> first_result #>> '{booking,id}' THEN
    RAISE EXCEPTION 'Identical retry after quote expiry did not return the existing booking';
  END IF;

  conflict_result := public.create_flight_booking_request_once(
    current_setting('phase9d.user_id')::uuid, current_setting('phase9d.quote_nonce')::uuid,
    gen_random_uuid(), repeat('a',43), now() + interval '5 minutes',
    'PHASE9D-SECOND-' || gen_random_uuid()::text, 123.45, 'USD', current_date + 30,
    '{"requestOnly":true,"synthetic":true}'::jsonb
  );
  IF conflict_result ->> 'outcome' <> 'conflict' THEN
    RAISE EXCEPTION 'A quote nonce was accepted with a different idempotency key';
  END IF;

  conflict_result := public.create_flight_booking_request_once(
    current_setting('phase9d.user_id')::uuid, current_setting('phase9d.quote_nonce')::uuid,
    current_setting('phase9d.idempotency_key')::uuid, repeat('b',43), now() + interval '5 minutes',
    'PHASE9D-CHANGED-' || gen_random_uuid()::text, 123.45, 'USD', current_date + 30,
    '{"requestOnly":true,"synthetic":true}'::jsonb
  );
  IF conflict_result ->> 'outcome' <> 'conflict' THEN
    RAISE EXCEPTION 'A quote nonce was accepted with a different request hash';
  END IF;

  -- An expired unused nonce is rejected without consuming it.
  expired_result := public.create_flight_booking_request_once(
    current_setting('phase9d.user_id')::uuid, current_setting('phase9d.expired_nonce')::uuid,
    current_setting('phase9d.expired_key')::uuid, repeat('c',43), now() - interval '1 second',
    'PHASE9D-EXPIRED-UNUSED-' || gen_random_uuid()::text, 123.45, 'USD', current_date + 30,
    '{"requestOnly":true,"synthetic":true}'::jsonb
  );
  IF expired_result ->> 'outcome' <> 'conflict' THEN
    RAISE EXCEPTION 'An expired quote with no existing claim created a booking';
  END IF;
  recovered_result := public.create_flight_booking_request_once(
    current_setting('phase9d.user_id')::uuid, current_setting('phase9d.expired_nonce')::uuid,
    current_setting('phase9d.expired_key')::uuid, repeat('c',43), now() + interval '5 minutes',
    'PHASE9D-EXPIRED-RECOVERY-' || gen_random_uuid()::text, 123.45, 'USD', current_date + 30,
    '{"requestOnly":true,"synthetic":true}'::jsonb
  );
  IF recovered_result ->> 'outcome' <> 'created' THEN
    RAISE EXCEPTION 'Expired unused quote rejection left a claim that blocked a later valid quote';
  END IF;

  -- The duplicate reference causes a real bookings INSERT failure after the
  -- claim is acquired. The exception subtransaction must roll that claim back.
  BEGIN
    PERFORM public.create_flight_booking_request_once(
      current_setting('phase9d.user_id')::uuid, current_setting('phase9d.failed_nonce')::uuid,
      current_setting('phase9d.failed_key')::uuid, repeat('d',43), now() + interval '5 minutes',
      current_setting('phase9d.collision_reference'), 123.45, 'USD', current_date + 30,
      '{"requestOnly":true,"synthetic":true}'::jsonb
    );
  EXCEPTION WHEN unique_violation THEN
    failed_as_expected := true;
  END;
  IF NOT failed_as_expected THEN RAISE EXCEPTION 'Synthetic booking INSERT failure was not triggered'; END IF;
  failed_retry := public.create_flight_booking_request_once(
    current_setting('phase9d.user_id')::uuid, current_setting('phase9d.failed_nonce')::uuid,
    current_setting('phase9d.failed_key')::uuid, repeat('d',43), now() + interval '5 minutes',
    current_setting('phase9d.failed_retry_reference'), 123.45, 'USD', current_date + 30,
    '{"requestOnly":true,"synthetic":true}'::jsonb
  );
  IF failed_retry ->> 'outcome' <> 'created' THEN
    RAISE EXCEPTION 'Failed booking creation left a consumed nonce and prevented safe retry';
  END IF;

  -- Use a day-long test window and require at least 60 seconds remaining
  -- after the first call. This avoids a false failure if SQL Editor execution
  -- straddles a short fixed-window boundary. Production windows are configured
  -- by the Edge Function; this checks the RPC's atomic counter contract.
  rate1 := public.consume_booking_edge_rate_limit(current_setting('phase9d.rate_user_id')::uuid, 'quote', 2, 86400);
  rate2 := public.consume_booking_edge_rate_limit(current_setting('phase9d.rate_user_id')::uuid, 'quote', 2, 86400);
  rate3 := public.consume_booking_edge_rate_limit(current_setting('phase9d.rate_user_id')::uuid, 'quote', 2, 86400);
  IF jsonb_typeof(rate1 -> 'allowed') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(rate2 -> 'allowed') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(rate3 -> 'allowed') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(rate1 -> 'retry_after_seconds') IS DISTINCT FROM 'number'
     OR jsonb_typeof(rate2 -> 'retry_after_seconds') IS DISTINCT FROM 'number'
     OR jsonb_typeof(rate3 -> 'retry_after_seconds') IS DISTINCT FROM 'number'
     OR rate1 ->> 'allowed' IS DISTINCT FROM 'true'
     OR rate2 ->> 'allowed' IS DISTINCT FROM 'true'
     OR rate3 ->> 'allowed' IS DISTINCT FROM 'false'
     OR (rate1 ->> 'retry_after_seconds')::integer < 60
     OR (rate3 ->> 'retry_after_seconds')::integer < 1 THEN
    RAISE EXCEPTION 'Persistent rate-limit contract failed: rate1=%, rate2=%, rate3=%', rate1, rate2, rate3;
  END IF;
END;
$$;
RESET ROLE;

SELECT 'PASS: non-service roles denied privileged rate-limit and booking RPCs' AS result;
SELECT 'PASS: request creation is pending and same-nonce retry is idempotent' AS result;
SELECT 'PASS: identical retry after expiry replays; changed key/hash conflicts' AS result;
SELECT 'PASS: expired unused quote is rejected without consuming its nonce' AS result;
SELECT 'PASS: failed booking insert rolls back the claim and permits retry' AS result;
SELECT 'PASS: rate limiter allows configured requests then returns retry interval' AS result;
ROLLBACK;
