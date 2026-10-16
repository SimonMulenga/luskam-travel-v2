-- Synthetic, non-personal local/staging fixtures only.
-- The blog row is an unpublished draft and must never appear on public pages.
-- Additional safeguard: the forward migration also disables this exact legacy
-- USD 120 rule. It is not approved launch pricing. Never include seed in production.
UPDATE public.pricing_rules
SET is_active = false, updated_at = now()
WHERE name = 'Default markup'
  AND rule_type = 'global'
  AND markup_type = 'fixed'
  AND markup_amount = 120
  AND currency = 'USD';

INSERT INTO public.blog_posts (
  id, slug, title, excerpt, body, published, published_at
)
VALUES (
  '90000000-0000-4000-8000-000000000001',
  'staging-verification-draft',
  'STAGING TEST — unpublished fixture',
  'Synthetic content used to verify draft visibility and admin access.',
  'This is synthetic staging data. It is not a customer story, travel offer, or public article.',
  false,
  NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.site_content (key, value)
VALUES ('staging_verification_notice', 'Synthetic staging fixture; not customer or production content.')
ON CONFLICT (key) DO NOTHING;
