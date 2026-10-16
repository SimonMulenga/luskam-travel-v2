# Supabase staging setup

This V2 repository is configured for the separate staging project only. The original project is not a target. No migration, SQL, or Edge Function deployment was performed while preparing this copy.

## Frontend configuration

The frontend reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; `VITE_SUPABASE_PROJECT_ID` is also present in the staging template. These values are exposed in browser code. Use staging-only values and never place service-role keys or provider credentials in any `VITE_*` variable.

Copy `.env.staging.example` to an ignored local file such as `.env.staging.local`, fill it with values from the staging project, and build with `npm run build -- --mode staging`. The template contains placeholders/public project identifiers only.

## Edge Function configuration

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to hosted functions. Keep the service-role key only in Supabase Function secrets. The Option A flight request flow also needs the staging `FLIGHTAPI_KEY`, `FLIGHT_PROVIDER=flightapi`, `FLIGHT_BOOKING_PROVIDER=none`, and an exact preview origin in `BOOKING_ALLOWED_ORIGINS`. The default CORS allowlist is empty. Do not use wildcard origins or configure payment, reservation, or ticketing integrations.

Use the values in `supabase/.env.staging.example` as names/placeholders only; replace placeholders in an ignored local file. Do not print those values to logs or commit the local file.

## Project targeting and migrations

`supabase/config.toml` names staging project `ikbffvqkxwhkwlocjufc`. Still pass `--project-ref ikbffvqkxwhkwlocjufc` explicitly to every remote Supabase CLI command; do not rely on a linked project or cached target. Verify the project reference in the Supabase dashboard immediately before any future remote operation.

Before applying anything, inspect the entire migration list and run a dry run with the explicit project reference. Stop if the remote history differs from the reviewed migration sequence or if the dry run includes unexpected migrations. `db push` applies all pending migrations; it does not select one migration file. Never run a remote `db reset`, and do not include the seed outside staging. No SQL or migrations were run during this preparation.

The schema is maintained through Supabase migrations. The V2 copy intentionally has no `drizzle.config.ts`, preventing the legacy direct database migration URL from being used. No database migration command should be run until separately reviewed and approved.

## Staging Auth and staff access

Configure Auth site URL, redirect URLs, email confirmation, and OAuth callbacks for the staging preview only. Use synthetic test users, never real customer personal data. The committed tree does not contain an admin provisioning script; prepare and review a separate staging-only procedure before assigning staff roles. Never grant roles from client-provided metadata or public requests.

## Option A operating model

The website accepts manual travel inquiries and booking requests. FlightAPI provides flight and fare information only. A request does not reserve a seat or confirm an airline booking. Luskam staff must manually verify supplier availability and the final quotation; customers must wait for verified payment instructions. No automated reservations, ticket issuance, or online payment processing are enabled.
