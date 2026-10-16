# Phase 9 isolated staging runbook and QA checklist

## Current verification status

- Branch: `feature/premium-redesign`.
- No staging credentials or staging project identifiers are configured in this workspace.
- `psql` and Deno are unavailable; the local Docker engine could not be confirmed.
- Database migrations, RLS authorization, Edge Functions, Vercel preview, browser journeys, and responsive behavior are **NOT VERIFIED**.
- Do not substitute production credentials or use production URLs for any step below.

## Prepare isolated resources

1. Create a new Supabase staging project and record its project reference separately from production. Use a new empty database, staging-only Auth users, storage buckets, and Edge Functions.
2. Configure staging-only `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `FLIGHTAPI_KEY` in the function environment. Never commit these values or place service-role keys in browser variables. Use a provider credential/account explicitly designated for staging; if unavailable, use a mocked provider and mark live fare refresh unverified.
3. Add the staging project's public URL and anon key to Vercel Preview environment variables for this branch only. Keep Production environment variables and project configuration unchanged. Confirm the preview build reports the staging Supabase origin without printing credentials.
4. Create synthetic Customer A, Customer B, and staff accounts. Seed only synthetic bookings with distinct owners and known pending/cancelled states. Do not import customer records or personal data.
5. From the project root, link the Supabase CLI only to the recorded staging project reference. Check the reference before every database or function command. Apply migrations in timestamp order: `20261015120000_harden_customer_booking_updates.sql`, then `20261015133000_trusted_booking_creation.sql`. Stop on any migration error.
6. Run `supabase/tests/booking_authorization.sql` against the staging database with synthetic UUIDs and explicit `local_test_confirm=LOCAL_ONLY` after reviewing its target. The script rolls back. Keep the output and migration history for the release record.
7. Deploy `create-booking-request` and any functions needed by the app to this staging project only. Check function logs for request IDs and outcomes; do not log tokens, passenger fields, or other personal data.
8. Create a Vercel Preview for `feature/premium-redesign`; verify its environment is set to staging before opening it. Do not use a production deployment command or change the production domain.

## Database authorization checks

Run the SQL verification script with Customer A and B and staff test records. Confirm all of these assertions:

- Customer A can read A's booking and cannot read B's booking.
- Direct authenticated booking INSERT and DELETE are denied.
- Customers cannot update amount, payment status, booking status, owner ID, or provider references.
- The cancellation RPC rejects another owner's booking, rejects ineligible states, and succeeds once for an eligible owned request.
- Staff role membership permits only the existing authorized management operations; a regular authenticated user cannot acquire staff permissions by sending a role value.
- Anonymous reads, writes, and cancellation attempts are rejected.
- Existing owner account queries still return the customer's own booking history.

Record observed SQL role, policy, and grant behavior. Do not treat policy inspection alone as proof; exercise the policies as the synthetic roles.

## Edge Function and booking request checks

On staging, using only synthetic accounts and no supplier reservation or payment actions:

- Unauthenticated calls fail; authenticated quote and request calls bind ownership to the verified user.
- A valid bookable offer is refreshed through the supported FlightAPI search path, server pricing rules determine amount/currency, and the resulting request is pending.
- Expired signatures, altered signatures, invalid offer references, changed fares, changed routes/dates/cabin, forged amount/status/owner/provider fields, and malformed passengers fail without inserting a payable request.
- Repeating a request follows the documented duplicate behavior and does not create an unintended duplicate payable request.
- Schedule-only results create an explicitly unpriced inquiry and display no payment instructions.
- Provider errors, network failures, and unsupported offers return safe user-facing errors without exposing secrets or personal data in logs.
- No supplier booking, ticket issuance, or payment is created; FlightAPI supports quotations/search only.

## Browser and journey checklist

Run each viewport at **375px**, **768px**, and **1440px**. Record browser/version, preview URL, date, and pass/fail notes. Test direct navigation and refresh for `/`, `/flights`, `/checkout`, `/account`, `/admin`, `/hotels`, `/cars`, `/visa`, `/blog`, `/blog/<slug>`, and `/kakande`.

- [ ] Homepage and navigation render; mobile menu opens, closes, and supports keyboard focus.
- [ ] Flight search accepts airports, dates, passengers, and cabin; required validation is announced and focusable.
- [ ] Results show only returned schedules/offers; sorting and filters operate on actual results; no horizontal overflow.
- [ ] Select a result, request a quotation, complete the authenticated checkout request, and verify pending status and amount from the trusted response.
- [ ] Change/expire the fare before submit; the request is rejected with a recoverable message.
- [ ] Open account history as Customer A and confirm only A's records; cancel an eligible synthetic request and verify updated status.
- [ ] Open account as Customer B and confirm A's request is not visible or editable.
- [ ] Open admin as a staff test user and verify authorized view/update behavior; ordinary customer and anonymous sessions are denied.
- [ ] Unpriced inquiry has no payment instructions. Priced request shows only existing manual payment instructions and remains pending until staff review.
- [ ] Hotels, cars, visa, blog, and Kakande pages load and remain usable on each viewport.
- [ ] Inspect console, network errors, focus visibility, labels, image alt text, page metadata, and private route `noindex` behavior.
- [ ] Confirm preview origin is staging and no private routes appear in sitemap; staging host is blocked from indexing.

## Exit criteria

Release review can move from NO-GO only after the staging database tests, function tests, preview route checks, full customer journey, and responsive checks above have recorded results. Live provider quote refresh is a separate verification; no test here proves reservation or ticketing capability. Keep production migrations, functions, secrets, and Vercel deployment untouched until a separate release approval.
