-- Rollback-only Phase 9G authorization and rolling-deduplication checks. Staging only.
-- Verify project ikbffvqkxwhkwlocjufc. Use three synthetic Auth identities.
-- Replace all placeholders. Run in SQL Editor as postgres/supabase_admin. Never COMMIT.

BEGIN;
SELECT set_config('phase9g.customer_id', '2e33f3a7-61e6-4971-8c2e-4dc817df7937', true);
SELECT set_config('phase9g.admin_id', 'bd29f41b-24a2-48d5-b243-7462ab80fc60', true);
SELECT set_config('phase9g.agent_id', 'fcae4a89-7e69-4cbb-aa87-b666101fd815', true);
SELECT set_config('phase9g.role_fixture_id', gen_random_uuid()::text, true);
SELECT set_config('phase9g.request_idem', gen_random_uuid()::text, true);
SELECT set_config('phase9g.request_ref', 'LTA-20991231-AAAAAAAAAAAAAAAA', true);
SELECT set_config('phase9g.request_hash', repeat('g', 43), true);
SELECT set_config('phase9g.dedupe_key', repeat('g', 43), true);
SELECT set_config('phase9g.other_idem', gen_random_uuid()::text, true);
SELECT set_config('phase9g.other_ref', 'LTA-20991231-BBBBBBBBBBBBBBBB', true);
SELECT set_config('phase9g.changed_idem', gen_random_uuid()::text, true);
SELECT set_config('phase9g.rate_identity', gen_random_uuid()::text, true);
SELECT set_config('phase9g.short_rate_identity', gen_random_uuid()::text, true);

DO $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Unexpected SQL Editor role %', current_user;
  END IF;
  IF current_setting('phase9g.customer_id') LIKE 'REPLACE_%'
     OR current_setting('phase9g.admin_id') LIKE 'REPLACE_%'
     OR current_setting('phase9g.agent_id') LIKE 'REPLACE_%' THEN
    RAISE EXCEPTION 'Replace all three identity placeholders with synthetic staging Auth UIDs';
  END IF;
  IF current_setting('phase9g.customer_id')::uuid IN
       (current_setting('phase9g.admin_id')::uuid, current_setting('phase9g.agent_id')::uuid)
     OR current_setting('phase9g.admin_id')::uuid = current_setting('phase9g.agent_id')::uuid THEN
    RAISE EXCEPTION 'Customer, admin and agent identities must be distinct';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase9g.customer_id')::uuid)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase9g.admin_id')::uuid)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase9g.agent_id')::uuid) THEN
    RAISE EXCEPTION 'All synthetic Auth users must exist in staging';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles
             WHERE user_id = current_setting('phase9g.customer_id')::uuid
               AND role IN ('admin'::public.app_role, 'agent'::public.app_role)) THEN
    RAISE EXCEPTION 'Customer identity has a privileged role or role lookup behavior is unexpected';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = current_setting('phase9g.admin_id')::uuid AND role = 'admin'::public.app_role)
     OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = current_setting('phase9g.agent_id')::uuid AND role = 'agent'::public.app_role) THEN
    RAISE EXCEPTION 'Configured admin/agent identities do not have their expected roles';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles
             WHERE user_id = current_setting('phase9g.customer_id')::uuid
               AND role = 'user'::public.app_role) THEN
    RAISE EXCEPTION 'Customer already has the role needed for the isolated admin-removal fixture';
  END IF;
  IF has_table_privilege('anon', 'public.flight_quote_requests', 'SELECT')
     OR has_table_privilege('anon', 'public.flight_quote_requests', 'INSERT')
     OR has_table_privilege('anon', 'public.flight_quote_requests', 'UPDATE')
     OR has_table_privilege('anon', 'public.flight_quote_requests', 'DELETE') THEN
    RAISE EXCEPTION 'Anonymous table privileges are broader than expected';
  END IF;
  IF has_table_privilege('authenticated', 'public.flight_quote_requests', 'INSERT')
     OR has_table_privilege('authenticated', 'public.flight_quote_requests', 'DELETE')
     OR has_column_privilege('authenticated', 'public.flight_quote_requests', 'customer_email', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.flight_quote_requests', 'reference', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.flight_quote_requests', 'request_hash', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.flight_quote_requests', 'status', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.flight_quote_requests', 'internal_notes', 'UPDATE') THEN
    RAISE EXCEPTION 'Quotation table privileges do not match the restricted allowlist';
  END IF;
  IF has_function_privilege('anon', 'public.create_flight_quote_request_once(uuid,text,text,text,text,text,date,date,text,integer,integer,integer,text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_flight_quote_request_once(uuid,text,text,text,text,text,date,date,text,integer,integer,integer,text,text,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.create_flight_quote_request_once(uuid,text,text,text,text,text,date,date,text,integer,integer,integer,text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.consume_flight_quote_rate_limit(uuid,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.consume_flight_quote_rate_limit(uuid,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Privileged quotation RPC execution grants are too broad or missing';
  END IF;
END;
$$;

-- Prepare one exact synthetic role row for the admin-removal assertion below.
-- This privileged fixture is inside the transaction and is always rolled back.
DO $$
BEGIN
  INSERT INTO public.user_roles (id, user_id, role)
  VALUES (current_setting('phase9g.role_fixture_id')::uuid,
          current_setting('phase9g.customer_id')::uuid, 'user'::public.app_role);
END;
$$;

-- Create synthetic requests only via the trusted, atomic service RPC.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
DECLARE created jsonb; retry jsonb; other_key jsonb; changed jsonb; other_request jsonb;
  rate_result jsonb; rate_number integer; short_result jsonb;
BEGIN
  created := public.create_flight_quote_request_once(
    current_setting('phase9g.request_idem')::uuid, current_setting('phase9g.request_hash'),
    current_setting('phase9g.dedupe_key'), current_setting('phase9g.request_ref'),
    'LUN', 'JNB', current_date + 30, NULL, 'oneway', 1, 0, 0, 'economy',
    'Synthetic Test Customer', 'synthetic@example.test', '+260 977 000 000', 'Rollback fixture only'
  );
  IF created ->> 'outcome' <> 'created' THEN RAISE EXCEPTION 'Initial synthetic request was not created'; END IF;

  retry := public.create_flight_quote_request_once(
    current_setting('phase9g.request_idem')::uuid, current_setting('phase9g.request_hash'),
    current_setting('phase9g.dedupe_key'), current_setting('phase9g.other_ref'),
    'LUN', 'JNB', current_date + 30, NULL, 'oneway', 1, 0, 0, 'economy',
    'Synthetic Test Customer', 'synthetic@example.test', '+260 977 000 000', 'Rollback fixture only'
  );
  IF retry ->> 'outcome' <> 'duplicate' OR retry ->> 'reference' <> created ->> 'reference' THEN
    RAISE EXCEPTION 'Same idempotency key retry did not return its existing request';
  END IF;

  other_key := public.create_flight_quote_request_once(
    current_setting('phase9g.other_idem')::uuid, current_setting('phase9g.request_hash'),
    current_setting('phase9g.dedupe_key'), current_setting('phase9g.other_ref'),
    'LUN', 'JNB', current_date + 30, NULL, 'oneway', 1, 0, 0, 'economy',
    'Synthetic Test Customer', 'synthetic@example.test', '+260 977 000 000', 'Rollback fixture only'
  );
  IF other_key ->> 'outcome' <> 'duplicate' OR other_key ->> 'reference' <> created ->> 'reference' THEN
    RAISE EXCEPTION 'Different idempotency key bypassed rolling duplicate claim';
  END IF;

  changed := public.create_flight_quote_request_once(
    current_setting('phase9g.request_idem')::uuid, current_setting('phase9g.request_hash'),
    current_setting('phase9g.dedupe_key'), 'LTA-20991231-CCCCCCCCCCCCCCCC',
    'LUN', 'JNB', current_date + 30, NULL, 'oneway', 1, 0, 0, 'economy',
    'Synthetic Test Customer', 'synthetic@example.test', '+260 977 000 000', 'Changed request content'
  );
  IF changed ->> 'outcome' <> 'duplicate' THEN
    RAISE EXCEPTION 'Same key and same hash should remain idempotent';
  END IF;

  changed := public.create_flight_quote_request_once(
    current_setting('phase9g.request_idem')::uuid, repeat('x', 43), repeat('x', 43),
    'LTA-20991231-DDDDDDDDDDDDDDDD', 'LUN', 'JNB', current_date + 30, NULL, 'oneway', 1, 0, 0,
    'economy', 'Synthetic Test Customer', 'synthetic@example.test', '+260 977 000 000', 'Changed request content'
  );
  IF changed ->> 'outcome' <> 'conflict' THEN RAISE EXCEPTION 'Reused idempotency key with changed hash was not rejected'; END IF;

  other_request := public.create_flight_quote_request_once(
    gen_random_uuid(), repeat('z', 43), repeat('z', 43), 'LTA-20991231-FFFFFFFFFFFFFFFF',
    'LUN', 'JNB', current_date + 30, NULL, 'oneway', 1, 0, 0, 'economy',
    'Different Synthetic Customer', 'other@example.test', '+260 977 000 001', 'Different synthetic request'
  );
  IF other_request ->> 'outcome' <> 'created' THEN RAISE EXCEPTION 'Different customer request was incorrectly merged'; END IF;

  FOR rate_number IN 1..4 LOOP
    rate_result := public.consume_flight_quote_rate_limit(current_setting('phase9g.rate_identity')::uuid, 4, 900);
    IF rate_result ->> 'allowed' <> 'true' THEN RAISE EXCEPTION 'Sliding-window request % should be allowed', rate_number; END IF;
  END LOOP;
  rate_result := public.consume_flight_quote_rate_limit(current_setting('phase9g.rate_identity')::uuid, 4, 900);
  IF rate_result ->> 'allowed' <> 'false' OR (rate_result ->> 'retry_after_seconds')::integer < 1 THEN
    RAISE EXCEPTION 'Sliding-window request 5 was not rejected with a retry interval';
  END IF;
  short_result := public.consume_flight_quote_rate_limit(current_setting('phase9g.short_rate_identity')::uuid, 1, 1);
  IF short_result ->> 'allowed' <> 'true' THEN RAISE EXCEPTION 'Initial short-window request was not allowed'; END IF;
  short_result := public.consume_flight_quote_rate_limit(current_setting('phase9g.short_rate_identity')::uuid, 1, 1);
  IF short_result ->> 'allowed' <> 'false' THEN RAISE EXCEPTION 'Short-window over-limit request was not rejected'; END IF;
  PERFORM pg_catalog.pg_sleep(1.1);
  short_result := public.consume_flight_quote_rate_limit(current_setting('phase9g.short_rate_identity')::uuid, 1, 1);
  IF short_result ->> 'allowed' <> 'true' THEN RAISE EXCEPTION 'Sliding window did not admit a request after expiry'; END IF;
END;
$$;
RESET ROLE;

-- The original SQL Editor role expires only the synthetic private claim. It
-- does not grant direct private-table access to service_role or browser roles.
DO $$
BEGIN
  UPDATE private.flight_quote_dedupe_claims
  SET expires_at = pg_catalog.clock_timestamp() + interval '1 second'
  WHERE dedupe_key = current_setting('phase9g.dedupe_key');
  IF NOT FOUND THEN RAISE EXCEPTION 'Expected synthetic rolling claim was not found'; END IF;
END;
$$;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
DECLARE retry jsonb;
BEGIN
  retry := public.create_flight_quote_request_once(
    current_setting('phase9g.request_idem')::uuid, current_setting('phase9g.request_hash'),
    current_setting('phase9g.dedupe_key'), current_setting('phase9g.other_ref'),
    'LUN', 'JNB', current_date + 30, NULL, 'oneway', 1, 0, 0, 'economy',
    'Synthetic Test Customer', 'synthetic@example.test', '+260 977 000 000', 'Rollback fixture only'
  );
  IF retry ->> 'outcome' <> 'duplicate' THEN RAISE EXCEPTION 'Same-key retry did not remain idempotent'; END IF;
END;
$$;
RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM private.flight_quote_dedupe_claims
    WHERE dedupe_key = current_setting('phase9g.dedupe_key')
      AND expires_at > pg_catalog.clock_timestamp() + interval '14 minutes'
  ) THEN RAISE EXCEPTION 'Duplicate retry did not renew the full rolling interval'; END IF;
END;
$$;
DO $$
BEGIN
  UPDATE private.flight_quote_dedupe_claims
  SET expires_at = pg_catalog.clock_timestamp() - interval '1 second'
  WHERE dedupe_key = current_setting('phase9g.dedupe_key');
  IF NOT FOUND THEN RAISE EXCEPTION 'Expected synthetic rolling claim was not found'; END IF;
END;
$$;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
DECLARE after_expiry jsonb;
BEGIN
  after_expiry := public.create_flight_quote_request_once(
    current_setting('phase9g.changed_idem')::uuid, current_setting('phase9g.request_hash'),
    current_setting('phase9g.dedupe_key'), 'LTA-20991231-EEEEEEEEEEEEEEEE',
    'LUN', 'JNB', current_date + 30, NULL, 'oneway', 1, 0, 0, 'economy',
    'Synthetic Test Customer', 'synthetic@example.test', '+260 977 000 000', 'Rollback fixture only'
  );
  IF after_expiry ->> 'outcome' <> 'created' THEN RAISE EXCEPTION 'Expired rolling claim was not reusable'; END IF;
END;
$$;
RESET ROLE;

-- Anonymous, customer, admin and agent RLS checks.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
DECLARE found_rows integer; denied boolean := false;
BEGIN
  BEGIN
    SELECT count(*) INTO found_rows FROM public.flight_quote_requests;
    IF found_rows <> 0 THEN RAISE EXCEPTION 'Anonymous role enumerated quotation records'; END IF;
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    UPDATE public.flight_quote_requests SET status = 'closed';
    IF FOUND THEN RAISE EXCEPTION 'Anonymous role modified a quotation'; END IF;
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied AND has_table_privilege('anon', 'public.flight_quote_requests', 'UPDATE') THEN
    RAISE EXCEPTION 'Anonymous update was not denied by privilege or RLS';
  END IF;
  denied := false;
  BEGIN
    INSERT INTO public.flight_quote_requests (
      reference, idempotency_key, request_hash, dedupe_key, origin, destination,
      departure_date, trip_type, adults, children, infants, cabin_class,
      customer_name, customer_email, customer_phone
    ) VALUES ('LTA-20991231-9999999999999999', gen_random_uuid(), repeat('n',43), repeat('n',43),
      'LUN', 'JNB', current_date + 30, 'oneway', 1, 0, 0, 'economy',
      'Synthetic Anonymous', 'anon@example.test', '+260 977 000 009');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Anonymous direct INSERT unexpectedly succeeded'; END IF;
  denied := false;
  BEGIN
    DELETE FROM public.flight_quote_requests;
    IF FOUND THEN RAISE EXCEPTION 'Anonymous role deleted quotation records'; END IF;
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Anonymous direct DELETE was not denied'; END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase9g.customer_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('phase9g.customer_id'))::text, true);
DO $$
DECLARE found_rows integer; affected integer; escalation_denied boolean := false; direct_write_denied boolean := false;
  role_write_succeeded boolean; role_rows integer;
BEGIN
  IF auth.uid() IS DISTINCT FROM current_setting('phase9g.customer_id')::uuid THEN RAISE EXCEPTION 'Customer JWT mismatch'; END IF;
  SELECT count(*) INTO found_rows FROM public.flight_quote_requests;
  IF found_rows <> 0 THEN RAISE EXCEPTION 'Customer can enumerate staff quotation rows'; END IF;
  UPDATE public.flight_quote_requests SET status = 'closed', internal_notes = 'forged'
  WHERE reference = current_setting('phase9g.request_ref');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Customer changed staff workflow fields'; END IF;
  BEGIN
    INSERT INTO public.flight_quote_requests (
      reference, idempotency_key, request_hash, dedupe_key, origin, destination,
      departure_date, trip_type, adults, children, infants, cabin_class,
      customer_name, customer_email, customer_phone
    ) VALUES ('LTA-20991231-8888888888888888', gen_random_uuid(), repeat('m',43), repeat('m',43),
      'LUN', 'JNB', current_date + 30, 'oneway', 1, 0, 0, 'economy',
      'Synthetic Customer', 'customer@example.test', '+260 977 000 008');
  EXCEPTION WHEN SQLSTATE '42501' THEN direct_write_denied := true;
  END;
  IF NOT direct_write_denied THEN RAISE EXCEPTION 'Customer direct INSERT unexpectedly succeeded'; END IF;
  direct_write_denied := false;
  BEGIN
    DELETE FROM public.flight_quote_requests WHERE reference = current_setting('phase9g.request_ref');
    IF FOUND THEN RAISE EXCEPTION 'Customer deleted a staff request'; END IF;
  EXCEPTION WHEN SQLSTATE '42501' THEN direct_write_denied := true;
  END;
  IF NOT direct_write_denied THEN RAISE EXCEPTION 'Customer direct DELETE was not denied'; END IF;
  BEGIN
    UPDATE public.flight_quote_requests SET customer_email = 'attacker@example.test'
    WHERE reference = current_setting('phase9g.request_ref');
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Customer changed protected contact data'; END IF;
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin'::public.app_role);
  EXCEPTION WHEN SQLSTATE '42501' THEN escalation_denied := true;
  END;
  IF NOT escalation_denied THEN RAISE EXCEPTION 'Customer role escalation was not denied'; END IF;

  -- Accept either a permission denial or an RLS-filtered zero-row result.
  role_write_succeeded := false;
  BEGIN
    UPDATE public.user_roles SET role = 'admin'::public.app_role
    WHERE id = current_setting('phase9g.role_fixture_id')::uuid
      AND user_id = auth.uid() AND role = 'user'::public.app_role;
    GET DIAGNOSTICS role_rows = ROW_COUNT;
    role_write_succeeded := role_rows > 0;
  EXCEPTION WHEN SQLSTATE '42501' THEN role_write_succeeded := false;
  END;
  IF role_write_succeeded THEN RAISE EXCEPTION 'Customer promoted their own role to admin'; END IF;

  role_write_succeeded := false;
  BEGIN
    UPDATE public.user_roles SET role = 'user'::public.app_role
    WHERE user_id = current_setting('phase9g.agent_id')::uuid
      AND role = 'agent'::public.app_role;
    GET DIAGNOSTICS role_rows = ROW_COUNT;
    role_write_succeeded := role_rows > 0;
  EXCEPTION WHEN SQLSTATE '42501' THEN role_write_succeeded := false;
  END;
  IF role_write_succeeded THEN RAISE EXCEPTION 'Customer modified another user role'; END IF;

  role_rows := 0;
  BEGIN
    DELETE FROM public.user_roles
    WHERE id = current_setting('phase9g.role_fixture_id')::uuid
      AND user_id = auth.uid() AND role = 'user'::public.app_role;
    GET DIAGNOSTICS role_rows = ROW_COUNT;
  EXCEPTION WHEN SQLSTATE '42501' THEN role_rows := 0;
  END;
  IF role_rows <> 0 THEN RAISE EXCEPTION 'Customer deleted their own role assignment'; END IF;

  role_rows := 0;
  BEGIN
    DELETE FROM public.user_roles
    WHERE user_id = current_setting('phase9g.agent_id')::uuid
      AND role = 'agent'::public.app_role;
    GET DIAGNOSTICS role_rows = ROW_COUNT;
  EXCEPTION WHEN SQLSTATE '42501' THEN role_rows := 0;
  END;
  IF role_rows <> 0 THEN RAISE EXCEPTION 'Customer deleted another user role'; END IF;
  IF public.has_role(auth.uid(), 'admin'::public.app_role) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Customer unexpectedly has admin role after role-write attempts';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase9g.agent_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('phase9g.agent_id'))::text, true);
DO $$
DECLARE visible_rows integer; changed_rows integer; denied boolean := false;
BEGIN
  SELECT count(*) INTO visible_rows FROM public.flight_quote_requests
  WHERE reference = current_setting('phase9g.request_ref');
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'Authorized agent cannot read request'; END IF;
  UPDATE public.flight_quote_requests SET status = 'reviewing', internal_notes = 'Synthetic agent test'
  WHERE reference = current_setting('phase9g.request_ref');
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN RAISE EXCEPTION 'Authorized agent cannot update permitted workflow fields'; END IF;
  BEGIN
    UPDATE public.flight_quote_requests SET customer_email = 'forged@example.test'
    WHERE reference = current_setting('phase9g.request_ref');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Agent updated a protected contact column'; END IF;
  denied := false;
  BEGIN
    INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin'::public.app_role);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Agent role escalation was not denied'; END IF;
  changed_rows := 0;
  BEGIN
    UPDATE public.user_roles SET role = 'admin'::public.app_role
    WHERE user_id = auth.uid() AND role = 'agent'::public.app_role;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
  EXCEPTION WHEN SQLSTATE '42501' THEN changed_rows := 0;
  END;
  IF changed_rows <> 0 OR public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Agent promoted their own role to admin';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase9g.admin_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('phase9g.admin_id'))::text, true);
DO $$
DECLARE visible_rows integer; changed_rows integer; denied boolean := false; role_rows integer;
BEGIN
  SELECT count(*) INTO visible_rows FROM public.flight_quote_requests
  WHERE reference = current_setting('phase9g.request_ref');
  IF visible_rows <> 1 THEN RAISE EXCEPTION 'Authorized admin cannot read request'; END IF;
  UPDATE public.flight_quote_requests SET status = 'quoted', internal_notes = 'Synthetic admin test'
  WHERE reference = current_setting('phase9g.request_ref');
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN RAISE EXCEPTION 'Authorized admin cannot update permitted workflow fields'; END IF;
  BEGIN
    UPDATE public.flight_quote_requests SET idempotency_key = gen_random_uuid()
    WHERE reference = current_setting('phase9g.request_ref');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Admin changed a protected idempotency column'; END IF;

  DELETE FROM public.user_roles
  WHERE id = current_setting('phase9g.role_fixture_id')::uuid
    AND user_id = current_setting('phase9g.customer_id')::uuid
    AND role = 'user'::public.app_role;
  GET DIAGNOSTICS role_rows = ROW_COUNT;
  IF role_rows <> 1 THEN RAISE EXCEPTION 'Authorized admin could not remove the exact synthetic role fixture'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles
             WHERE id = current_setting('phase9g.role_fixture_id')::uuid) THEN
    RAISE EXCEPTION 'Synthetic role fixture remains after authorized admin removal';
  END IF;
END;
$$;

SELECT 'PASS: anonymous/customer isolation; customer and agent role escalation denied; admin synthetic role removal permitted; quotation workflow, protected columns and atomic RPC checks passed' AS result;
ROLLBACK;
