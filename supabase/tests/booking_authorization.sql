\set ON_ERROR_STOP on
-- Phase 7-8 booking authorization verification.
-- NOT VERIFIED here: no isolated PostgreSQL/Supabase instance is installed.
-- Run ONLY against a disposable local Supabase database with seed test records.
-- The transaction is rolled back. Never point this script at production.
-- Required psql variables: local_test_confirm=LOCAL_ONLY,
-- customer_a_id, customer_b_id, customer_a_booking_id, customer_b_booking_id,
-- customer_a_flight_booking_id, admin_id, admin_booking_id.
-- Example:
-- psql "$LOCAL_SUPABASE_DB_URL" -v local_test_confirm=LOCAL_ONLY \
--   -v customer_a_id=... -v customer_b_id=... \
--   -v customer_a_booking_id=... -v customer_b_booking_id=... \
--   -v customer_a_flight_booking_id=... -v admin_id=... \
--   -v admin_booking_id=... -f supabase/tests/booking_authorization.sql

\if :{?local_test_confirm}
\else
  \echo 'Set local_test_confirm=LOCAL_ONLY after confirming this is a disposable local database.'
  \quit
\endif
\if :{?customer_a_id}
\else
  \echo 'Missing required seeded test-user and booking UUID variables.'
  \quit
\endif
\if :{?customer_b_id}
\else
  \echo 'Missing customer_b_id.'
  \quit
\endif
\if :{?customer_a_booking_id}
\else
  \echo 'Missing customer_a_booking_id.'
  \quit
\endif
\if :{?customer_b_booking_id}
\else
  \echo 'Missing customer_b_booking_id.'
  \quit
\endif
\if :{?customer_a_flight_booking_id}
\else
  \echo 'Missing customer_a_flight_booking_id.'
  \quit
\endif
\if :{?admin_id}
\else
  \echo 'Missing admin_id.'
  \quit
\endif
\if :{?admin_booking_id}
\else
  \echo 'Missing admin_booking_id.'
  \quit
\endif

BEGIN;
DO $$
BEGIN
  IF NOT has_table_privilege('service_role', 'public.bookings', 'UPDATE') THEN
    RAISE EXCEPTION 'service_role lost bookings UPDATE access';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.flight_bookings', 'UPDATE') THEN
    RAISE EXCEPTION 'service_role lost flight_bookings UPDATE access';
  END IF;
  IF has_table_privilege('authenticated', 'public.bookings', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated still has a direct booking INSERT path';
  END IF;
  IF has_table_privilege('authenticated', 'public.bookings', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated still has booking DELETE access';
  END IF;
  IF has_table_privilege('authenticated', 'public.flight_bookings', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated still has flight_bookings INSERT access';
  END IF;
  IF has_table_privilege('authenticated', 'public.flight_bookings', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated still has flight_bookings UPDATE access';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.bookings', 'INSERT') THEN
    RAISE EXCEPTION 'service_role lost trusted booking INSERT access';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.request_booking_cancellation(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cancellation RPC grant missing';
  END IF;
  IF has_function_privilege('anon', 'public.request_booking_cancellation(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anonymous cancellation RPC execution is granted';
  END IF;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('phase7.local_test_confirm', :'local_test_confirm', true);
SELECT set_config('phase7.customer_a_booking_id', :'customer_a_booking_id', true);
SELECT set_config('phase7.customer_b_booking_id', :'customer_b_booking_id', true);
SELECT set_config('phase7.customer_b_id', :'customer_b_id', true);
SELECT set_config('phase7.customer_a_flight_booking_id', :'customer_a_flight_booking_id', true);
SELECT set_config('phase7.admin_booking_id', :'admin_booking_id', true);
SELECT set_config('request.jwt.claim.sub', :'customer_a_id', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'customer_a_id', 'role', 'authenticated')::text, true);

DO $$
DECLARE
  a_booking uuid := current_setting('phase7.customer_a_booking_id')::uuid;
  b_booking uuid := current_setting('phase7.customer_b_booking_id')::uuid;
  fb_id uuid := current_setting('phase7.customer_a_flight_booking_id')::uuid;
  changed integer;
BEGIN
  IF current_setting('phase7.local_test_confirm') <> 'LOCAL_ONLY' THEN
    RAISE EXCEPTION 'Refusing to run: local test confirmation missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = a_booking) THEN
    RAISE EXCEPTION 'Customer A cannot read own booking';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE id = b_booking) THEN
    RAISE EXCEPTION 'Customer A can read Customer B booking';
  END IF;
  IF public.has_role(current_setting('phase7.customer_b_id')::uuid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Customer A can inspect Customer B role through has_role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.flight_bookings WHERE id = fb_id) THEN
    RAISE EXCEPTION 'Customer A cannot read own flight booking';
  END IF;

  -- All authenticated direct INSERTs are denied; pending-only RLS is insufficient
  -- because a customer can otherwise forge a payable total_amount.
  BEGIN
    INSERT INTO public.bookings (user_id, reference, type, total_amount, currency, details)
    VALUES (auth.uid(), 'PH8-' || gen_random_uuid()::text, 'package', 999999, 'USD', '{}'::jsonb);
    RAISE EXCEPTION 'Customer inserted a forged payable booking';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Column grants should reject financial, ownership, and provider-reference writes.
  BEGIN
    UPDATE public.bookings SET total_amount = total_amount + 1 WHERE id = a_booking;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 0 THEN RAISE EXCEPTION 'Customer changed total_amount'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.bookings SET user_id = current_setting('phase7.customer_b_id')::uuid WHERE id = a_booking;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 0 THEN RAISE EXCEPTION 'Customer changed booking ownership'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.bookings SET duffel_order_id = 'UNTRUSTED_TEST' WHERE id = a_booking;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 0 THEN RAISE EXCEPTION 'Customer changed provider order reference'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.flight_bookings SET provider_offer_id = 'UNTRUSTED_TEST' WHERE id = fb_id;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 0 THEN RAISE EXCEPTION 'Customer changed trusted flight provider reference'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Staff column-level status grants do not give customers an UPDATE row policy.
  BEGIN
    UPDATE public.bookings SET payment_status = 'paid' WHERE id = a_booking;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 0 THEN RAISE EXCEPTION 'Customer changed payment_status'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.bookings SET status = 'confirmed' WHERE id = a_booking;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 0 THEN RAISE EXCEPTION 'Customer changed booking confirmation status'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.bookings SET status = 'cancelled' WHERE id = b_booking;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 0 THEN RAISE EXCEPTION 'Customer A modified Customer B booking'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Owner cancellation is the sole customer status-change path.
  PERFORM public.request_booking_cancellation(a_booking);
  IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = a_booking AND status = 'cancelled') THEN
    RAISE EXCEPTION 'Owner cancellation RPC did not cancel eligible booking';
  END IF;
  BEGIN
    PERFORM public.request_booking_cancellation(b_booking);
    RAISE EXCEPTION 'Customer A cancelled Customer B booking';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END;
$$;

SELECT set_config('request.jwt.claim.sub', :'admin_id', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'admin_id', 'role', 'authenticated')::text, true);
DO $$
DECLARE
  booking_id uuid := current_setting('phase7.admin_booking_id')::uuid;
  changed integer;
BEGIN
  UPDATE public.bookings SET status = status WHERE id = booking_id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Authorized admin booking update failed'; END IF;
  UPDATE public.bookings SET payment_status = payment_status WHERE id = booking_id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Authorized admin payment update failed'; END IF;
END;
$$;

ROLLBACK;
