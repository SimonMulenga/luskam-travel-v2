-- Static database completeness assertions for a fresh local Supabase project.
-- Run after `supabase db reset` against the LOCAL stack only.
DO $$
DECLARE
  object_name text;
  expected_tables text[] := ARRAY[
    'profiles', 'bookings', 'quotes', 'user_roles', 'pricing_rules',
    'booking_pricing', 'pricing_audit_log', 'flight_searches', 'flight_results',
    'flight_bookings', 'booking_passengers', 'booking_segments',
    'booking_payments', 'flight_provider_logs', 'site_content', 'blog_posts',
    'newsletter_subscribers'
  ];
BEGIN
  FOREACH object_name IN ARRAY expected_tables LOOP
    IF to_regclass(format('public.%I', object_name)) IS NULL THEN
      RAISE EXCEPTION 'Missing expected table public.%', object_name;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(format('public.%I', object_name))) THEN
      RAISE EXCEPTION 'RLS is not enabled for public.%', object_name;
    END IF;
  END LOOP;

  IF to_regclass('public.site_content_pkey') IS NULL
    OR to_regclass('public.blog_posts_slug_key') IS NULL
    OR to_regclass('public.newsletter_subscribers_email_key') IS NULL THEN
    RAISE EXCEPTION 'Expected CMS primary/unique constraints are missing';
  END IF;
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL
    OR to_regprocedure('public.request_booking_cancellation(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Required role or cancellation function is missing';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.has_role(uuid,public.app_role)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.has_role(uuid,public.app_role)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Role helper execution grants are too broad or missing';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.request_booking_cancellation(uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.request_booking_cancellation(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Cancellation RPC execution grants are too broad or missing';
  END IF;
  IF to_regclass('storage.buckets') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM storage.buckets
      WHERE id = 'site-media'
        AND public
        AND file_size_limit = 10485760
        AND allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']::text[]
    ) THEN
    RAISE EXCEPTION 'Public site-media bucket or expected MIME/size restrictions are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='site_content' AND policyname='Admins update site content')
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='blog_posts' AND policyname='Public reads published blog posts')
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='newsletter_subscribers' AND policyname='Admins read subscribers') THEN
    RAISE EXCEPTION 'Expected CMS RLS policies are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Admins upload CMS media')
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Public read CMS media') THEN
    RAISE EXCEPTION 'Expected site-media Storage policies are missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Admins upload CMS media'
      AND with_check LIKE '%site-media%'
      AND with_check LIKE '%has_role%'
      AND with_check LIKE '%foldername%'
  ) THEN
    RAISE EXCEPTION 'CMS upload policy is not scoped to admin role, bucket, and expected folders';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created_grant_director' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Unsafe hard-coded director admin trigger remains installed';
  END IF;
  IF has_table_privilege('anon', 'public.site_content', 'INSERT')
    OR has_table_privilege('authenticated', 'public.newsletter_subscribers', 'UPDATE') THEN
    RAISE EXCEPTION 'Unexpected CMS write grant exists';
  END IF;
  IF has_table_privilege('anon', 'public.quotes', 'SELECT')
    OR has_table_privilege('anon', 'public.quotes', 'INSERT')
    OR has_table_privilege('authenticated', 'public.quotes', 'SELECT') IS FALSE
    OR has_table_privilege('service_role', 'public.quotes', 'INSERT') IS FALSE THEN
    RAISE EXCEPTION 'Quote grants do not match owner-read/staff-write expectations';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'quotes'
      AND policyname = 'own quotes all'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'quotes'
      AND policyname = 'customers read own quotes' AND cmd = 'SELECT'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'quotes'
      AND policyname = 'staff read all quotes' AND cmd = 'SELECT'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'quotes'
      AND policyname = 'staff insert quotes' AND cmd = 'INSERT'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'quotes'
      AND policyname = 'staff update quotes' AND cmd = 'UPDATE'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'quotes'
      AND policyname = 'staff delete quotes' AND cmd = 'DELETE'
  ) THEN
    RAISE EXCEPTION 'Quote RLS policies do not match the hardened authorization model';
  END IF;
END;
$$;

-- Review output for constraints, explicit indexes, triggers and policies.
SELECT conrelid::regclass AS table_name, conname AS constraint_name, contype
FROM pg_constraint
WHERE connamespace='public'::regnamespace
  AND conrelid IN ('public.site_content'::regclass, 'public.blog_posts'::regclass, 'public.newsletter_subscribers'::regclass)
ORDER BY 1, 2;
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('site_content', 'blog_posts', 'newsletter_subscribers')
ORDER BY tablename, indexname;
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE (schemaname='public' AND tablename IN ('site_content','blog_posts','newsletter_subscribers'))
   OR (schemaname='storage' AND tablename='objects' AND policyname LIKE '%CMS media%')
ORDER BY schemaname, tablename, policyname;
