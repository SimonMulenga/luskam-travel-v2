-- Rollback-only authorization test for customer request ownership/read RPCs.
-- Run in an isolated Supabase database after migrations 20261019100000 and
-- 20261019110000.
-- Provide four distinct synthetic Auth identities: two customers, an agent,
-- and an admin. Replace placeholders only with verified synthetic staging UIDs.
-- Never COMMIT. For psql use: psql -X -v ON_ERROR_STOP=1 -f this-file.sql.

BEGIN;

SELECT set_config('phase4.customer_a_id', 'REPLACE_WITH_SYNTHETIC_CUSTOMER_A_UID', true);
SELECT set_config('phase4.customer_b_id', 'REPLACE_WITH_SYNTHETIC_CUSTOMER_B_UID', true);
SELECT set_config('phase4.agent_id', 'REPLACE_WITH_SYNTHETIC_AGENT_UID', true);
SELECT set_config('phase4.admin_id', 'REPLACE_WITH_SYNTHETIC_ADMIN_UID', true);
SELECT set_config('phase4.flight_a_ref', 'LTA-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)), true);
SELECT set_config('phase4.flight_b_ref', 'LTA-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)), true);
SELECT set_config('phase4.flight_anon_ref', 'LTA-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)), true);
SELECT set_config('phase4.kakande_a_ref', 'KMR-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)), true);
SELECT set_config('phase4.kakande_b_ref', 'KMR-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)), true);
SELECT set_config('phase4.kakande_anon_ref', 'KMR-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)), true);
SELECT set_config('phase4.owner_flight_ref', 'LTA-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)), true);
SELECT set_config('phase4.owner_flight_idem', gen_random_uuid()::text, true);
SELECT set_config('phase4.owner_flight_other_idem', gen_random_uuid()::text, true);
SELECT set_config('phase4.owner_flight_same_owner_idem', gen_random_uuid()::text, true);
SELECT set_config('phase4.owner_flight_hash', repeat('g', 43), true);
SELECT set_config('phase4.owner_flight_anon_ref', 'LTA-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)), true);
SELECT set_config('phase4.owner_flight_anon_idem', gen_random_uuid()::text, true);
SELECT set_config('phase4.owner_flight_anon_other_idem', gen_random_uuid()::text, true);
SELECT set_config('phase4.owner_flight_anon_hash', repeat('i', 43), true);
SELECT set_config('phase4.owner_kakande_ref', 'KMR-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)), true);
SELECT set_config('phase4.owner_kakande_idem', gen_random_uuid()::text, true);
SELECT set_config('phase4.owner_kakande_other_idem', gen_random_uuid()::text, true);
SELECT set_config('phase4.owner_kakande_same_owner_idem', gen_random_uuid()::text, true);
SELECT set_config('phase4.owner_kakande_hash', repeat('h', 43), true);
SELECT set_config('phase4.owner_kakande_anon_ref', 'KMR-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)), true);
SELECT set_config('phase4.owner_kakande_anon_idem', gen_random_uuid()::text, true);
SELECT set_config('phase4.owner_kakande_anon_other_idem', gen_random_uuid()::text, true);
SELECT set_config('phase4.owner_kakande_anon_hash', repeat('j', 43), true);
SELECT set_config('phase4.owner_kakande_trip', 'phase4-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20), true);
SELECT set_config('phase4.owner_kakande_option', gen_random_uuid()::text, true);

DO $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Run this rollback-only test as postgres or supabase_admin';
  END IF;
  IF current_setting('phase4.customer_a_id') LIKE 'REPLACE_%'
     OR current_setting('phase4.customer_b_id') LIKE 'REPLACE_%'
     OR current_setting('phase4.agent_id') LIKE 'REPLACE_%'
     OR current_setting('phase4.admin_id') LIKE 'REPLACE_%' THEN
    RAISE EXCEPTION 'Replace all four identity placeholders with synthetic Auth UIDs';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase4.customer_a_id')::uuid)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase4.customer_b_id')::uuid)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase4.agent_id')::uuid)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase4.admin_id')::uuid) THEN
    RAISE EXCEPTION 'All four synthetic Auth users must exist';
  END IF;
  IF current_setting('phase4.customer_a_id')::uuid = current_setting('phase4.customer_b_id')::uuid
     OR current_setting('phase4.customer_a_id')::uuid IN (current_setting('phase4.agent_id')::uuid, current_setting('phase4.admin_id')::uuid)
     OR current_setting('phase4.customer_b_id')::uuid IN (current_setting('phase4.agent_id')::uuid, current_setting('phase4.admin_id')::uuid)
     OR current_setting('phase4.agent_id')::uuid = current_setting('phase4.admin_id')::uuid THEN
    RAISE EXCEPTION 'Customer A, customer B, agent, and admin identities must be distinct';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id IN (
       current_setting('phase4.customer_a_id')::uuid,
       current_setting('phase4.customer_b_id')::uuid
     ) AND role IN ('admin'::public.app_role, 'agent'::public.app_role))
     OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = current_setting('phase4.agent_id')::uuid AND role = 'agent'::public.app_role)
     OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = current_setting('phase4.admin_id')::uuid AND role = 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Synthetic customer/staff role assignments are not as expected';
  END IF;
  IF has_column_privilege('authenticated', 'public.flight_quote_requests', 'user_id', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.kakande_ministry_requests', 'user_id', 'UPDATE') THEN
    RAISE EXCEPTION 'Authenticated users have direct ownership update privileges';
  END IF;
  IF has_function_privilege('anon', 'public.my_flight_quote_requests()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.my_kakande_ministry_requests()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.my_flight_quote_requests()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.my_kakande_ministry_requests()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.my_flight_quote_requests()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.my_kakande_ministry_requests()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Customer read RPC grants do not match the authenticated-only contract';
  END IF;
  IF has_function_privilege('anon', 'public.create_flight_quote_request_once_for_customer(uuid,text,text,text,text,text,date,date,text,integer,integer,integer,text,text,text,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_flight_quote_request_once_for_customer(uuid,text,text,text,text,text,date,date,text,integer,integer,integer,text,text,text,text,text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.create_flight_quote_request_once_for_customer(uuid,text,text,text,text,text,date,date,text,integer,integer,integer,text,text,text,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.create_kakande_ministry_request_once_for_customer(uuid,text,text,text,text,text,integer,timestamptz,timestamptz,text,text,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_kakande_ministry_request_once_for_customer(uuid,text,text,text,text,text,integer,timestamptz,timestamptz,text,text,text,text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.create_kakande_ministry_request_once_for_customer(uuid,text,text,text,text,text,integer,timestamptz,timestamptz,text,text,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Owner-aware request RPC grants do not match service-role-only contract';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    WHERE function_row.oid IN (
      'public.my_flight_quote_requests()'::regprocedure,
      'public.my_kakande_ministry_requests()'::regprocedure,
      'public.create_flight_quote_request_once(uuid,text,text,text,text,text,date,date,text,integer,integer,integer,text,text,text,text,text)'::regprocedure,
      'public.create_flight_quote_request_once_for_customer(uuid,text,text,text,text,text,date,date,text,integer,integer,integer,text,text,text,text,text,uuid)'::regprocedure,
      'public.create_kakande_ministry_request_once(uuid,text,text,text,text,text,integer,timestamptz,timestamptz,text,text,text,text)'::regprocedure,
      'public.create_kakande_ministry_request_once_for_customer(uuid,text,text,text,text,text,integer,timestamptz,timestamptz,text,text,text,text,uuid)'::regprocedure,
      'private.create_flight_quote_request_once_core(uuid,text,text,text,text,text,date,date,text,integer,integer,integer,text,text,text,text,text,uuid)'::regprocedure,
      'private.create_kakande_ministry_request_once_core(uuid,text,text,text,text,text,integer,timestamptz,timestamptz,text,text,text,text,uuid)'::regprocedure
    )
      AND (NOT function_row.prosecdef
        OR function_row.proowner <> 'postgres'::regrole
        OR NOT EXISTS (
          SELECT 1 FROM unnest(COALESCE(function_row.proconfig, ARRAY[]::text[])) AS config_value
          WHERE config_value LIKE 'search_path=%'
        ))
  ) THEN
    RAISE EXCEPTION 'Customer-read or intake RPC security-definer ownership/search_path settings are unsafe';
  END IF;
  IF has_function_privilege('service_role', 'private.create_flight_quote_request_once_core(uuid,text,text,text,text,text,date,date,text,integer,integer,integer,text,text,text,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'private.create_kakande_ministry_request_once_core(uuid,text,text,text,text,text,integer,timestamptz,timestamptz,text,text,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'private.create_flight_quote_request_once_core(uuid,text,text,text,text,text,date,date,text,integer,integer,integer,text,text,text,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'private.create_kakande_ministry_request_once_core(uuid,text,text,text,text,text,integer,timestamptz,timestamptz,text,text,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Private shared creation cores must not be directly executable by application roles';
  END IF;
END;
$$;

-- A future, published trip exists only as a rollback-scoped synthetic fixture
-- for exercising the owner-aware Kakande intake RPC.
INSERT INTO private.kakande_monthly_trips (trip_id, month_label, is_published)
VALUES (current_setting('phase4.owner_kakande_trip'), 'November 2099', true);
INSERT INTO private.kakande_trip_options
  (option_id, trip_id, transport_mode, departure_date, price_per_traveller_zmw, is_published, availability)
VALUES (current_setting('phase4.owner_kakande_option')::uuid,
        current_setting('phase4.owner_kakande_trip'), 'road', DATE '2099-11-10', 2500, true, 'open');
SELECT set_config('phase4.owner_kakande_trip_updated_at', (
  SELECT updated_at::text FROM private.kakande_monthly_trips WHERE trip_id = current_setting('phase4.owner_kakande_trip')
), true);
SELECT set_config('phase4.owner_kakande_option_updated_at', (
  SELECT updated_at::text FROM private.kakande_trip_options WHERE option_id = current_setting('phase4.owner_kakande_option')::uuid
), true);

-- Service-role-only trusted intake receives a UID only after the Edge Function
-- verifies the bearer token with Supabase Auth. RPC replay must preserve owner.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
DECLARE result jsonb; ref text := current_setting('phase4.owner_flight_ref');
BEGIN
  result := public.create_flight_quote_request_once_for_customer(
    current_setting('phase4.owner_flight_idem')::uuid,
    current_setting('phase4.owner_flight_hash'), current_setting('phase4.owner_flight_hash'), ref,
    'LUN', 'JNB', current_date + 60, NULL, 'oneway', 1, 0, 0, 'economy',
    'Synthetic Owner A', 'owner-a@example.test', '+260971000101', '',
    current_setting('phase4.customer_a_id')::uuid
  );
  IF result->>'outcome' <> 'created' OR result->>'reference' <> ref THEN
    RAISE EXCEPTION 'Owner-aware flight intake did not create the expected synthetic request';
  END IF;
  result := public.create_flight_quote_request_once_for_customer(
    current_setting('phase4.owner_flight_idem')::uuid,
    current_setting('phase4.owner_flight_hash'), current_setting('phase4.owner_flight_hash'),
    'LTA-20991110-AAAAAAAAAAAAAAAA', 'LUN', 'JNB', current_date + 60, NULL, 'oneway', 1, 0, 0, 'economy',
    'Synthetic Owner A', 'owner-a@example.test', '+260971000101', '',
    current_setting('phase4.customer_a_id')::uuid
  );
  IF result->>'outcome' <> 'duplicate' OR result->>'reference' <> ref THEN
    RAISE EXCEPTION 'Same-owner flight idempotent retry did not return its original reference';
  END IF;
  result := public.create_flight_quote_request_once_for_customer(
    current_setting('phase4.owner_flight_same_owner_idem')::uuid,
    current_setting('phase4.owner_flight_hash'), current_setting('phase4.owner_flight_hash'),
    'LTA-20991110-EEEEEEEEEEEEEEEE', 'LUN', 'JNB', current_date + 60, NULL, 'oneway', 1, 0, 0, 'economy',
    'Synthetic Owner A', 'owner-a@example.test', '+260971000101', '',
    current_setting('phase4.customer_a_id')::uuid
  );
  IF result->>'outcome' <> 'duplicate' OR result->>'reference' <> ref THEN
    RAISE EXCEPTION 'Same-owner flight rolling-dedup retry did not return its original reference';
  END IF;
  result := public.create_flight_quote_request_once_for_customer(
    current_setting('phase4.owner_flight_idem')::uuid,
    current_setting('phase4.owner_flight_hash'), current_setting('phase4.owner_flight_hash'),
    'LTA-20991110-BBBBBBBBBBBBBBBB', 'LUN', 'JNB', current_date + 60, NULL, 'oneway', 1, 0, 0, 'economy',
    'Synthetic Owner B', 'owner-b@example.test', '+260971000102', '',
    current_setting('phase4.customer_b_id')::uuid
  );
  IF result->>'outcome' <> 'conflict' OR result ? 'reference' THEN
    RAISE EXCEPTION 'Cross-owner flight idempotency replay disclosed or returned another owner''s reference';
  END IF;
  result := public.create_flight_quote_request_once_for_customer(
    current_setting('phase4.owner_flight_other_idem')::uuid,
    current_setting('phase4.owner_flight_hash'), current_setting('phase4.owner_flight_hash'),
    'LTA-20991110-CCCCCCCCCCCCCCCC', 'LUN', 'JNB', current_date + 60, NULL, 'oneway', 1, 0, 0, 'economy',
    'Synthetic Owner B', 'owner-b@example.test', '+260971000102', '',
    current_setting('phase4.customer_b_id')::uuid
  );
  IF result->>'outcome' <> 'conflict' OR result ? 'reference' THEN
    RAISE EXCEPTION 'Cross-owner flight rolling-dedup replay disclosed or returned another owner''s reference';
  END IF;
  result := public.create_flight_quote_request_once(
    current_setting('phase4.owner_flight_idem')::uuid,
    current_setting('phase4.owner_flight_hash'), current_setting('phase4.owner_flight_hash'),
    'LTA-20991110-DDDDDDDDDDDDDDDD', 'LUN', 'JNB', current_date + 60, NULL, 'oneway', 1, 0, 0, 'economy',
    'Synthetic Anonymous', 'anonymous-owner@example.test', '+260971000103', ''
  );
  IF result->>'outcome' <> 'conflict' OR result ? 'reference' THEN
    RAISE EXCEPTION 'Anonymous flight retry disclosed an authenticated owner''s reference';
  END IF;

  result := public.create_flight_quote_request_once(
    current_setting('phase4.owner_flight_anon_idem')::uuid,
    current_setting('phase4.owner_flight_anon_hash'), current_setting('phase4.owner_flight_anon_hash'),
    current_setting('phase4.owner_flight_anon_ref'), 'LUN', 'NBO', current_date + 75, NULL, 'oneway', 1, 0, 0, 'economy',
    'Synthetic Anonymous', 'anonymous-owner@example.test', '+260971000103', ''
  );
  IF result->>'outcome' <> 'created' OR result->>'reference' <> current_setting('phase4.owner_flight_anon_ref') THEN
    RAISE EXCEPTION 'Backward-compatible anonymous flight creation failed';
  END IF;
  result := public.create_flight_quote_request_once(
    current_setting('phase4.owner_flight_anon_idem')::uuid,
    current_setting('phase4.owner_flight_anon_hash'), current_setting('phase4.owner_flight_anon_hash'),
    'LTA-20991110-1111111111111111', 'LUN', 'NBO', current_date + 75, NULL, 'oneway', 1, 0, 0, 'economy',
    'Synthetic Anonymous', 'anonymous-owner@example.test', '+260971000103', ''
  );
  IF result->>'outcome' <> 'duplicate' OR result->>'reference' <> current_setting('phase4.owner_flight_anon_ref') THEN
    RAISE EXCEPTION 'Same-key anonymous flight retry did not preserve its original reference';
  END IF;
  result := public.create_flight_quote_request_once(
    current_setting('phase4.owner_flight_anon_other_idem')::uuid,
    current_setting('phase4.owner_flight_anon_hash'), current_setting('phase4.owner_flight_anon_hash'),
    'LTA-20991110-2222222222222222', 'LUN', 'NBO', current_date + 75, NULL, 'oneway', 1, 0, 0, 'economy',
    'Synthetic Anonymous', 'anonymous-owner@example.test', '+260971000103', ''
  );
  IF result->>'outcome' <> 'conflict' OR result ? 'reference' THEN
    RAISE EXCEPTION 'Different-key anonymous flight dedupe exposed an unowned request reference';
  END IF;
  result := public.create_flight_quote_request_once_for_customer(
    current_setting('phase4.owner_flight_anon_other_idem')::uuid,
    current_setting('phase4.owner_flight_anon_hash'), current_setting('phase4.owner_flight_anon_hash'),
    'LTA-20991110-3333333333333333', 'LUN', 'NBO', current_date + 75, NULL, 'oneway', 1, 0, 0, 'economy',
    'Synthetic Customer A', 'customer-a@example.test', '+260971000001', '',
    current_setting('phase4.customer_a_id')::uuid
  );
  IF result->>'outcome' <> 'conflict' OR result ? 'reference' THEN
    RAISE EXCEPTION 'Authenticated flight caller received an unowned anonymous request reference';
  END IF;

  result := public.create_kakande_ministry_request_once_for_customer(
    current_setting('phase4.owner_kakande_idem')::uuid,
    current_setting('phase4.owner_kakande_hash'), current_setting('phase4.owner_kakande_hash'),
    current_setting('phase4.owner_kakande_ref'), current_setting('phase4.owner_kakande_trip'), 'road', 2,
    current_setting('phase4.owner_kakande_trip_updated_at')::timestamptz,
    current_setting('phase4.owner_kakande_option_updated_at')::timestamptz,
    'Synthetic Owner A', 'owner-a@example.test', '+260971000101', 'Synthetic test request',
    current_setting('phase4.customer_a_id')::uuid
  );
  IF result->>'outcome' <> 'created' OR result->>'reference' <> current_setting('phase4.owner_kakande_ref')
     OR result#>>'{snapshot,totalQuotedAmountZmw}' <> '5000' THEN
    RAISE EXCEPTION 'Owner-aware Kakande intake did not persist its server-priced synthetic request';
  END IF;
  result := public.create_kakande_ministry_request_once_for_customer(
    current_setting('phase4.owner_kakande_idem')::uuid,
    current_setting('phase4.owner_kakande_hash'), current_setting('phase4.owner_kakande_hash'),
    'KMR-20991110-AAAAAAAAAAAAAAAA', current_setting('phase4.owner_kakande_trip'), 'road', 2,
    current_setting('phase4.owner_kakande_trip_updated_at')::timestamptz,
    current_setting('phase4.owner_kakande_option_updated_at')::timestamptz,
    'Synthetic Owner A', 'owner-a@example.test', '+260971000101', 'Synthetic test request',
    current_setting('phase4.customer_a_id')::uuid
  );
  IF result->>'outcome' <> 'duplicate' OR result->>'reference' <> current_setting('phase4.owner_kakande_ref') THEN
    RAISE EXCEPTION 'Same-owner Kakande idempotent retry did not return its original reference';
  END IF;
  result := public.create_kakande_ministry_request_once_for_customer(
    current_setting('phase4.owner_kakande_idem')::uuid,
    current_setting('phase4.owner_kakande_hash'), current_setting('phase4.owner_kakande_hash'),
    'KMR-20991110-FFFFFFFFFFFFFFFF', current_setting('phase4.owner_kakande_trip'), 'road', 2,
    current_setting('phase4.owner_kakande_trip_updated_at')::timestamptz,
    current_setting('phase4.owner_kakande_option_updated_at')::timestamptz,
    'Synthetic Owner B', 'owner-b@example.test', '+260971000102', 'Synthetic test request',
    current_setting('phase4.customer_b_id')::uuid
  );
  IF result->>'outcome' <> 'conflict' OR result ? 'reference' THEN
    RAISE EXCEPTION 'Cross-owner Kakande idempotency replay disclosed or returned another owner''s reference';
  END IF;
  result := public.create_kakande_ministry_request_once_for_customer(
    current_setting('phase4.owner_kakande_same_owner_idem')::uuid,
    current_setting('phase4.owner_kakande_hash'), current_setting('phase4.owner_kakande_hash'),
    'KMR-20991110-EEEEEEEEEEEEEEEE', current_setting('phase4.owner_kakande_trip'), 'road', 2,
    current_setting('phase4.owner_kakande_trip_updated_at')::timestamptz,
    current_setting('phase4.owner_kakande_option_updated_at')::timestamptz,
    'Synthetic Owner A', 'owner-a@example.test', '+260971000101', 'Synthetic test request',
    current_setting('phase4.customer_a_id')::uuid
  );
  IF result->>'outcome' <> 'duplicate' OR result->>'reference' <> current_setting('phase4.owner_kakande_ref') THEN
    RAISE EXCEPTION 'Same-owner Kakande rolling-dedup retry did not return its original reference';
  END IF;
  result := public.create_kakande_ministry_request_once_for_customer(
    current_setting('phase4.owner_kakande_other_idem')::uuid,
    current_setting('phase4.owner_kakande_hash'), current_setting('phase4.owner_kakande_hash'),
    'KMR-20991110-BBBBBBBBBBBBBBBB', current_setting('phase4.owner_kakande_trip'), 'road', 2,
    current_setting('phase4.owner_kakande_trip_updated_at')::timestamptz,
    current_setting('phase4.owner_kakande_option_updated_at')::timestamptz,
    'Synthetic Owner B', 'owner-b@example.test', '+260971000102', 'Synthetic test request',
    current_setting('phase4.customer_b_id')::uuid
  );
  IF result->>'outcome' <> 'conflict' OR result ? 'reference' THEN
    RAISE EXCEPTION 'Cross-owner Kakande rolling-dedup replay disclosed or returned another owner''s reference';
  END IF;
  result := public.create_kakande_ministry_request_once(
    current_setting('phase4.owner_kakande_idem')::uuid,
    current_setting('phase4.owner_kakande_hash'), current_setting('phase4.owner_kakande_hash'),
    'KMR-20991110-CCCCCCCCCCCCCCCC', current_setting('phase4.owner_kakande_trip'), 'road', 2,
    current_setting('phase4.owner_kakande_trip_updated_at')::timestamptz,
    current_setting('phase4.owner_kakande_option_updated_at')::timestamptz,
    'Synthetic Anonymous', 'anonymous-owner@example.test', '+260971000103', 'Synthetic test request'
  );
  IF result->>'outcome' <> 'conflict' OR result ? 'reference' THEN
    RAISE EXCEPTION 'Anonymous Kakande retry disclosed an authenticated owner''s reference';
  END IF;

  result := public.create_kakande_ministry_request_once(
    current_setting('phase4.owner_kakande_anon_idem')::uuid,
    current_setting('phase4.owner_kakande_anon_hash'), current_setting('phase4.owner_kakande_anon_hash'),
    current_setting('phase4.owner_kakande_anon_ref'), current_setting('phase4.owner_kakande_trip'), 'road', 1,
    current_setting('phase4.owner_kakande_trip_updated_at')::timestamptz,
    current_setting('phase4.owner_kakande_option_updated_at')::timestamptz,
    'Synthetic Anonymous', 'anonymous-owner@example.test', '+260971000103', 'Synthetic anonymous request'
  );
  IF result->>'outcome' <> 'created' OR result->>'reference' <> current_setting('phase4.owner_kakande_anon_ref') THEN
    RAISE EXCEPTION 'Backward-compatible anonymous Kakande creation failed';
  END IF;
  result := public.create_kakande_ministry_request_once(
    current_setting('phase4.owner_kakande_anon_idem')::uuid,
    current_setting('phase4.owner_kakande_anon_hash'), current_setting('phase4.owner_kakande_anon_hash'),
    'KMR-20991110-1111111111111111', current_setting('phase4.owner_kakande_trip'), 'road', 1,
    current_setting('phase4.owner_kakande_trip_updated_at')::timestamptz,
    current_setting('phase4.owner_kakande_option_updated_at')::timestamptz,
    'Synthetic Anonymous', 'anonymous-owner@example.test', '+260971000103', 'Synthetic anonymous request'
  );
  IF result->>'outcome' <> 'duplicate' OR result->>'reference' <> current_setting('phase4.owner_kakande_anon_ref') THEN
    RAISE EXCEPTION 'Same-key anonymous Kakande retry did not preserve its original reference';
  END IF;
  result := public.create_kakande_ministry_request_once(
    current_setting('phase4.owner_kakande_anon_other_idem')::uuid,
    current_setting('phase4.owner_kakande_anon_hash'), current_setting('phase4.owner_kakande_anon_hash'),
    'KMR-20991110-2222222222222222', current_setting('phase4.owner_kakande_trip'), 'road', 1,
    current_setting('phase4.owner_kakande_trip_updated_at')::timestamptz,
    current_setting('phase4.owner_kakande_option_updated_at')::timestamptz,
    'Synthetic Anonymous', 'anonymous-owner@example.test', '+260971000103', 'Synthetic anonymous request'
  );
  IF result->>'outcome' <> 'conflict' OR result ? 'reference' THEN
    RAISE EXCEPTION 'Different-key anonymous Kakande dedupe exposed an unowned request reference';
  END IF;
  result := public.create_kakande_ministry_request_once_for_customer(
    current_setting('phase4.owner_kakande_anon_other_idem')::uuid,
    current_setting('phase4.owner_kakande_anon_hash'), current_setting('phase4.owner_kakande_anon_hash'),
    'KMR-20991110-3333333333333333', current_setting('phase4.owner_kakande_trip'), 'road', 1,
    current_setting('phase4.owner_kakande_trip_updated_at')::timestamptz,
    current_setting('phase4.owner_kakande_option_updated_at')::timestamptz,
    'Synthetic Customer A', 'customer-a@example.test', '+260971000001', 'Synthetic authenticated request',
    current_setting('phase4.customer_a_id')::uuid
  );
  IF result->>'outcome' <> 'conflict' OR result ? 'reference' THEN
    RAISE EXCEPTION 'Authenticated Kakande caller received an unowned anonymous request reference';
  END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT user_id FROM public.flight_quote_requests WHERE reference = current_setting('phase4.owner_flight_ref'))
       IS DISTINCT FROM current_setting('phase4.customer_a_id')::uuid
     OR (SELECT user_id FROM public.kakande_ministry_requests WHERE reference = current_setting('phase4.owner_kakande_ref'))
       IS DISTINCT FROM current_setting('phase4.customer_a_id')::uuid THEN
    RAISE EXCEPTION 'Trusted intake did not persist the verified synthetic Auth owner';
  END IF;
END;
$$;

SELECT set_config('phase4.owner_kakande_request_id', (
  SELECT id::text FROM public.kakande_ministry_requests WHERE reference = current_setting('phase4.owner_kakande_ref')
), true);

-- Existing staff controls update status through their established authorization
-- paths. Customer RPCs must report the saved workflow values on the next read.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase4.agent_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', current_setting('phase4.agent_id'))::text, true);
DO $$
DECLARE result jsonb;
BEGIN
  UPDATE public.flight_quote_requests SET status = 'reviewing'
  WHERE reference = current_setting('phase4.owner_flight_ref');
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent could not update the synthetic flight request through existing staff RLS'; END IF;
  result := public.update_kakande_ministry_request(
    current_setting('phase4.owner_kakande_request_id')::uuid, 'in_progress', ''
  );
  IF result->>'outcome' <> 'updated' OR result->>'status' <> 'in_progress' THEN
    RAISE EXCEPTION 'Agent could not advance the synthetic Kakande request through the existing staff RPC';
  END IF;
END;
$$;
RESET ROLE;

-- Customer B must not see either new Customer A request via the customer RPCs.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase4.customer_b_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', current_setting('phase4.customer_b_id'))::text, true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.my_flight_quote_requests() WHERE reference = current_setting('phase4.owner_flight_ref'))
     OR EXISTS (SELECT 1 FROM public.my_kakande_ministry_requests() WHERE reference = current_setting('phase4.owner_kakande_ref')) THEN
    RAISE EXCEPTION 'Customer B can see a request owned by Customer A';
  END IF;
END;
$$;
RESET ROLE;

-- The only permitted owner clearing is the Auth FK ON DELETE SET NULL action.
-- A savepoint restores the synthetic Auth user and all dependent rows immediately.
SAVEPOINT phase4_auth_delete_fixture;
DELETE FROM auth.users WHERE id = current_setting('phase4.customer_a_id')::uuid;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.flight_quote_requests
    WHERE reference = current_setting('phase4.owner_flight_ref') AND user_id IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM public.kakande_ministry_requests
    WHERE reference = current_setting('phase4.owner_kakande_ref') AND user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Auth user deletion did not clear synthetic request ownership';
  END IF;
END;
$$;
ROLLBACK TO SAVEPOINT phase4_auth_delete_fixture;

-- Synthetic request rows only. Kakande fixtures reference a historical option
-- seeded by the Kakande migration; no trip/option configuration is changed.
INSERT INTO public.flight_quote_requests (
  reference, idempotency_key, request_hash, dedupe_key, origin, destination,
  departure_date, return_date, trip_type, adults, children, infants, cabin_class,
  customer_name, customer_email, customer_phone, special_requests, status,
  internal_notes, user_id
)
VALUES
  (current_setting('phase4.flight_a_ref'), gen_random_uuid(), repeat('a', 43), repeat('d', 43), 'LUN', 'JNB', current_date + 45, NULL, 'oneway', 1, 0, 0, 'economy', 'Synthetic Customer A', 'customer-a@example.test', '+260971000001', 'PRIVATE_FLIGHT_REQUEST_NOTE', 'quoted', 'PRIVATE_FLIGHT_INTERNAL_NOTE', current_setting('phase4.customer_a_id')::uuid),
  (current_setting('phase4.flight_b_ref'), gen_random_uuid(), repeat('b', 43), repeat('e', 43), 'LUN', 'NBO', current_date + 55, NULL, 'oneway', 1, 0, 0, 'economy', 'Synthetic Customer B', 'customer-b@example.test', '+260971000002', 'PRIVATE_FLIGHT_REQUEST_NOTE', 'reviewing', 'PRIVATE_FLIGHT_INTERNAL_NOTE', current_setting('phase4.customer_b_id')::uuid),
  (current_setting('phase4.flight_anon_ref'), gen_random_uuid(), repeat('c', 43), repeat('f', 43), 'LUN', 'DAR', current_date + 65, NULL, 'oneway', 1, 0, 0, 'economy', 'Synthetic Anonymous Customer', 'anonymous@example.test', '+260971000003', 'PRIVATE_FLIGHT_REQUEST_NOTE', 'pending', 'PRIVATE_FLIGHT_INTERNAL_NOTE', NULL);

INSERT INTO public.kakande_ministry_requests (
  reference, trip_id, option_id, trip_month, travel_mode, travel_date,
  price_per_traveller_zmw, traveller_count, currency_code, customer_name,
  customer_email, customer_phone, customer_notes, status, internal_notes, user_id
)
SELECT fixture.reference, trip.trip_id, option.option_id, trip.month_label,
       option.transport_mode, option.departure_date, option.price_per_traveller_zmw,
       1, 'ZMW', fixture.customer_name, fixture.customer_email, fixture.customer_phone,
       'PRIVATE_KAKANDE_CUSTOMER_NOTE', fixture.status,
       'PRIVATE_KAKANDE_INTERNAL_NOTE', fixture.user_id
FROM (VALUES
  (current_setting('phase4.kakande_a_ref')::text, 'Synthetic Customer A'::text, 'customer-a@example.test'::text, '+260971000001'::text, 'pending'::text, current_setting('phase4.customer_a_id')::uuid),
  (current_setting('phase4.kakande_b_ref')::text, 'Synthetic Customer B'::text, 'customer-b@example.test'::text, '+260971000002'::text, 'in_progress'::text, current_setting('phase4.customer_b_id')::uuid),
  (current_setting('phase4.kakande_anon_ref')::text, 'Synthetic Anonymous Customer'::text, 'anonymous@example.test'::text, '+260971000003'::text, 'pending'::text, NULL::uuid)
) AS fixture(reference, customer_name, customer_email, customer_phone, status, user_id)
CROSS JOIN private.kakande_monthly_trips AS trip
JOIN private.kakande_trip_options AS option
  ON option.trip_id = trip.trip_id AND option.transport_mode = 'flight'
WHERE trip.trip_id = 'jun-2026';

DO $$
DECLARE inserted_count integer;
BEGIN
  SELECT count(*) INTO inserted_count FROM public.kakande_ministry_requests
  WHERE reference IN (current_setting('phase4.kakande_a_ref'), current_setting('phase4.kakande_b_ref'), current_setting('phase4.kakande_anon_ref'));
  IF inserted_count <> 3 THEN RAISE EXCEPTION 'Expected three synthetic Kakande requests; found %', inserted_count; END IF;
END;
$$;

INSERT INTO public.kakande_request_events (request_id, actor_id, event_type)
SELECT request.id, current_setting('phase4.agent_id')::uuid, 'request_created'
FROM public.kakande_ministry_requests AS request
WHERE request.reference = current_setting('phase4.kakande_a_ref');

-- Anonymous callers cannot execute either customer read RPC.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN PERFORM 1 FROM public.my_flight_quote_requests();
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Anonymous caller executed flight customer-read RPC'; END IF;
  denied := false;
  BEGIN PERFORM 1 FROM public.my_kakande_ministry_requests();
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Anonymous caller executed Kakande customer-read RPC'; END IF;
END;
$$;
RESET ROLE;

-- Customer A sees only A's owned rows. Direct table and audit reads remain staff-only.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase4.customer_a_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', current_setting('phase4.customer_a_id'))::text, true);
DO $$
DECLARE flight_count integer; kakande_count integer; row_json jsonb;
BEGIN
  IF auth.uid() IS DISTINCT FROM current_setting('phase4.customer_a_id')::uuid THEN RAISE EXCEPTION 'Customer A JWT simulation did not resolve'; END IF;
  SELECT count(*) INTO flight_count FROM public.my_flight_quote_requests()
  WHERE reference IN (current_setting('phase4.flight_a_ref'), current_setting('phase4.flight_b_ref'), current_setting('phase4.flight_anon_ref'));
  SELECT count(*) INTO kakande_count FROM public.my_kakande_ministry_requests()
  WHERE reference IN (current_setting('phase4.kakande_a_ref'), current_setting('phase4.kakande_b_ref'), current_setting('phase4.kakande_anon_ref'));
  IF flight_count <> 1 OR kakande_count <> 1 THEN RAISE EXCEPTION 'Customer A did not receive exactly its own request in both workflows'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.my_flight_quote_requests() WHERE reference = current_setting('phase4.flight_a_ref'))
     OR EXISTS (SELECT 1 FROM public.my_flight_quote_requests() WHERE reference IN (current_setting('phase4.flight_b_ref'), current_setting('phase4.flight_anon_ref')))
     OR NOT EXISTS (SELECT 1 FROM public.my_kakande_ministry_requests() WHERE reference = current_setting('phase4.kakande_a_ref'))
     OR EXISTS (SELECT 1 FROM public.my_kakande_ministry_requests() WHERE reference IN (current_setting('phase4.kakande_b_ref'), current_setting('phase4.kakande_anon_ref')))
     OR EXISTS (SELECT 1 FROM public.flight_quote_requests WHERE reference = current_setting('phase4.flight_a_ref'))
     OR EXISTS (SELECT 1 FROM public.kakande_ministry_requests WHERE reference = current_setting('phase4.kakande_a_ref'))
     OR EXISTS (SELECT 1 FROM public.kakande_request_events)
     OR NOT EXISTS (SELECT 1 FROM public.my_flight_quote_requests() WHERE reference = current_setting('phase4.owner_flight_ref') AND status = 'reviewing')
     OR NOT EXISTS (SELECT 1 FROM public.my_kakande_ministry_requests() WHERE reference = current_setting('phase4.owner_kakande_ref') AND status = 'in_progress') THEN
    RAISE EXCEPTION 'Customer A saw a foreign, anonymous, direct-table, or audit record';
  END IF;
  SELECT to_jsonb(request) INTO row_json FROM public.my_flight_quote_requests() AS request WHERE reference = current_setting('phase4.flight_a_ref');
  IF row_json ?| ARRAY['customer_name', 'internal_notes', 'customer_email', 'customer_phone', 'special_requests', 'user_id', 'idempotency_key', 'request_hash', 'dedupe_key'] THEN
    RAISE EXCEPTION 'Flight customer RPC exposed a private field';
  END IF;
  SELECT to_jsonb(request) INTO row_json FROM public.my_kakande_ministry_requests() AS request WHERE reference = current_setting('phase4.kakande_a_ref');
  IF row_json ?| ARRAY['customer_name', 'internal_notes', 'customer_notes', 'customer_email', 'customer_phone', 'user_id', 'trip_id', 'option_id'] THEN
    RAISE EXCEPTION 'Kakande customer RPC exposed a private field';
  END IF;
END;
$$;

-- Neither direct update privileges nor the staff RPC can reassign ownership.
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    UPDATE public.flight_quote_requests SET user_id = current_setting('phase4.customer_b_id')::uuid
    WHERE reference = current_setting('phase4.flight_a_ref');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Customer A reassigned flight request ownership'; END IF;
  denied := false;
  BEGIN
    UPDATE public.kakande_ministry_requests SET user_id = current_setting('phase4.customer_b_id')::uuid
    WHERE reference = current_setting('phase4.kakande_a_ref');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Customer A reassigned Kakande request ownership'; END IF;
END;
$$;
RESET ROLE;

-- Customer B sees only B's rows.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase4.customer_b_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', current_setting('phase4.customer_b_id'))::text, true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.my_flight_quote_requests() WHERE reference IN (current_setting('phase4.flight_a_ref'), current_setting('phase4.flight_b_ref'), current_setting('phase4.flight_anon_ref'))) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.my_flight_quote_requests() WHERE reference = current_setting('phase4.flight_b_ref'))
     OR EXISTS (SELECT 1 FROM public.my_flight_quote_requests() WHERE reference IN (current_setting('phase4.flight_a_ref'), current_setting('phase4.flight_anon_ref'))) THEN
    RAISE EXCEPTION 'Customer B flight isolation failed';
  END IF;
  IF (SELECT count(*) FROM public.my_kakande_ministry_requests() WHERE reference IN (current_setting('phase4.kakande_a_ref'), current_setting('phase4.kakande_b_ref'), current_setting('phase4.kakande_anon_ref'))) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.my_kakande_ministry_requests() WHERE reference = current_setting('phase4.kakande_b_ref'))
     OR EXISTS (SELECT 1 FROM public.my_kakande_ministry_requests() WHERE reference IN (current_setting('phase4.kakande_a_ref'), current_setting('phase4.kakande_anon_ref'))) THEN
    RAISE EXCEPTION 'Customer B Kakande isolation failed';
  END IF;
END;
$$;
RESET ROLE;

-- Authenticated without a UID cannot use either RPC.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN PERFORM 1 FROM public.my_flight_quote_requests();
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'UID-less authenticated flight call was accepted'; END IF;
  denied := false;
  BEGIN PERFORM 1 FROM public.my_kakande_ministry_requests();
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'UID-less authenticated Kakande call was accepted'; END IF;
END;
$$;
RESET ROLE;

-- Existing agent and admin RLS reads remain available, including Kakande audit.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase4.agent_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', current_setting('phase4.agent_id'))::text, true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.flight_quote_requests WHERE reference IN (current_setting('phase4.flight_a_ref'), current_setting('phase4.flight_b_ref'), current_setting('phase4.flight_anon_ref'))) <> 3
     OR (SELECT count(*) FROM public.kakande_ministry_requests WHERE reference IN (current_setting('phase4.kakande_a_ref'), current_setting('phase4.kakande_b_ref'), current_setting('phase4.kakande_anon_ref'))) <> 3
     OR (SELECT count(*) FROM public.kakande_request_events AS event
         JOIN public.kakande_ministry_requests AS request ON request.id = event.request_id
         WHERE request.reference = current_setting('phase4.kakande_a_ref')) <> 1 THEN
    RAISE EXCEPTION 'Existing staff RLS reads were changed';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase4.admin_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', current_setting('phase4.admin_id'))::text, true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.flight_quote_requests WHERE reference IN (current_setting('phase4.flight_a_ref'), current_setting('phase4.flight_b_ref'), current_setting('phase4.flight_anon_ref'))) <> 3
     OR (SELECT count(*) FROM public.kakande_ministry_requests WHERE reference IN (current_setting('phase4.kakande_a_ref'), current_setting('phase4.kakande_b_ref'), current_setting('phase4.kakande_anon_ref'))) <> 3 THEN
    RAISE EXCEPTION 'Admin staff RLS reads were changed';
  END IF;
END;
$$;
RESET ROLE;

-- Ownership can be set on insert by trusted intake only, never changed later.
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    UPDATE public.flight_quote_requests SET user_id = current_setting('phase4.customer_b_id')::uuid
    WHERE reference = current_setting('phase4.flight_a_ref');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Database allowed reassignment of a flight owner'; END IF;
  denied := false;
  BEGIN
    UPDATE public.kakande_ministry_requests SET user_id = current_setting('phase4.customer_b_id')::uuid
    WHERE reference = current_setting('phase4.kakande_a_ref');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Database allowed reassignment of a Kakande owner'; END IF;
END;
$$;

SELECT 'PASS: request ownership, authenticated intake, owner-scoped replay, Auth deletion, private-field isolation, and staff reads are covered' AS result;
ROLLBACK;
