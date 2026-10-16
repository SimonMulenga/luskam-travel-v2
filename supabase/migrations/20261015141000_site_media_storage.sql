-- Provision the CMS image bucket and its scoped access policies.
-- The bucket is public because public pages render CMS images without auth;
-- writes are restricted to authenticated users with the admin role.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-media',
  'site-media',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read site media" ON storage.objects;
DROP POLICY IF EXISTS "Admins upload site media" ON storage.objects;
DROP POLICY IF EXISTS "Admins update site media" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete site media" ON storage.objects;
DROP POLICY IF EXISTS "Public read CMS media" ON storage.objects;
DROP POLICY IF EXISTS "Admins upload CMS media" ON storage.objects;
DROP POLICY IF EXISTS "Admins update CMS media" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete CMS media" ON storage.objects;

CREATE POLICY "Public read CMS media" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'site-media');
CREATE POLICY "Admins upload CMS media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'site-media'
    AND (storage.foldername(name))[1] IN ('site', 'blog')
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY "Admins update CMS media" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'site-media'
    AND (storage.foldername(name))[1] IN ('site', 'blog')
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    bucket_id = 'site-media'
    AND (storage.foldername(name))[1] IN ('site', 'blog')
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY "Admins delete CMS media" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'site-media'
    AND (storage.foldername(name))[1] IN ('site', 'blog')
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
