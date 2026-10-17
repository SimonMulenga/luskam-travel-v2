# Phase 9G — Manual flight quotation requests

## Operating model

The `/flights` page is a manual quotation request form. It does not call
`flight-search`, FlightAPI, another provider, checkout, or booking creation.
It displays only the customer's submitted trip criteria. Luskam staff checks
availability and sends a quotation manually. Submitting a request does not
reserve a seat or confirm an airline booking. Payment instructions are sent
only after staff verifies and approves a quotation. Ticketing remains manual.

## Local changes and database dependency

The new forward-only migration is
`supabase/migrations/20261016100000_flight_quote_requests.sql`. It creates a
dedicated `public.flight_quote_requests` table because `public.quotes` and
`public.bookings` require an authenticated owner and have booking/pricing
semantics. The new table has no customer `user_id`; its contact data and
internal notes are staff-only. `anon` receives no table privileges.

Only the trusted `request-flight-quote` Edge Function can insert records using
the server-side service role. Authenticated admins and agents can read requests
and update only `status` and `internal_notes`, subject to the existing
`public.has_role` helper and RLS. Customer name/contact, itinerary, idempotency
key, request hash, and creation fields are not updateable by client roles.

The function uses dedicated service-role-only RPCs for quote persistence and
rate limiting. It requires the staging database to have the existing role,
trigger and private-schema migrations, plus `20261016100000` and the new
`20261017100000` migration applied. No pricing rule, flight provider, payment
integration, or booking RPC is needed by this flow.

## Function configuration

`supabase/config.toml` sets `verify_jwt = false` only for
`request-flight-quote`, since anonymous submissions are intentional. The
handler still validates strict request shape, request size, dates, contact
fields and UUID idempotency; validates and pseudonymizes the gateway-reported
IP; applies a persistent four-request exact sliding-window limit; and writes
only through the service role. Missing or malformed IP metadata and rate-limit
storage failures are fail-closed. The database serializes request creation
with idempotency and canonical-fingerprint advisory locks. Same-key changed
content conflicts; matching submissions with different keys return the
existing reference while its private dedupe claim is active. Each matching
retry renews that claim for 15 minutes, so a new request is allowed only after
15 quiet minutes with no identical submission. Fingerprinting HMACs the
canonical allowlisted payload, including contact fields, with the server-only
`FLIGHT_QUOTE_FINGERPRINT_SECRET` HMAC key; plaintext contact details are not
written to logs. Keep this key stable across deployments so retries remain
consistent during the 15-minute claim window.

**Gateway trust remains a staging blocker.** Supabase documentation identifies
`cf-connecting-ip` as a captured request header, but does not establish in the
reviewed material that the gateway strips/replaces caller-supplied values.
Before public use, verify spoof resistance through an isolated staging
deployment. If that cannot be established, front the function with a trusted
gateway that removes untrusted forwarding headers and supplies a verified
client identity, or keep the submission endpoint disabled. `X-Forwarded-For`
is not consulted. Rate limiting now avoids fixed-window boundary bursts by
using a sliding window.
CORS defaults to the V2 staging origin and local Vite/preview origins. Optional
`BOOKING_ALLOWED_ORIGINS` may add exact HTTPS or localhost origins; it cannot
add wildcard or insecure public HTTP origins. CORS is not an authentication
boundary.

Supabase platform-provided function variables required at runtime:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FLIGHT_QUOTE_FINGERPRINT_SECRET` â€” random secret of at least 32 characters;
  used only to HMAC canonical request fingerprints. Do not put it in Vercel.

Optional function configuration:

- `BOOKING_ALLOWED_ORIGINS` — comma-separated exact allowed origins. Include
  `https://luskam-travel-v2.vercel.app` and local origins only as needed.

Frontend Vercel preview environment:

- `VITE_SUPABASE_URL` — staging project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY` — staging publishable/anon key only.

Never configure a service role key in Vercel frontend variables. FlightAPI
secrets are not required and should remain absent for this release.

## Staging rollout sequence (not executed)

1. Verify the Supabase dashboard project reference is `ikbffvqkxwhkwlocjufc`.
2. Review both pending migrations and backup/restore readiness. Apply only after
   explicit approval; do not use the original Lovable project.
3. Run `supabase/tests/flight_quote_requests_authorization.sql` with synthetic
   customer, admin, and agent identities. It creates fixtures inside a
   transaction and ends in `ROLLBACK`.
4. Set the fingerprint secret in staging only after it has been generated and
   securely stored. Never print it in command history or logs.
5. Follow `supabase/tests/flight_quote_requests_concurrency.md` using two
   independent persistent connections. The test intentionally commits one
   synthetic request; perform its narrowly guarded cleanup after verification.
6. Configure the optional allowed-origin value and deploy only
   `request-flight-quote` to staging. The function is public by design; no
   FlightAPI, reservation, ticketing, or payment secrets are needed.
7. Set Vercel Preview Supabase URL and publishable key to staging and deploy
   the preview only after separate approval.
8. Submit one synthetic request, verify its reference and staff-only visibility,
   verify an identical idempotency retry returns the same reference, verify a
   changed payload with the same key returns conflict, and verify the fifth
   request in a window receives HTTP 429. Do not use real customer data.

## Verification limits

Neither migration nor SQL verification has been executed. The Edge Function
has not been deployed or runtime-tested. Local concurrency tests model the
handler contract; they do not establish database lock correctness, deployed
RLS, or gateway IP-header trust. The documented two-connection test remains
required. Browser geometry/responsive behavior requires a real browser; the
automated UI test checks the responsive DOM structure only.
