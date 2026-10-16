-- Read-only inspection of the deployed quotations authorization setup.
-- Run only after verifying dashboard project ref ikbffvqkxwhkwlocjufc.
-- This query does not create or modify data.

SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'quotes';

SELECT
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS check_expression
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'quotes'
ORDER BY policyname;

SELECT
  role_name,
  has_table_privilege(role_name, 'public.quotes', 'SELECT') AS can_select,
  has_table_privilege(role_name, 'public.quotes', 'INSERT') AS can_insert,
  has_table_privilege(role_name, 'public.quotes', 'UPDATE') AS can_update,
  has_table_privilege(role_name, 'public.quotes', 'DELETE') AS can_delete
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS roles(role_name)
ORDER BY role_name;

SELECT grantee, privilege_type, is_grantable
FROM information_schema.table_privileges
WHERE table_schema = 'public' AND table_name = 'quotes'
ORDER BY grantee, privilege_type;

SELECT
  t.tgname AS trigger_name,
  p.proname AS function_name,
  p.prosecdef AS security_definer,
  pg_get_function_identity_arguments(p.oid) AS function_arguments,
  p.proconfig AS function_settings
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public' AND c.relname = 'quotes' AND NOT t.tgisinternal
ORDER BY t.tgname;

SELECT
  p.oid::regprocedure AS function_signature,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND (p.proname = 'has_role' OR p.proname ILIKE '%quote%'
       OR pg_get_functiondef(p.oid) ILIKE '%public.quotes%')
ORDER BY p.proname;

-- Expected policy set after migration 20261015150000:
-- customers read own quotes (SELECT), staff read all quotes (SELECT),
-- staff insert quotes (INSERT), staff update quotes (UPDATE),
-- staff delete quotes (DELETE). Authenticated has table privileges, but RLS
-- limits customer writes; anon has no table privileges; service_role bypasses
-- RLS as a trusted backend role.
