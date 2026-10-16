\set ON_ERROR_STOP on
-- RLS behavior checks for a disposable LOCAL Supabase database only.
-- Required psql variables: local_test_confirm=LOCAL_ONLY, customer_id, admin_id.
-- Example:
-- psql "$LOCAL_SUPABASE_DB_URL" -v local_test_confirm=LOCAL_ONLY \
--   -v customer_id=<synthetic-uuid> -v admin_id=<synthetic-admin-uuid> \
--   -f supabase/tests/cms_authorization.sql
\if :{?local_test_confirm}
\else
  \echo 'Missing local_test_confirm=LOCAL_ONLY; refusing to continue.'
  \quit
\endif
\if :{?customer_id}
\else
  \echo 'Missing synthetic customer_id.'
  \quit
\endif
\if :{?admin_id}
\else
  \echo 'Missing synthetic admin_id.'
  \quit
\endif

BEGIN;
SELECT set_config('cms.local_test_confirm', :'local_test_confirm', true);
SELECT 'staging-' || gen_random_uuid() || '@example.invalid' AS cms_test_email \gset
SELECT set_config('cms.test_email', :'cms_test_email', true);
SET LOCAL ROLE anon;
DO $$
BEGIN
  IF current_setting('cms.local_test_confirm') <> 'LOCAL_ONLY' THEN
    RAISE EXCEPTION 'Refusing to run outside local test confirmation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_content WHERE key='staging_verification_notice') THEN
    RAISE EXCEPTION 'Anonymous public CMS read failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='staging-verification-draft') THEN
    RAISE EXCEPTION 'Anonymous user can read an unpublished draft';
  END IF;
  IF has_table_privilege('anon', 'public.site_content', 'INSERT') THEN
    RAISE EXCEPTION 'Anonymous CMS write privilege exists';
  END IF;
  IF NOT has_table_privilege('anon', 'public.newsletter_subscribers', 'INSERT') THEN
    RAISE EXCEPTION 'Anonymous newsletter signup is not available';
  END IF;
  IF has_table_privilege('anon', 'public.newsletter_subscribers', 'SELECT') THEN
    RAISE EXCEPTION 'Anonymous newsletter read privilege exists';
  END IF;
  INSERT INTO public.newsletter_subscribers (email)
  VALUES (current_setting('cms.test_email'));
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'customer_id', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'customer_id', 'role', 'authenticated')::text, true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='staging-verification-draft') THEN
    RAISE EXCEPTION 'Ordinary authenticated user can read an unpublished draft';
  END IF;
  IF EXISTS (SELECT 1 FROM public.newsletter_subscribers WHERE email=current_setting('cms.test_email')) THEN
    RAISE EXCEPTION 'Ordinary authenticated user can read a subscriber record';
  END IF;
  IF has_table_privilege('authenticated', 'public.newsletter_subscribers', 'UPDATE') THEN
    RAISE EXCEPTION 'Authenticated users can update newsletter subscriber records';
  END IF;
  BEGIN
    INSERT INTO public.site_content (key,value) VALUES ('unauthorized-test','x');
    RAISE EXCEPTION 'Ordinary authenticated user wrote site content';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.blog_posts (slug,title) VALUES ('unauthorized-test','x');
    RAISE EXCEPTION 'Ordinary authenticated user wrote a blog post';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
  UPDATE public.site_content SET value='unauthorized' WHERE key='staging_verification_notice';
  IF FOUND THEN RAISE EXCEPTION 'Ordinary authenticated user updated site content'; END IF;
  DELETE FROM public.site_content WHERE key='staging_verification_notice';
  IF FOUND THEN RAISE EXCEPTION 'Ordinary authenticated user deleted site content'; END IF;
  UPDATE public.blog_posts SET title='unauthorized' WHERE slug='staging-verification-draft';
  IF FOUND THEN RAISE EXCEPTION 'Ordinary authenticated user updated a draft'; END IF;
  DELETE FROM public.blog_posts WHERE slug='staging-verification-draft';
  IF FOUND THEN RAISE EXCEPTION 'Ordinary authenticated user deleted a draft'; END IF;
  DELETE FROM public.newsletter_subscribers WHERE email=current_setting('cms.test_email');
  IF FOUND THEN RAISE EXCEPTION 'Ordinary authenticated user deleted a subscriber'; END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub', :'admin_id', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'admin_id', 'role', 'authenticated')::text, true);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.blog_posts WHERE slug='staging-verification-draft') THEN
    RAISE EXCEPTION 'Admin cannot read unpublished blog draft';
  END IF;
  INSERT INTO public.site_content (key,value,updated_by)
  VALUES ('admin-write-test','created by synthetic admin',auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin site content insert failed'; END IF;
  UPDATE public.site_content SET value='updated by synthetic admin'
  WHERE key='staging_verification_notice';
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin site content update failed'; END IF;
  INSERT INTO public.blog_posts (slug,title,author_id)
  VALUES ('admin-write-test','Synthetic admin post',auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin blog insert failed'; END IF;
  UPDATE public.blog_posts SET excerpt='updated by synthetic admin'
  WHERE slug='admin-write-test';
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin blog update failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.newsletter_subscribers WHERE email=current_setting('cms.test_email')) THEN
    RAISE EXCEPTION 'Admin cannot read newsletter subscribers';
  END IF;
  DELETE FROM public.newsletter_subscribers WHERE email=current_setting('cms.test_email');
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin newsletter delete failed'; END IF;
  DELETE FROM public.site_content WHERE key='admin-write-test';
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin site content delete failed'; END IF;
  DELETE FROM public.blog_posts WHERE slug='admin-write-test';
  IF NOT FOUND THEN RAISE EXCEPTION 'Admin blog delete failed'; END IF;
END;
$$;

ROLLBACK;
