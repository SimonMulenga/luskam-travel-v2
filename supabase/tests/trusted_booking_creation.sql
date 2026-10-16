\set ON_ERROR_STOP on
-- DB permission smoke test for the trusted creation boundary.
-- This does NOT call or validate create-booking-request Edge Function logic.
-- Run only on a disposable local Supabase DB with a synthetic Auth customer.
-- Required psql vars: local_test_confirm=LOCAL_ONLY, customer_id.
-- Existing `booking_authorization.sql` covers cancellation and staff updates.
\if :{?local_test_confirm}
\else
  \echo 'Missing local_test_confirm=LOCAL_ONLY; refusing to continue.'
  \quit
\endif
\if :{?customer_id}
\else
  \echo 'Missing synthetic customer_id.'
  \quit
\endif
SELECT :'local_test_confirm' = 'LOCAL_ONLY' AS local_confirmed \gset
\if :local_confirmed
\else
  \echo 'Local confirmation did not match; refusing to continue.'
  \quit
\endif
SELECT gen_random_uuid() AS booking_id \gset

BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.bookings (id,user_id,reference,type,status,payment_status,total_amount,currency,details)
VALUES (:'booking_id'::uuid, :'customer_id'::uuid, 'STAGING-' || :'booking_id', 'flight', 'pending', 'pending', 0, 'USD', '{"synthetic":true,"quote_status":"unpriced_inquiry"}'::jsonb);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'customer_id', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'customer_id', 'role', 'authenticated')::text, true);
SELECT set_config('test.booking_id', :'booking_id', true);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id = current_setting('test.booking_id')::uuid
      AND status='pending' AND payment_status='pending' AND total_amount=0
  ) THEN
    RAISE EXCEPTION 'Customer cannot see the trusted synthetic request or its pending/unpriced state';
  END IF;
  BEGIN
    INSERT INTO public.bookings (user_id,reference,type,status,payment_status,total_amount,currency)
    VALUES (auth.uid(), 'FORGED-' || gen_random_uuid()::text, 'flight', 'pending', 'pending', 5000, 'USD');
    RAISE EXCEPTION 'Authenticated user inserted a forged payable booking';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
END;
$$;
ROLLBACK;
