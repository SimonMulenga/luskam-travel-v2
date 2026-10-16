-- SQL Editor cross-customer isolation check (staging only).
-- First verify dashboard project ref ikbffvqkxwhkwlocjufc. Replace the
-- Customer B placeholder below with a second synthetic staging Auth UID.
-- Script aborts before creating fixtures if the placeholder remains.
-- All fixture rows are inside a transaction that ends with ROLLBACK.
-- Do not add COMMIT.

BEGIN;

SELECT set_config('phase9b.customer_a_id', '2e33f3a7-61e6-4971-8c2e-4dc817df7937', true);
SELECT set_config('phase9b.customer_b_id', 'fcae4a89-7e69-4cbb-aa87-b666101fd815', true);
SELECT set_config('phase9b.quote_a_id', gen_random_uuid()::text, true);
SELECT set_config('phase9b.quote_b_id', gen_random_uuid()::text, true);

DO $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Unexpected SQL Editor role %; stop and review before testing', current_user;
  END IF;
  IF current_setting('phase9b.customer_b_id') = 'REPLACE_WITH_SYNTHETIC_CUSTOMER_B_UUID' THEN
    RAISE EXCEPTION 'Customer B staging identity is not configured';
  END IF;
  IF current_setting('phase9b.customer_a_id')::uuid = current_setting('phase9b.customer_b_id')::uuid THEN
    RAISE EXCEPTION 'Customer A and Customer B must be different identities';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase9b.customer_a_id')::uuid)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase9b.customer_b_id')::uuid) THEN
    RAISE EXCEPTION 'Both synthetic customers must exist in this staging Auth project';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id IN (current_setting('phase9b.customer_a_id')::uuid,
                      current_setting('phase9b.customer_b_id')::uuid)
      AND role IN ('admin'::public.app_role, 'agent'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Both test identities must be customer-only identities';
  END IF;
END;
$$;

INSERT INTO public.quotes (id, user_id, type, total_amount, currency, status, details)
VALUES
  (current_setting('phase9b.quote_a_id')::uuid, current_setting('phase9b.customer_a_id')::uuid,
   'phase9b_cross_test', 123.45, 'USD', 'open', '{"synthetic":true}'::jsonb),
  (current_setting('phase9b.quote_b_id')::uuid, current_setting('phase9b.customer_b_id')::uuid,
   'phase9b_cross_test', 234.56, 'USD', 'open', '{"synthetic":true}'::jsonb);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase9b.customer_a_id'), true);
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('phase9b.customer_a_id'), 'role', 'authenticated')::text,
  true
);
DO $$
DECLARE visible_rows integer; changed_rows integer;
BEGIN
  IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'Expected database role authenticated, got %', current_user; END IF;
  IF auth.uid() IS DISTINCT FROM current_setting('phase9b.customer_a_id')::uuid THEN
    RAISE EXCEPTION 'Customer JWT claims do not resolve to the expected auth.uid()';
  END IF;
  SELECT count(*) INTO visible_rows FROM public.quotes
  WHERE id = current_setting('phase9b.quote_a_id')::uuid;
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'Customer A cannot read its own quotation'; END IF;
  SELECT count(*) INTO visible_rows FROM public.quotes
  WHERE id = current_setting('phase9b.quote_b_id')::uuid;
  IF visible_rows <> 0 THEN RAISE EXCEPTION 'Customer A can read Customer B quotation'; END IF;

  changed_rows := 0;
  BEGIN
    UPDATE public.quotes
    SET user_id = current_setting('phase9b.customer_b_id')::uuid,
        total_amount = 0.01,
        currency = 'XXX',
        status = 'withdrawn',
        details = '{"synthetic":true,"forged":true}'::jsonb
    WHERE id = current_setting('phase9b.quote_b_id')::uuid;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    changed_rows := 0;
  END;
  IF changed_rows <> 0 THEN RAISE EXCEPTION 'Customer A changed Customer B quotation'; END IF;
  changed_rows := 0;
  BEGIN
    DELETE FROM public.quotes WHERE id = current_setting('phase9b.quote_b_id')::uuid;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    changed_rows := 0;
  END;
  IF changed_rows <> 0 THEN RAISE EXCEPTION 'Customer A deleted Customer B quotation'; END IF;
END;
$$;

SELECT 'PASS: Customer A can read own quotation' AS result;
SELECT 'PASS: Customer A cannot read Customer B quotation' AS result;
SELECT 'PASS: Customer A cannot update Customer B quotation' AS result;
SELECT 'PASS: Customer A cannot delete Customer B quotation' AS result;
ROLLBACK;
