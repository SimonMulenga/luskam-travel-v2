-- Read-only catalog verification for Phase 6A / 7A workflow objects.
-- Intended for the authorized staging SQL Editor after migration 20261020100000.
-- Every statement is a SELECT; the explicit READ ONLY transaction prevents
-- accidental data or schema changes if this script is edited later.
-- This script does not inspect customer rows or Auth user identifiers.

BEGIN TRANSACTION READ ONLY;

SELECT 'workflow tables and legacy booking presence' AS verification_section;
WITH expected(table_name) AS (
  VALUES
    ('flight_quotations'),
    ('flight_quotation_items'),
    ('flight_quotation_events'),
    ('flight_quote_bookings'),
    ('flight_quote_booking_events'),
    ('flight_bookings')
)
SELECT expected.table_name,
       to_regclass(format('public.%I', expected.table_name)) IS NOT NULL AS exists,
       relation.relrowsecurity AS rls_enabled,
       relation.relforcerowsecurity AS rls_forced
FROM expected
LEFT JOIN pg_catalog.pg_class AS relation
  ON relation.oid = to_regclass(format('public.%I', expected.table_name))
ORDER BY expected.table_name;

SELECT 'workflow table columns' AS verification_section;
SELECT table_name, ordinal_position, column_name, data_type,
       udt_name, numeric_precision, numeric_scale, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'flight_quotations',
    'flight_quotation_items',
    'flight_quotation_events',
    'flight_quote_bookings',
    'flight_quote_booking_events'
  )
ORDER BY table_name, ordinal_position;

SELECT 'workflow constraints' AS verification_section;
SELECT table_name, constraint_name, constraint_type,
       pg_catalog.pg_get_constraintdef(constraint_row.oid, true) AS definition
FROM information_schema.table_constraints AS table_constraint
JOIN pg_catalog.pg_constraint AS constraint_row
  ON constraint_row.conname = table_constraint.constraint_name
JOIN pg_catalog.pg_class AS relation
  ON relation.oid = constraint_row.conrelid
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = relation.relnamespace
 AND namespace.nspname = table_constraint.constraint_schema
WHERE table_constraint.constraint_schema = 'public'
  AND table_constraint.table_name IN (
    'flight_quotations',
    'flight_quotation_items',
    'flight_quotation_events',
    'flight_quote_bookings',
    'flight_quote_booking_events'
  )
ORDER BY table_name, constraint_name;

SELECT 'workflow indexes' AS verification_section;
SELECT schemaname, tablename, indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'flight_quotations',
    'flight_quotation_items',
    'flight_quotation_events',
    'flight_quote_bookings',
    'flight_quote_booking_events'
  )
ORDER BY tablename, indexname;

SELECT 'workflow functions and security configuration' AS verification_section;
WITH expected(schema_name, function_name, identity_arguments) AS (
  VALUES
    ('private', 'guard_flight_quotation_update', ''),
    ('private', 'guard_flight_quotation_item', ''),
    ('private', 'prevent_flight_audit_mutation', ''),
    ('private', 'guard_flight_quote_booking_update', ''),
    ('private', 'assert_flight_ops_staff', ''),
    ('private', 'recalculate_flight_quotation', 'uuid'),
    ('private', 'replace_flight_quotation_draft_items', 'uuid, jsonb'),
    ('private', 'touch_flight_quote_booking', ''),
    ('public', 'create_flight_quotation_draft', 'uuid, jsonb'),
    ('public', 'edit_flight_quotation_draft', 'uuid, jsonb'),
    ('public', 'revise_flight_quotation', 'uuid, jsonb'),
    ('public', 'issue_flight_quotation', 'uuid'),
    ('public', 'expire_flight_quotation', 'uuid'),
    ('public', 'respond_to_flight_quotation', 'uuid, boolean'),
    ('public', 'update_flight_quote_booking_status', 'uuid, text, text, text, text'),
    ('public', 'my_flight_quotations', ''),
    ('public', 'my_flight_quote_bookings', '')
)
SELECT expected.schema_name, expected.function_name,
       expected.identity_arguments AS expected_arguments,
       function_row.oid IS NOT NULL AS exists,
       pg_catalog.pg_get_function_identity_arguments(function_row.oid) AS actual_arguments,
       pg_catalog.format_type(function_row.prorettype, NULL) AS return_type,
       pg_catalog.pg_get_userbyid(function_row.proowner) AS owner,
       function_row.prosecdef AS security_definer,
       function_row.provolatile AS volatility,
       function_row.proconfig AS function_settings,
       CASE WHEN function_row.oid IS NULL THEN NULL
            ELSE has_function_privilege('anon', function_row.oid, 'EXECUTE') END AS anon_execute,
       CASE WHEN function_row.oid IS NULL THEN NULL
            ELSE has_function_privilege('authenticated', function_row.oid, 'EXECUTE') END AS authenticated_execute,
       CASE WHEN function_row.oid IS NULL THEN NULL
            ELSE has_function_privilege('service_role', function_row.oid, 'EXECUTE') END AS service_role_execute,
       CASE WHEN function_row.oid IS NULL THEN NULL ELSE EXISTS (
         SELECT 1
         FROM aclexplode(COALESCE(function_row.proacl,
                                  acldefault('f', function_row.proowner))) AS acl_entry
         WHERE acl_entry.grantee = 0 AND acl_entry.privilege_type = 'EXECUTE'
       ) END AS public_execute
FROM expected
LEFT JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.nspname = expected.schema_name
LEFT JOIN pg_catalog.pg_proc AS function_row
  ON function_row.pronamespace = namespace.oid
 AND function_row.proname = expected.function_name
 AND pg_catalog.pg_get_function_identity_arguments(function_row.oid) = expected.identity_arguments
ORDER BY expected.schema_name, expected.function_name;

SELECT 'workflow table grants' AS verification_section;
WITH expected(table_name) AS (
  VALUES
    ('flight_quotations'),
    ('flight_quotation_items'),
    ('flight_quotation_events'),
    ('flight_quote_bookings'),
    ('flight_quote_booking_events')
)
SELECT expected.table_name,
       CASE WHEN to_regclass(format('public.%I', expected.table_name)) IS NULL THEN NULL
            ELSE has_table_privilege('anon', to_regclass(format('public.%I', expected.table_name)), 'SELECT') END AS anon_select,
       CASE WHEN to_regclass(format('public.%I', expected.table_name)) IS NULL THEN NULL
            ELSE has_table_privilege('authenticated', to_regclass(format('public.%I', expected.table_name)), 'SELECT') END AS authenticated_select,
       CASE WHEN to_regclass(format('public.%I', expected.table_name)) IS NULL THEN NULL
            ELSE has_table_privilege('authenticated', to_regclass(format('public.%I', expected.table_name)), 'INSERT') END AS authenticated_insert,
       CASE WHEN to_regclass(format('public.%I', expected.table_name)) IS NULL THEN NULL
            ELSE has_table_privilege('authenticated', to_regclass(format('public.%I', expected.table_name)), 'UPDATE') END AS authenticated_update,
       CASE WHEN to_regclass(format('public.%I', expected.table_name)) IS NULL THEN NULL
            ELSE has_table_privilege('authenticated', to_regclass(format('public.%I', expected.table_name)), 'DELETE') END AS authenticated_delete,
       CASE WHEN to_regclass(format('public.%I', expected.table_name)) IS NULL THEN NULL
            ELSE has_table_privilege('service_role', to_regclass(format('public.%I', expected.table_name)), 'INSERT') END AS service_role_insert,
       CASE WHEN to_regclass(format('public.%I', expected.table_name)) IS NULL THEN NULL
            ELSE has_table_privilege('service_role', to_regclass(format('public.%I', expected.table_name)), 'UPDATE') END AS service_role_update
FROM expected
ORDER BY expected.table_name;

SELECT 'workflow RLS policies' AS verification_section;
SELECT schemaname, tablename, policyname, permissive, roles,
       cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'flight_quotations',
    'flight_quotation_items',
    'flight_quotation_events',
    'flight_quote_bookings',
    'flight_quote_booking_events'
  )
ORDER BY tablename, policyname;

SELECT 'workflow triggers and enabled state' AS verification_section;
SELECT namespace.nspname AS schema_name,
       relation.relname AS table_name,
       trigger_row.tgname AS trigger_name,
       trigger_row.tgenabled AS enabled_code,
       pg_catalog.pg_get_triggerdef(trigger_row.oid, true) AS definition,
       trigger_function_namespace.nspname AS function_schema,
       trigger_function.proname AS function_name
FROM pg_catalog.pg_trigger AS trigger_row
JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
JOIN pg_catalog.pg_proc AS trigger_function ON trigger_function.oid = trigger_row.tgfoid
JOIN pg_catalog.pg_namespace AS trigger_function_namespace
  ON trigger_function_namespace.oid = trigger_function.pronamespace
WHERE namespace.nspname = 'public'
  AND relation.relname IN (
    'flight_quotations',
    'flight_quotation_items',
    'flight_quotation_events',
    'flight_quote_bookings',
    'flight_quote_booking_events'
  )
  AND NOT trigger_row.tgisinternal
ORDER BY relation.relname, trigger_row.tgname;

ROLLBACK;
