-- Recreate the CMS schema previously held only in drizzle/migrations.
-- This migration intentionally uses only objects not created by the existing
-- Supabase migration sequence. Safe to re-run for staging repair workflows.

CREATE TABLE IF NOT EXISTS public.site_content (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  cover_url text,
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  author_id uuid
);

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Start from explicit grants. RLS below limits authenticated CMS writes to
-- users with an admin role; ordinary authenticated users have no CMS access.
REVOKE ALL ON TABLE public.site_content FROM anon, authenticated;
GRANT SELECT ON TABLE public.site_content TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.site_content TO authenticated;
GRANT ALL ON TABLE public.site_content TO service_role;

REVOKE ALL ON TABLE public.blog_posts FROM anon, authenticated;
GRANT SELECT ON TABLE public.blog_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.blog_posts TO authenticated;
GRANT ALL ON TABLE public.blog_posts TO service_role;

REVOKE ALL ON TABLE public.newsletter_subscribers FROM anon, authenticated;
GRANT INSERT ON TABLE public.newsletter_subscribers TO anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.newsletter_subscribers TO authenticated;
GRANT ALL ON TABLE public.newsletter_subscribers TO service_role;

DROP POLICY IF EXISTS "Anyone reads content" ON public.site_content;
DROP POLICY IF EXISTS "Admins manage content" ON public.site_content;
DROP POLICY IF EXISTS "Public reads site content" ON public.site_content;
DROP POLICY IF EXISTS "Admins insert site content" ON public.site_content;
DROP POLICY IF EXISTS "Admins update site content" ON public.site_content;
DROP POLICY IF EXISTS "Admins delete site content" ON public.site_content;
CREATE POLICY "Public reads site content" ON public.site_content
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins insert site content" ON public.site_content
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins update site content" ON public.site_content
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins delete site content" ON public.site_content
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Public reads published posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins manage posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Public reads published blog posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Authenticated reads published or admin blog posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins read all blog posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins insert blog posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins update blog posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins delete blog posts" ON public.blog_posts;
-- Separate anon and authenticated read rules: Phase 8 restricts has_role()
-- execution to authenticated identities, while anonymous visitors may read
-- published articles without invoking that function.
CREATE POLICY "Public reads published blog posts" ON public.blog_posts
  FOR SELECT TO anon USING (published);
CREATE POLICY "Authenticated reads published or admin blog posts" ON public.blog_posts
  FOR SELECT TO authenticated
  USING (published OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins insert blog posts" ON public.blog_posts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins update blog posts" ON public.blog_posts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins delete blog posts" ON public.blog_posts
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Anyone can subscribe" ON public.newsletter_subscribers;
DROP POLICY IF EXISTS "Admins read subscribers" ON public.newsletter_subscribers;
DROP POLICY IF EXISTS "Admins delete subscribers" ON public.newsletter_subscribers;
CREATE POLICY "Anyone can subscribe" ON public.newsletter_subscribers
  FOR INSERT TO anon, authenticated
  WITH CHECK (length(email) BETWEEN 5 AND 255 AND email LIKE '%@%');
CREATE POLICY "Admins read subscribers" ON public.newsletter_subscribers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins delete subscribers" ON public.newsletter_subscribers
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

COMMENT ON TABLE public.site_content IS
  'Public website content; only authenticated users with the admin role may write.';
COMMENT ON TABLE public.blog_posts IS
  'Public may read published posts; only authenticated admins may manage posts.';
COMMENT ON TABLE public.newsletter_subscribers IS
  'Public may submit a subscription; only authenticated admins may read or delete subscriber records.';
