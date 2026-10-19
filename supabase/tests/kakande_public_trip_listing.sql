-- Rollback-only test for the intentionally public Kakande option catalogue.
-- Run as postgres/supabase_admin in staging after migration 20261018130000.
-- All fixtures are generated here and removed by the final ROLLBACK. Never COMMIT.
BEGIN;

SELECT set_config('phase10_public.open_trip', 'testpub-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20), true);
SELECT set_config('phase10_public.unpublished_trip', 'testpub-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20), true);
SELECT set_config('phase10_public.unpublished_option_trip', 'testpub-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20), true);
SELECT set_config('phase10_public.closed_trip', 'testpub-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20), true);
SELECT set_config('phase10_public.full_trip', 'testpub-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20), true);
SELECT set_config('phase10_public.expired_trip', 'testpub-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20), true);
SELECT set_config('phase10_public.invalid_label_trip', 'testpub-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20), true);
SELECT set_config('phase10_public.authenticated_uid', gen_random_uuid()::text, true);

DO $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Run this rollback-only fixture test as postgres or supabase_admin';
  END IF;
  IF has_table_privilege('anon', 'private.kakande_monthly_trips', 'SELECT')
     OR has_table_privilege('anon', 'private.kakande_trip_options', 'SELECT')
     OR has_table_privilege('authenticated', 'private.kakande_monthly_trips', 'SELECT')
     OR has_table_privilege('authenticated', 'private.kakande_trip_options', 'SELECT') THEN
    RAISE EXCEPTION 'Browser roles received direct access to private trip tables';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure_row
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure_row.proacl, pg_catalog.acldefault('f', procedure_row.proowner))
    ) AS privilege_row
    WHERE procedure_row.oid = 'public.list_public_kakande_trip_options()'::regprocedure
      AND privilege_row.grantee = 0
      AND privilege_row.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'The public catalogue has an unintended PUBLIC EXECUTE grant';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS relation_row
    JOIN pg_catalog.pg_namespace AS namespace_row ON namespace_row.oid = relation_row.relnamespace
    WHERE namespace_row.nspname = 'private'
      AND relation_row.relname = 'kakande_monthly_trips'
      AND relation_row.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS relation_row
    JOIN pg_catalog.pg_namespace AS namespace_row ON namespace_row.oid = relation_row.relnamespace
    WHERE namespace_row.nspname = 'private'
      AND relation_row.relname = 'kakande_trip_options'
      AND relation_row.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Private Kakande trip tables must retain row-level security';
  END IF;
END;
$$;

-- Synthetic fixture rows only. No production or existing trip records are updated.
INSERT INTO private.kakande_monthly_trips (trip_id, month_label, is_published)
VALUES
  (current_setting('phase10_public.open_trip'), 'November 2099', true),
  (current_setting('phase10_public.unpublished_trip'), 'November 2099', false),
  (current_setting('phase10_public.unpublished_option_trip'), 'November 2099', true),
  (current_setting('phase10_public.closed_trip'), 'November 2099', true),
  (current_setting('phase10_public.full_trip'), 'November 2099', true),
  (current_setting('phase10_public.expired_trip'), 'November 2020', true),
  (current_setting('phase10_public.invalid_label_trip'), 'Internal draft label', true);

INSERT INTO private.kakande_trip_options
  (trip_id, transport_mode, departure_date, price_per_traveller_zmw, is_published, availability)
VALUES
  (current_setting('phase10_public.open_trip'), 'flight', current_date + 40, 1000, true, 'open'),
  (current_setting('phase10_public.open_trip'), 'road', current_date + 38, 500, true, 'filling_fast'),
  (current_setting('phase10_public.unpublished_trip'), 'flight', current_date + 40, 1000, true, 'open'),
  (current_setting('phase10_public.unpublished_option_trip'), 'road', current_date + 38, 500, false, 'open'),
  (current_setting('phase10_public.closed_trip'), 'flight', current_date + 40, 1000, true, 'closed'),
  (current_setting('phase10_public.full_trip'), 'road', current_date + 38, 500, true, 'fully_booked'),
  (current_setting('phase10_public.expired_trip'), 'flight', current_date - 1, 1000, true, 'open'),
  (current_setting('phase10_public.invalid_label_trip'), 'road', current_date + 38, 500, true, 'open');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
DECLARE visible_count integer; expected_option_count integer;
BEGIN
  IF NOT has_function_privilege('anon', 'public.list_public_kakande_trip_options()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role cannot execute the public read-only catalogue';
  END IF;

  SELECT count(*) INTO visible_count
  FROM public.list_public_kakande_trip_options()
  WHERE trip_id = current_setting('phase10_public.open_trip');
  IF visible_count <> 2 THEN
    RAISE EXCEPTION 'Published future open/filling-fast options were not both returned';
  END IF;

  SELECT count(*) INTO expected_option_count
  FROM public.list_public_kakande_trip_options()
  WHERE trip_id = current_setting('phase10_public.open_trip')
    AND ((transport_mode = 'flight' AND departure_date > current_date
          AND price_per_traveller_zmw = 1000 AND availability = 'open')
      OR (transport_mode = 'road' AND departure_date > current_date
          AND price_per_traveller_zmw = 500 AND availability = 'filling_fast'));
  IF expected_option_count <> 2 THEN
    RAISE EXCEPTION 'Public option response did not contain the expected customer-facing fields';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.list_public_kakande_trip_options()
    WHERE trip_id IN (
      current_setting('phase10_public.unpublished_trip'),
      current_setting('phase10_public.unpublished_option_trip'),
      current_setting('phase10_public.closed_trip'),
      current_setting('phase10_public.full_trip'),
      current_setting('phase10_public.expired_trip'),
      current_setting('phase10_public.invalid_label_trip')
    )
  ) THEN
    RAISE EXCEPTION 'Unpublished, closed, fully booked, or expired option was exposed';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase10_public.authenticated_uid'), true);
SELECT set_config('request.jwt.claims', json_build_object(
  'role', 'authenticated',
  'sub', current_setting('phase10_public.authenticated_uid')
)::text, true);
DO $$
DECLARE visible_count integer;
BEGIN
  IF auth.uid() IS DISTINCT FROM current_setting('phase10_public.authenticated_uid')::uuid THEN
    RAISE EXCEPTION 'Authenticated customer JWT simulation did not resolve to its synthetic subject';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.list_public_kakande_trip_options()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated customers cannot execute the public read-only catalogue';
  END IF;

  SELECT count(*) INTO visible_count
  FROM public.list_public_kakande_trip_options()
  WHERE trip_id = current_setting('phase10_public.open_trip');
  IF visible_count <> 2 THEN
    RAISE EXCEPTION 'Authenticated customer did not receive the eligible published options';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.list_public_kakande_trip_options()
    WHERE trip_id IN (
      current_setting('phase10_public.unpublished_trip'),
      current_setting('phase10_public.unpublished_option_trip'),
      current_setting('phase10_public.closed_trip'),
      current_setting('phase10_public.full_trip'),
      current_setting('phase10_public.expired_trip'),
      current_setting('phase10_public.invalid_label_trip')
    )
  ) THEN
    RAISE EXCEPTION 'Authenticated customer received a hidden or ineligible option';
  END IF;
END;
$$;
RESET ROLE;

SELECT 'PASS: anonymous and authenticated customers see only published future selectable synthetic options' AS result;
ROLLBACK;
