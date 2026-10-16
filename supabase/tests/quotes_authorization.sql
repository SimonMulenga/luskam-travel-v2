\set ON_ERROR_STOP on
-- Rollback-only quote authorization regression checks.
-- Run against staging only after visually verifying the dashboard project ref
-- and the psql connection host. The STAGING_ONLY variable is a confirmation
-- gate, not cryptographic target verification.
-- Required variables: staging_confirm=STAGING_ONLY, customer_a_id,
-- customer_b_id, admin_id. All identities must be synthetic/staging identities.
-- Example:
-- psql "$STAGING_DB_URL" -v staging_confirm=STAGING_ONLY \
--   -v customer_a_id=<uuid> -v customer_b_id=<uuid> -v admin_id=<uuid> \
--   -f supabase/tests/quotes_authorization.sql

\if :{?staging_confirm}
\else
  \echo 'Missing staging_confirm=STAGING_ONLY; refusing to continue.'
  \quit
\endif
\if :{?customer_a_id}
\else
  \echo 'Missing synthetic customer_a_id.'
  \quit
\endif
\if :{?customer_b_id}
\else
  \echo 'Missing synthetic customer_b_id.'
  \quit
\endif
\if :{?admin_id}
\else
  \echo 'Missing staging admin_id.'
  \quit
\endif

SELECT :'staging_confirm' = 'STAGING_ONLY' AS staging_confirmed \gset
\if :staging_confirmed
\else
  \echo 'Staging confirmation did not match; refusing to continue.'
  \quit
\endif

SELECT gen_random_uuid() AS quote_a_id \gset
SELECT gen_random_uuid() AS quote_b_id \gset
SELECT gen_random_uuid() AS staff_quote_id \gset

BEGIN;

SELECT set_config('phase9.customer_a_id', :'customer_a_id', true);
SELECT set_config('phase9.customer_b_id', :'customer_b_id', true);
SELECT set_config('phase9.admin_id', :'admin_id', true);
SELECT set_config('phase9.quote_a_id', :'quote_a_id', true);
SELECT set_config('phase9.quote_b_id', :'quote_b_id', true);
SELECT set_config('phase9.staff_quote_id', :'staff_quote_id', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase9.customer_a_id')::uuid)
    OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase9.customer_b_id')::uuid)
    OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase9.admin_id')::uuid) THEN
    RAISE EXCEPTION 'All supplied identities must exist in this staging Auth database';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = current_setting('phase9.admin_id')::uuid
      AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'The supplied staff identity is not a staging admin';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id IN (
      current_setting('phase9.customer_a_id')::uuid,
      current_setting('phase9.customer_b_id')::uuid
    ) AND role IN ('admin'::public.app_role, 'agent'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Customer test identities must not already have staff roles';
  END IF;
END;
$$;

INSERT INTO public.quotes (id, user_id, type, total_amount, currency, status, details)
VALUES
  (current_setting('phase9.quote_a_id')::uuid, current_setting('phase9.customer_a_id')::uuid, 'phase9a_test', 123.45, 'USD', 'open', '{"synthetic":true}'::jsonb),
  (current_setting('phase9.quote_b_id')::uuid, current_setting('phase9.customer_b_id')::uuid, 'phase9a_test', 234.56, 'USD', 'open', '{"synthetic":true}'::jsonb);

-- Anonymous reads and writes must be denied, whether by table grants or RLS.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{}', true);
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.quotes WHERE id = current_setting('phase9.quote_a_id')::uuid;
    RAISE EXCEPTION 'Anonymous user accessed quotations';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.quotes (user_id, type, total_amount, currency, status)
    VALUES (current_setting('phase9.customer_a_id')::uuid, 'phase9a_anon_test', 1, 'USD', 'approved');
    RAISE EXCEPTION 'Anonymous user inserted a quotation';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
END;
$$;

-- Customer A can read only A's quote and cannot create, change, or delete quotes.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase9.customer_a_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('phase9.customer_a_id'), 'role', 'authenticated')::text, true);
DO $$
DECLARE
  changed integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.quotes WHERE id = current_setting('phase9.quote_a_id')::uuid) THEN
    RAISE EXCEPTION 'Customer cannot read own quotation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.quotes WHERE id = current_setting('phase9.quote_b_id')::uuid) THEN
    RAISE EXCEPTION 'Customer can read another customer quotation';
  END IF;

  BEGIN
    INSERT INTO public.quotes (user_id, type, total_amount, currency, status)
    VALUES (auth.uid(), 'phase9a_forged_test', 0.01, 'USD', 'approved');
    RAISE EXCEPTION 'Customer inserted an authoritative quotation';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (auth.uid(), 'agent'::public.app_role);
    RAISE EXCEPTION 'Customer self-assigned a staff role';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.quotes
    SET total_amount = 0.01,
        currency = 'XXX',
        status = 'approved',
        user_id = current_setting('phase9.customer_b_id')::uuid,
        details = '{"synthetic":true,"forged":true}'::jsonb
    WHERE id = current_setting('phase9.quote_a_id')::uuid;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 0 THEN RAISE EXCEPTION 'Customer changed quotation ownership or authoritative fields'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.quotes WHERE id = current_setting('phase9.quote_a_id')::uuid;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 0 THEN RAISE EXCEPTION 'Customer deleted own authoritative quotation'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.quotes SET status = 'withdrawn'
  WHERE id = current_setting('phase9.quote_b_id')::uuid;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'Customer changed another customer quotation'; END IF;
  DELETE FROM public.quotes WHERE id = current_setting('phase9.quote_b_id')::uuid;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'Customer deleted another customer quotation'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.quotes
    WHERE id = current_setting('phase9.quote_a_id')::uuid
      AND user_id = current_setting('phase9.customer_a_id')::uuid
      AND total_amount = 123.45 AND currency = 'USD' AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Quotation changed despite customer write denial';
  END IF;
END;
$$;

-- An authenticated admin can read and manage quotations for staff work.
SELECT set_config('request.jwt.claim.sub', current_setting('phase9.admin_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('phase9.admin_id'), 'role', 'authenticated')::text, true);
DO $$
DECLARE
  changed integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.quotes WHERE id = current_setting('phase9.quote_a_id')::uuid)
    OR NOT EXISTS (SELECT 1 FROM public.quotes WHERE id = current_setting('phase9.quote_b_id')::uuid) THEN
    RAISE EXCEPTION 'Authorized admin cannot read customer quotations';
  END IF;

  INSERT INTO public.quotes (id, user_id, type, total_amount, currency, status, details)
  VALUES (current_setting('phase9.staff_quote_id')::uuid, current_setting('phase9.customer_a_id')::uuid, 'phase9a_test', 300, 'USD', 'open', '{"synthetic":true}'::jsonb);
  UPDATE public.quotes SET total_amount = 310, status = 'approved'
  WHERE id = current_setting('phase9.staff_quote_id')::uuid;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Authorized admin quotation update failed'; END IF;
  DELETE FROM public.quotes WHERE id = current_setting('phase9.staff_quote_id')::uuid;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Authorized admin quotation withdrawal failed'; END IF;
END;
$$;

-- Temporarily assign the synthetic Customer B the agent role inside this
-- transaction, then verify authorized-agent quote operations. ROLLBACK below
-- removes both this role row and every test quotation.
RESET ROLE;
INSERT INTO public.user_roles (user_id, role)
VALUES (current_setting('phase9.customer_b_id')::uuid, 'agent'::public.app_role);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase9.customer_b_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('phase9.customer_b_id'), 'role', 'authenticated')::text, true);
DO $$
DECLARE
  changed integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.quotes WHERE id = current_setting('phase9.quote_a_id')::uuid)
    OR NOT EXISTS (SELECT 1 FROM public.quotes WHERE id = current_setting('phase9.quote_b_id')::uuid) THEN
    RAISE EXCEPTION 'Authorized agent cannot read customer quotations';
  END IF;
  INSERT INTO public.quotes (id, user_id, type, total_amount, currency, status, details)
  VALUES (current_setting('phase9.staff_quote_id')::uuid, current_setting('phase9.customer_a_id')::uuid, 'phase9a_test', 400, 'USD', 'open', '{"synthetic":true}'::jsonb);
  UPDATE public.quotes SET total_amount = 410, status = 'approved'
  WHERE id = current_setting('phase9.staff_quote_id')::uuid;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Authorized agent quotation update failed'; END IF;
  DELETE FROM public.quotes WHERE id = current_setting('phase9.staff_quote_id')::uuid;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Authorized agent quotation withdrawal failed'; END IF;
END;
$$;

ROLLBACK;
