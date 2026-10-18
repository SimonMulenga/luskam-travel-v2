# Supabase staging setup

This V2 repository is configured for the separate staging project only. The original project is not a target. No migration, SQL, or Edge Function deployment was performed while preparing this copy.

## Frontend configuration

The frontend reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; `VITE_SUPABASE_PROJECT_ID` is also present in the staging template. These values are exposed in browser code. Use staging-only values and never place service-role keys or provider credentials in any `VITE_*` variable.

Copy `.env.staging.example` to an ignored local file such as `.env.staging.local`, fill it with values from the staging project, and build with `npm run build -- --mode staging`. The template contains placeholders/public project identifiers only.

The manual `request-flight-quote` flow requires Cloudflare Turnstile. Configure a staging widget for `luskam-travel-v2.vercel.app` and use its **site key** as the public Vercel Preview variable `VITE_TURNSTILE_SITE_KEY`. Configure the matching **secret key** only as the Supabase Edge Function secret `TURNSTILE_SECRET_KEY`; never use a `VITE_` name for the secret. The function verifies each one-use token server-side, requires hostname `luskam-travel-v2.vercel.app` and action `flight_quote_request`, and rejects provider failure, malformed responses, missing configuration, expired tokens and replayed tokens before any database RPC. Turnstile is an abuse-control signal, not user authentication.

The quotation endpoint applies a persistent sliding-window limit of four requests per 900 seconds for the HMAC-derived gateway-address identity, followed by a global limit of 60 per 900 seconds on a fixed namespaced identity. The existing `consume_flight_quote_rate_limit(uuid, integer, integer)` RPC accepts maxima through 100 and windows through 86,400 seconds, so these settings require no migration. PostgreSQL stores events and serializes calls per identity across function instances. CAPTCHA failures consume neither quota. A request that passes CAPTCHA and both limits is charged before persistence, so idempotent duplicates, conflicts and later persistence errors also consume quota. The two checks are separate RPC calls and transactions, not one atomic combined quota: an address slot can be consumed if the global quota is exhausted or its RPC fails. Limit exhaustion returns HTTP 429 with `Retry-After`; storage failures return 503 and prevent quotation creation. `cf-connecting-ip` remains supplementary limiter input, not an authenticated identity; caller-supplied `X-Forwarded-For` is ignored.

## Edge Function configuration

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to hosted functions. Keep the service-role key only in Supabase Function secrets. Live fares require the staging `FLIGHTAPI_KEY`; `FLIGHT_BOOKING_PROVIDER=none` preserves Option A. Set `FLIGHT_PROVIDER=none` unless a separate schedule provider is intentionally configured. In particular, do not set it to `flightapi`: the pricing provider already uses FlightAPI, and a second FlightAPI fallback call is now prevented. If schedule-only fallback is desired, configure a separate provider and its own staging credential.

The flight-search function allows the exact Vercel staging origin and local Vite origins by default. `FLIGHT_SEARCH_ALLOWED_ORIGINS` may add exact HTTPS preview origins; wildcard origins are rejected. Booking requests use the separate `BOOKING_ALLOWED_ORIGINS` setting. CORS is a browser policy, not authentication. The public Supabase publishable key is not treated as a customer identity: anonymous search is rate-limited by a pseudonymous HMAC of the gateway-provided client IP, using the existing persistent `inquiry` rate-limit scope at five requests per ten minutes. Rate-limit storage failures reject the search. No schema migration is required for this limit because the deployed RPC already accepts the `inquiry` scope.

An empty active pricing-rule set returns a clear unavailable response before any FlightAPI call. Do not activate a pricing rule as part of function deployment; pricing policy requires separate approval. No payment, reservation, or ticketing integrations should be configured.

Use the values in `.env.staging.example` as names/placeholders only; replace placeholders in an ignored local file. The Turnstile site key is public browser configuration; its secret belongs only in Supabase Function secrets. Do not print secret values to logs or commit local environment files.

## Project targeting and migrations

`supabase/config.toml` names staging project `ikbffvqkxwhkwlocjufc`. Still pass `--project-ref ikbffvqkxwhkwlocjufc` explicitly to every remote Supabase CLI command; do not rely on a linked project or cached target. Verify the project reference in the Supabase dashboard immediately before any future remote operation.

Before applying anything, inspect the entire migration list and run a dry run with the explicit project reference. Stop if the remote history differs from the reviewed migration sequence or if the dry run includes unexpected migrations. `db push` applies all pending migrations; it does not select one migration file. Never run a remote `db reset`, and do not include the seed outside staging. No SQL or migrations were run during this preparation.

The schema is maintained through Supabase migrations. The V2 copy intentionally has no `drizzle.config.ts`, preventing the legacy direct database migration URL from being used. No database migration command should be run until separately reviewed and approved.

## Staging Auth and staff access

Configure Auth site URL, redirect URLs, email confirmation, and OAuth callbacks for the staging preview only. Use synthetic test users, never real customer personal data. The committed tree does not contain an admin provisioning script; prepare and review a separate staging-only procedure before assigning staff roles. Never grant roles from client-provided metadata or public requests.

## Option A operating model

The website accepts manual travel inquiries and booking requests. FlightAPI provides flight and fare information only. A request does not reserve a seat or confirm an airline booking. Luskam staff must manually verify supplier availability and the final quotation; customers must wait for verified payment instructions. No automated reservations, ticket issuance, or online payment processing are enabled.
