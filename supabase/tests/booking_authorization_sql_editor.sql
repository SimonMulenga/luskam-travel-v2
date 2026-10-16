-- SQL Editor booking authorization checks (staging only).
-- Verify the dashboard project ref is ikbffvqkxwhkwlocjufc before running.
-- Uses only the supplied synthetic staging identities and generated fixtures.
-- Inserts used to establish test records run as service_role inside this
-- transaction; authenticated and anon checks switch database roles and set
-- request JWT claims to simulate Supabase API requests.
-- All changes are rolled back. Do not add COMMIT.
-- This tests database permissions and cancellation RPC behavior. It does not
-- invoke or validate the create-booking-request Edge Function or live pricing.

BEGIN;

SELECT set_config('phase9c.customer_a_id', '2e33f3a7-61e6-4971-8c2e-4dc817df7937', true);
SELECT set_config('phase9c.customer_b_id', 'fcae4a89-7e69-4cbb-aa87-b666101fd815', true);
SELECT set_config('phase9c.admin_id', 'bd29f41b-24a2-48d5-b243-7462ab80fc60', true);
SELECT set_config('phase9c.booking_a_id', gen_random_uuid()::text, true);
SELECT set_config('phase9c.booking_b_id', gen_random_uuid()::text, true);
SELECT set_config('phase9c.paid_booking_a_id', gen_random_uuid()::text, true);
SELECT set_config('phase9c.direct_parent_id', gen_random_uuid()::text, true);
SELECT set_config('phase9c.flight_a_id', gen_random_uuid()::text, true);
SELECT set_config('phase9c.flight_b_id', gen_random_uuid()::text, true);
SELECT set_config('phase9c.direct_flight_id', gen_random_uuid()::text, true);

DO $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Unexpected SQL Editor role %; stop and review before testing', current_user;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase9c.customer_a_id')::uuid)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase9c.customer_b_id')::uuid)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase9c.admin_id')::uuid) THEN
    RAISE EXCEPTION 'All three supplied synthetic identities must exist in staging Auth';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id IN (current_setting('phase9c.customer_a_id')::uuid,
                      current_setting('phase9c.customer_b_id')::uuid)
      AND role IN ('admin'::public.app_role, 'agent'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Customer A and B must not have admin or agent roles';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = current_setting('phase9c.admin_id')::uuid
      AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Supplied staging administrator lacks the admin role';
  END IF;
  IF has_table_privilege('authenticated', 'public.bookings', 'INSERT')
     OR has_table_privilege('authenticated', 'public.bookings', 'DELETE') THEN
    RAISE EXCEPTION 'Authenticated direct booking INSERT/DELETE grants are broader than expected';
  END IF;
  IF has_table_privilege('authenticated', 'public.flight_bookings', 'INSERT')
     OR has_table_privilege('authenticated', 'public.flight_bookings', 'UPDATE') THEN
    RAISE EXCEPTION 'Authenticated flight_bookings INSERT/UPDATE grants are broader than expected';
  END IF;
  IF has_table_privilege('anon', 'public.bookings', 'SELECT')
     OR has_table_privilege('anon', 'public.bookings', 'INSERT')
     OR has_table_privilege('anon', 'public.flight_bookings', 'SELECT')
     OR has_table_privilege('anon', 'public.flight_bookings', 'INSERT') THEN
    RAISE EXCEPTION 'Anonymous booking table grants are broader than expected';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.request_booking_cancellation(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.request_booking_cancellation(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Cancellation RPC execution grants are not correctly scoped';
  END IF;
END;
$$;

-- Synthetic records are created through the trusted database role to establish
-- fixtures. This does not represent a supplier reservation or issued ticket.
SET LOCAL ROLE service_role;
INSERT INTO public.bookings
  (id, user_id, reference, type, status, payment_status, total_amount, currency, details)
VALUES
  (current_setting('phase9c.booking_a_id')::uuid,
   current_setting('phase9c.customer_a_id')::uuid,
   'PHASE9C-A-' || current_setting('phase9c.booking_a_id'), 'flight', 'pending', 'pending', 123.45, 'USD',
   '{"synthetic":true,"test_only":true}'::jsonb),
  (current_setting('phase9c.booking_b_id')::uuid,
   current_setting('phase9c.customer_b_id')::uuid,
   'PHASE9C-B-' || current_setting('phase9c.booking_b_id'), 'flight', 'pending', 'pending', 234.56, 'USD',
   '{"synthetic":true,"test_only":true}'::jsonb),
  (current_setting('phase9c.paid_booking_a_id')::uuid,
   current_setting('phase9c.customer_a_id')::uuid,
   'PHASE9C-PAID-' || current_setting('phase9c.paid_booking_a_id'), 'flight', 'pending', 'paid', 345.67, 'USD',
   '{"synthetic":true,"test_only":true}'::jsonb),
  (current_setting('phase9c.direct_parent_id')::uuid,
   current_setting('phase9c.customer_a_id')::uuid,
   'PHASE9C-DIRECT-' || current_setting('phase9c.direct_parent_id'), 'flight', 'pending', 'pending', 456.78, 'USD',
   '{"synthetic":true,"test_only":true}'::jsonb);

INSERT INTO public.flight_bookings
  (id, booking_id, user_id, provider, booking_status, payment_status, ticket_status,
   currency, supplier_total, markup_total, customer_total)
VALUES
  (current_setting('phase9c.flight_a_id')::uuid, current_setting('phase9c.booking_a_id')::uuid,
   current_setting('phase9c.customer_a_id')::uuid, 'none', 'REQUESTED', 'PENDING', 'NOT_ISSUED',
   'USD', 100, 23.45, 123.45),
  (current_setting('phase9c.flight_b_id')::uuid, current_setting('phase9c.booking_b_id')::uuid,
   current_setting('phase9c.customer_b_id')::uuid, 'none', 'REQUESTED', 'PENDING', 'NOT_ISSUED',
   'USD', 200, 34.56, 234.56);
RESET ROLE;

-- Anonymous requests must not read/create bookings or invoke cancellation.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
DECLARE visible_rows integer; operation_succeeded boolean := false;
BEGIN
  IF current_user <> 'anon' THEN RAISE EXCEPTION 'Expected database role anon, got %', current_user; END IF;
  IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Anonymous JWT unexpectedly resolves to a user'; END IF;
  BEGIN
    SELECT count(*) INTO visible_rows FROM public.bookings;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    visible_rows := 0;
  END;
  IF visible_rows <> 0 THEN RAISE EXCEPTION 'Anonymous user can read booking rows'; END IF;
  BEGIN
    SELECT count(*) INTO visible_rows FROM public.flight_bookings;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    visible_rows := 0;
  END;
  IF visible_rows <> 0 THEN RAISE EXCEPTION 'Anonymous user can read flight booking rows'; END IF;
  BEGIN
    INSERT INTO public.bookings (user_id, reference, type, status, payment_status, total_amount, currency)
    VALUES (current_setting('phase9c.customer_a_id')::uuid,
            'PHASE9C-ANON-' || gen_random_uuid()::text, 'flight', 'pending', 'pending', 1, 'USD');
    operation_succeeded := true;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    operation_succeeded := false;
  END;
  IF operation_succeeded THEN RAISE EXCEPTION 'Anonymous booking INSERT unexpectedly succeeded'; END IF;
  operation_succeeded := false;
  BEGIN
    PERFORM public.request_booking_cancellation(current_setting('phase9c.booking_a_id')::uuid);
    operation_succeeded := true;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    operation_succeeded := false;
  END;
  IF operation_succeeded THEN RAISE EXCEPTION 'Anonymous cancellation unexpectedly succeeded'; END IF;
END;
$$;
SELECT 'PASS: anonymous booking read, direct creation, and cancellation denied' AS result;

-- Customer A reads only its own booking data and cannot use direct write paths.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase9c.customer_a_id'), true);
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('phase9c.customer_a_id'), 'role', 'authenticated')::text, true);
DO $$
DECLARE visible_rows integer; changed_rows integer; operation_succeeded boolean;
BEGIN
  IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'Expected database role authenticated, got %', current_user; END IF;
  IF auth.uid() IS DISTINCT FROM current_setting('phase9c.customer_a_id')::uuid THEN
    RAISE EXCEPTION 'Customer A JWT claims do not resolve to expected auth.uid()';
  END IF;
  SELECT count(*) INTO visible_rows FROM public.bookings
  WHERE id = current_setting('phase9c.booking_a_id')::uuid;
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'Customer A cannot read own booking'; END IF;
  SELECT count(*) INTO visible_rows FROM public.bookings
  WHERE id = current_setting('phase9c.booking_b_id')::uuid;
  IF visible_rows <> 0 THEN RAISE EXCEPTION 'Customer A can read Customer B booking'; END IF;
  SELECT count(*) INTO visible_rows FROM public.flight_bookings
  WHERE id = current_setting('phase9c.flight_a_id')::uuid;
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'Customer A cannot read own flight booking'; END IF;
  SELECT count(*) INTO visible_rows FROM public.flight_bookings
  WHERE id = current_setting('phase9c.flight_b_id')::uuid;
  IF visible_rows <> 0 THEN RAISE EXCEPTION 'Customer A can read Customer B flight booking'; END IF;

  operation_succeeded := false;
  BEGIN
    INSERT INTO public.bookings
      (user_id, reference, type, status, payment_status, total_amount, currency)
    VALUES (auth.uid(), 'PHASE9C-FORGED-' || gen_random_uuid()::text,
            'flight', 'pending', 'pending', 999999, 'USD');
    operation_succeeded := true;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    operation_succeeded := false;
  END;
  IF operation_succeeded THEN RAISE EXCEPTION 'Customer directly inserted a trusted booking'; END IF;

  operation_succeeded := false;
  BEGIN
    INSERT INTO public.flight_bookings (booking_id, user_id, provider, ticket_status)
    VALUES (current_setting('phase9c.direct_parent_id')::uuid, auth.uid(), 'none', 'NOT_ISSUED');
    operation_succeeded := true;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    operation_succeeded := false;
  END;
  IF operation_succeeded THEN RAISE EXCEPTION 'Customer directly inserted a flight booking'; END IF;

  -- Customer has column grants for status and payment_status, but no customer
  -- UPDATE row policy. Zero rows or SQLSTATE 42501 is a denial; other errors
  -- propagate, and any affected row fails the test.
  changed_rows := 0;
  BEGIN
    UPDATE public.bookings SET status = 'confirmed'
    WHERE id = current_setting('phase9c.booking_a_id')::uuid;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
  EXCEPTION WHEN SQLSTATE '42501' THEN changed_rows := 0;
  END;
  IF changed_rows <> 0 THEN RAISE EXCEPTION 'Customer changed booking approval/confirmation status'; END IF;

  changed_rows := 0;
  BEGIN
    UPDATE public.bookings SET payment_status = 'paid'
    WHERE id = current_setting('phase9c.booking_a_id')::uuid;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
  EXCEPTION WHEN SQLSTATE '42501' THEN changed_rows := 0;
  END;
  IF changed_rows <> 0 THEN RAISE EXCEPTION 'Customer changed booking payment status'; END IF;

  operation_succeeded := false;
  BEGIN
    UPDATE public.bookings SET total_amount = 0.01
    WHERE id = current_setting('phase9c.booking_a_id')::uuid;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    operation_succeeded := changed_rows <> 0;
  EXCEPTION WHEN SQLSTATE '42501' THEN operation_succeeded := false;
  END;
  IF operation_succeeded THEN RAISE EXCEPTION 'Customer changed booking price'; END IF;

  operation_succeeded := false;
  BEGIN
    UPDATE public.bookings SET user_id = current_setting('phase9c.customer_b_id')::uuid
    WHERE id = current_setting('phase9c.booking_a_id')::uuid;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    operation_succeeded := changed_rows <> 0;
  EXCEPTION WHEN SQLSTATE '42501' THEN operation_succeeded := false;
  END;
  IF operation_succeeded THEN RAISE EXCEPTION 'Customer changed booking ownership'; END IF;

  changed_rows := 0;
  BEGIN
    UPDATE public.bookings SET status = 'cancelled'
    WHERE id = current_setting('phase9c.booking_b_id')::uuid;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
  EXCEPTION WHEN SQLSTATE '42501' THEN changed_rows := 0;
  END;
  IF changed_rows <> 0 THEN RAISE EXCEPTION 'Customer A changed Customer B booking status'; END IF;

  changed_rows := 0;
  BEGIN
    DELETE FROM public.bookings WHERE id = current_setting('phase9c.booking_b_id')::uuid;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
  EXCEPTION WHEN SQLSTATE '42501' THEN changed_rows := 0;
  END;
  IF changed_rows <> 0 THEN RAISE EXCEPTION 'Customer A deleted Customer B booking'; END IF;

  operation_succeeded := false;
  BEGIN
    UPDATE public.bookings SET duffel_order_id = 'SYNTHETIC-FORGED-ORDER'
    WHERE id = current_setting('phase9c.booking_a_id')::uuid;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    operation_succeeded := changed_rows <> 0;
  EXCEPTION WHEN SQLSTATE '42501' THEN operation_succeeded := false;
  END;
  IF operation_succeeded THEN RAISE EXCEPTION 'Customer changed provider order reference'; END IF;

  operation_succeeded := false;
  BEGIN
    UPDATE public.flight_bookings
    SET provider_offer_id = 'SYNTHETIC-FORGED-OFFER',
        provider_booking_reference = 'SYNTHETIC-FORGED-BOOKING',
        pnr = 'SYNTHETIC-PNR',
        ticket_status = 'ISSUED',
        payment_status = 'PAID',
        supplier_total = 0.01,
        customer_total = 0.01
    WHERE id = current_setting('phase9c.flight_a_id')::uuid;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    operation_succeeded := changed_rows <> 0;
  EXCEPTION WHEN SQLSTATE '42501' THEN operation_succeeded := false;
  END;
  IF operation_succeeded THEN RAISE EXCEPTION 'Customer changed flight provider, ticket, payment, or price fields'; END IF;

END;
$$;
SELECT 'PASS: Customer A reads own booking and flight booking only' AS result;
SELECT 'PASS: customer direct booking and flight booking INSERT denied' AS result;
SELECT 'PASS: customer approval, payment, price, ownership, provider, and ticket updates denied' AS result;
SELECT 'PASS: customer cannot change or delete another customer booking' AS result;

-- Keep these RPC attempts under Customer A's authenticated role. The second
-- and third calls must fail with the cancellation function's documented P0002.
DO $$
DECLARE operation_succeeded boolean;
BEGIN
  IF current_user <> 'authenticated'
     OR auth.uid() IS DISTINCT FROM current_setting('phase9c.customer_a_id')::uuid THEN
    RAISE EXCEPTION 'Cancellation attempts must run as authenticated Customer A';
  END IF;

  PERFORM public.request_booking_cancellation(current_setting('phase9c.booking_a_id')::uuid);
  IF NOT EXISTS (SELECT 1 FROM public.bookings
                 WHERE id = current_setting('phase9c.booking_a_id')::uuid AND status = 'cancelled') THEN
    RAISE EXCEPTION 'Owner cancellation RPC did not cancel eligible request';
  END IF;

  operation_succeeded := false;
  BEGIN
    PERFORM public.request_booking_cancellation(current_setting('phase9c.booking_b_id')::uuid);
    operation_succeeded := true;
  EXCEPTION WHEN SQLSTATE 'P0002' THEN operation_succeeded := false;
  END;
  IF operation_succeeded THEN RAISE EXCEPTION 'Customer A cancelled Customer B booking'; END IF;

  operation_succeeded := false;
  BEGIN
    PERFORM public.request_booking_cancellation(current_setting('phase9c.paid_booking_a_id')::uuid);
    operation_succeeded := true;
  EXCEPTION WHEN SQLSTATE 'P0002' THEN operation_succeeded := false;
  END;
  IF operation_succeeded THEN RAISE EXCEPTION 'Customer cancelled a paid booking'; END IF;

  -- Customer A owns this paid fixture, so this check is visible under its own RLS.
  IF NOT EXISTS (SELECT 1 FROM public.bookings
                 WHERE id = current_setting('phase9c.paid_booking_a_id')::uuid
                   AND status = 'pending' AND payment_status = 'paid') THEN
    RAISE EXCEPTION 'Paid booking changed during cancellation denial';
  END IF;
END;
$$;

-- Verify the cross-customer outcome under the original privileged test role,
-- after the RPC attempt has finished. Customer A never receives this role.
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'Expected service_role for fixture verification'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bookings
                 WHERE id = current_setting('phase9c.booking_b_id')::uuid
                   AND user_id = current_setting('phase9c.customer_b_id')::uuid
                   AND status = 'pending' AND payment_status = 'pending') THEN
    RAISE EXCEPTION 'Customer B booking changed during Customer A cancellation attempt';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bookings
                 WHERE id = current_setting('phase9c.paid_booking_a_id')::uuid
                   AND payment_status = 'paid' AND status = 'pending') THEN
    RAISE EXCEPTION 'Paid booking changed during Customer A cancellation attempt';
  END IF;
END;
$$;

-- Restore Customer A's API role and both JWT claim settings before continuing.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase9c.customer_a_id'), true);
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('phase9c.customer_a_id'), 'role', 'authenticated')::text, true);
DO $$
BEGIN
  IF current_user <> 'authenticated'
     OR auth.uid() IS DISTINCT FROM current_setting('phase9c.customer_a_id')::uuid THEN
    RAISE EXCEPTION 'Customer A authenticated role/JWT was not restored';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings
             WHERE id = current_setting('phase9c.booking_b_id')::uuid) THEN
    RAISE EXCEPTION 'Customer A can read Customer B booking after role restoration';
  END IF;
END;
$$;
SELECT 'PASS: owner cancellation succeeds only for own eligible unpaid request' AS result;
SELECT 'PASS: cross-customer and paid-booking cancellation denied and verified' AS result;

-- Admin staff policy permits the existing status/payment operations. This is
-- a no-op UPDATE against Customer B's synthetic record to verify authorization
-- without implying that a request is an airline reservation or paid ticket.
SELECT set_config('request.jwt.claim.sub', current_setting('phase9c.admin_id'), true);
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('phase9c.admin_id'), 'role', 'authenticated')::text, true);
DO $$
DECLARE changed_rows integer; visible_rows integer;
BEGIN
  IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'Expected database role authenticated, got %', current_user; END IF;
  IF auth.uid() IS DISTINCT FROM current_setting('phase9c.admin_id')::uuid THEN
    RAISE EXCEPTION 'Admin JWT claims do not resolve to expected auth.uid()';
  END IF;
  SELECT count(*) INTO visible_rows FROM public.bookings
  WHERE id = current_setting('phase9c.booking_b_id')::uuid;
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'Admin cannot read Customer B booking'; END IF;
  UPDATE public.bookings SET status = status
  WHERE id = current_setting('phase9c.booking_b_id')::uuid;
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN RAISE EXCEPTION 'Admin status update permission failed'; END IF;
  UPDATE public.bookings SET payment_status = payment_status
  WHERE id = current_setting('phase9c.booking_b_id')::uuid;
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN RAISE EXCEPTION 'Admin payment update permission failed'; END IF;
END;
$$;
SELECT 'PASS: authenticated staging admin can view bookings and perform permitted status/payment updates' AS result;

ROLLBACK;
