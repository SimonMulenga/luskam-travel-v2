-- SQL Editor quotation authorization checks (staging only).
-- Before running, verify the Supabase dashboard URL/project ref is
-- ikbffvqkxwhkwlocjufc. SQL Editor has no reliable SQL-visible project-ref
-- setting, so the operator must verify the target in the dashboard.
-- Uses the existing synthetic Customer A and staging admin identities.
-- All fixture rows are inside a transaction that ends with ROLLBACK.
-- Do not add COMMIT.

BEGIN;

SELECT set_config('phase9b.customer_a_id', '2e33f3a7-61e6-4971-8c2e-4dc817df7937', true);
SELECT set_config('phase9b.admin_id', 'bd29f41b-24a2-48d5-b243-7462ab80fc60', true);
SELECT set_config('phase9b.quote_a_id', gen_random_uuid()::text, true);
SELECT set_config('phase9b.admin_quote_id', gen_random_uuid()::text, true);

DO $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Unexpected SQL Editor role %; stop and review before testing', current_user;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = current_setting('phase9b.customer_a_id')::uuid
  ) THEN
    RAISE EXCEPTION 'Synthetic Customer A is not present in this staging Auth project';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = current_setting('phase9b.admin_id')::uuid
  ) THEN
    RAISE EXCEPTION 'Staging administrator is not present in this Auth project';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = current_setting('phase9b.admin_id')::uuid
      AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Supplied administrator does not have the admin role';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = current_setting('phase9b.customer_a_id')::uuid
      AND role IN ('admin'::public.app_role, 'agent'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Customer A has a staff role; use a confirmed customer-only identity';
  END IF;
  IF has_table_privilege('anon', 'public.quotes', 'SELECT')
     OR has_table_privilege('anon', 'public.quotes', 'INSERT')
     OR has_table_privilege('anon', 'public.quotes', 'UPDATE')
     OR has_table_privilege('anon', 'public.quotes', 'DELETE') THEN
    RAISE EXCEPTION 'Anonymous table privileges are broader than expected';
  END IF;
END;
$$;

-- Fixture creation is done as the privileged SQL Editor role. The following
-- blocks switch to the same database roles used by Supabase API requests.
INSERT INTO public.quotes (id, user_id, type, total_amount, currency, status, details)
VALUES (
  current_setting('phase9b.quote_a_id')::uuid,
  current_setting('phase9b.customer_a_id')::uuid,
  'phase9b_sql_editor_test', 123.45, 'USD', 'open', '{"synthetic":true}'::jsonb
);

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
DECLARE visible_rows integer;
BEGIN
  IF current_user <> 'anon' THEN RAISE EXCEPTION 'Expected database role anon, got %', current_user; END IF;
  IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Anonymous JWT unexpectedly resolves to a user'; END IF;
  BEGIN
    SELECT count(*) INTO visible_rows FROM public.quotes
    WHERE id = current_setting('phase9b.quote_a_id')::uuid;
  EXCEPTION WHEN insufficient_privilege THEN
    visible_rows := 0;
  END;
  IF visible_rows <> 0 THEN RAISE EXCEPTION 'Anonymous user can read a quotation'; END IF;
  BEGIN
    INSERT INTO public.quotes (user_id, type, total_amount, currency, status)
    VALUES (current_setting('phase9b.customer_a_id')::uuid, 'phase9b_anon_test', 1, 'USD', 'open');
    RAISE EXCEPTION 'Anonymous user inserted a quotation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
SELECT 'PASS: anonymous quotation SELECT returns no rows or is denied' AS result;
SELECT 'PASS: anonymous quotation INSERT denied' AS result;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase9b.customer_a_id'), true);
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('phase9b.customer_a_id'), 'role', 'authenticated')::text,
  true
);
DO $$
DECLARE visible_rows integer; changed_rows integer; write_succeeded boolean;
BEGIN
  IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'Expected database role authenticated, got %', current_user; END IF;
  IF auth.uid() IS DISTINCT FROM current_setting('phase9b.customer_a_id')::uuid THEN
    RAISE EXCEPTION 'Customer JWT claims do not resolve to the expected auth.uid()';
  END IF;
  SELECT count(*) INTO visible_rows FROM public.quotes
  WHERE id = current_setting('phase9b.quote_a_id')::uuid;
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'Customer cannot read own quotation'; END IF;

  write_succeeded := false;
  BEGIN
    INSERT INTO public.quotes (user_id, type, total_amount, currency, status)
    VALUES (auth.uid(), 'phase9b_forged_test', 0.01, 'XXX', 'approved');
    write_succeeded := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF write_succeeded THEN RAISE EXCEPTION 'Customer INSERT was unexpectedly allowed'; END IF;

  BEGIN
    UPDATE public.quotes
    SET user_id = current_setting('phase9b.admin_id')::uuid,
        total_amount = 0.01,
        currency = 'XXX',
        status = 'approved',
        details = '{"synthetic":true,"forged":true}'::jsonb
    WHERE id = current_setting('phase9b.quote_a_id')::uuid;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    IF changed_rows <> 0 THEN RAISE EXCEPTION 'Customer UPDATE was unexpectedly allowed'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.quotes WHERE id = current_setting('phase9b.quote_a_id')::uuid;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    IF changed_rows <> 0 THEN RAISE EXCEPTION 'Customer DELETE was unexpectedly allowed'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.quotes
    WHERE id = current_setting('phase9b.quote_a_id')::uuid
      AND user_id = current_setting('phase9b.customer_a_id')::uuid
      AND total_amount = 123.45 AND currency = 'USD' AND status = 'open'
      AND details = '{"synthetic":true}'::jsonb
  ) THEN
    RAISE EXCEPTION 'Customer write attempt changed the authoritative quotation';
  END IF;
END;
$$;
SELECT 'PASS: customer can read own quotation' AS result;
SELECT 'PASS: customer quotation INSERT denied' AS result;
SELECT 'PASS: customer quotation UPDATE denied, including owner, amount, currency, approval status, and details' AS result;
SELECT 'PASS: customer quotation DELETE denied' AS result;
SELECT 'PASS: customer write attempts left authoritative quotation fields unchanged' AS result;

-- Admin CRUD is allowed by the deployed admin policies. These operations and
-- the fixture are rolled back at the end of this script.
SELECT set_config('request.jwt.claim.sub', current_setting('phase9b.admin_id'), true);
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('phase9b.admin_id'), 'role', 'authenticated')::text,
  true
);
DO $$
DECLARE changed_rows integer; write_succeeded boolean;
BEGIN
  IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'Expected database role authenticated, got %', current_user; END IF;
  IF auth.uid() IS DISTINCT FROM current_setting('phase9b.admin_id')::uuid THEN
    RAISE EXCEPTION 'Admin JWT claims do not resolve to the expected auth.uid()';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quotes WHERE id = current_setting('phase9b.quote_a_id')::uuid) THEN
    RAISE EXCEPTION 'Authorized admin cannot read Customer A quotation';
  END IF;
  INSERT INTO public.quotes (id, user_id, type, total_amount, currency, status, details)
  VALUES (current_setting('phase9b.admin_quote_id')::uuid,
          current_setting('phase9b.customer_a_id')::uuid,
          'phase9b_admin_test', 300, 'USD', 'open', '{"synthetic":true}'::jsonb);
  UPDATE public.quotes SET total_amount = 310, status = 'approved'
  WHERE id = current_setting('phase9b.admin_quote_id')::uuid;
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN RAISE EXCEPTION 'Authorized admin UPDATE did not affect exactly one row'; END IF;
  DELETE FROM public.quotes WHERE id = current_setting('phase9b.admin_quote_id')::uuid;
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN RAISE EXCEPTION 'Authorized admin DELETE did not affect exactly one row'; END IF;
END;
$$;
SELECT 'PASS: authenticated staging admin can read customer quotation' AS result;
SELECT 'PASS: authenticated staging admin can insert quotation' AS result;
SELECT 'PASS: authenticated staging admin can update quotation' AS result;
SELECT 'PASS: authenticated staging admin can delete quotation' AS result;

ROLLBACK;
