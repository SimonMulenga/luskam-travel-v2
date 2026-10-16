# V2 staging configuration

This clean-history copy is prepared for a separate staging preview. It is not connected to Vercel or GitHub and has not been deployed.

## Supabase

- `supabase/config.toml` names staging project `ikbffvqkxwhkwlocjufc`.
- Pass `--project-ref ikbffvqkxwhkwlocjufc` explicitly to every future remote Supabase CLI operation. Do not rely on a linked project or cached CLI target.
- The original project is not a target. Do not use `db reset` against a remote project.
- `drizzle.config.ts` is intentionally absent. Use reviewed Supabase migrations only; no migrations were run while preparing this copy.
- Keep service-role keys and provider credentials in Supabase Edge Function secrets, never in Vite variables or committed files.

## Edge Function CORS

`create-booking-request` accepts browser origins only when they exactly match `BOOKING_ALLOWED_ORIGINS`. The default is an empty allowlist. Configure a comma-separated list of exact HTTPS origins for the staging preview, with no paths, trailing slash, or wildcard. HTTP is accepted only for localhost development. CORS does not replace Supabase authentication or authorization.

The staging function template leaves this origin as a placeholder. Replace it only with the preview URL after the separate staging site exists.

## Preview indexing and production SEO restoration

The static HTML defaults to `noindex,nofollow`, and the production sitemap is not included. `robots.txt` allows crawlers to fetch that noindex directive; the runtime page metadata also remains non-indexable unless `VITE_SITE_INDEXABLE=true` is explicitly supplied. Keep Vercel Preview deployment protection enabled.

For a future approved production release, configure the production build environment with `VITE_SITE_INDEXABLE=true` and the approved HTTPS `VITE_SITE_ORIGIN`. The Vite build then emits the canonical root URL and absolute approved social-image URLs; route metadata uses that origin. Restore an approved public `robots.txt` and sitemap as a separate release change. Do not set these production values in Vercel Preview scope.

## Vercel preview

Use a new Vercel project, the `main` branch of this clean-history repository after review, and Preview-scoped staging values only. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_PROJECT_ID` to the staging project. Do not add `SUPABASE_SERVICE_ROLE_KEY`, provider credentials, or other server secrets to any `VITE_*` variable. Keep preview deployment protection enabled and do not attach the existing production domain.

The GitHub Pages workflow and production `CNAME` were removed from this copy so a first push cannot trigger that publishing path.
