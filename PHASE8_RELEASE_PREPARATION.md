# Phase 8 release preparation

## Booking trust boundary

- The browser sends the selected FlightAPI pricing-option reference, search criteria, passenger names, and contact details. It does not send an amount, currency, status, payment status, owner ID, or booking reference.
- `create-booking-request` calls `auth.getUser()` with the submitted bearer token and derives `bookings.user_id` only from that verified user.
- A priced flight request is quoted by searching FlightAPI again for the same query and matching the exact pricing-option reference, route, departure date, and cabin. The provider advertises live pricing but no offer revalidation, supplier reservation, or ticketing. The fresh search is a fare refresh, not a reservation.
- The function loads active pricing rules using the service role and applies the existing pricing calculation. A signed, five-minute HMAC quote binds the authenticated user, search, offer reference, amount, currency, and pricing result. Submission searches again and rejects an expired or changed quote before inserting anything.
- The function writes a `pending` booking with `pending` payment status. It makes no supplier reservation, payment, or ticket call. Pricing inputs and applied rule are stored in booking details for staff review.
- Schedule-only results and hotel/car/visa/ministry service follow-ups are stored as unpriced inquiries with amount zero. Known price, amount, currency, status, ownership, reference, and provider-reference keys are stripped from service inquiry details. Payment instructions are withheld for zero-amount account records.
- Authenticated direct `bookings` INSERT/DELETE and `flight_bookings` INSERT/UPDATE privileges are revoked by the Phase 8 migration. Owner reads and the cancellation RPC remain. Staff retain the existing status/payment updates through the narrow Phase 7 column grant and admin/agent RLS policy. The Edge Function service role performs trusted inserts.

## Migration and recovery

`20261015133000_trusted_booking_creation.sql` must run after `20261015120000_harden_customer_booking_updates.sql`. It removes the remaining direct client insert path and does not alter schemas or previously applied migrations.

Do not restore authenticated INSERT on `bookings` as a rollback: that reopens forged payable amounts. If the Edge Function or new frontend has an issue, first repair or redeploy the function. A database recovery must be a reviewed forward migration that preserves server-only inserts. The Phase 7 recovery SQL restores customer status/payment writes and is unsafe for Phase 8; do not run it.

## Release sequence

1. Schedule a short booking-submission maintenance window. Confirm a backup and apply both Phase 7 and Phase 8 security migrations in timestamp order. Do not proceed if migrations report errors.
2. Deploy `create-booking-request` with its existing required Supabase environment (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) and the existing `FLIGHTAPI_KEY` provider secret. Do not print secret values. Test an authenticated quote and a synthetic request in a nonproduction environment.
3. Deploy the frontend that quotes through the function, submits its signed quote, and sends service inquiries through the function. In the short interval between the database migration and frontend activation, older cached clients will have booking writes denied; keep booking submission paused until the new frontend is live.
4. Verify owner-only booking reads, cancellation RPC, admin/agent status updates, booking-pricing display, inquiry amount zero, fare-change rejection, and account history. Confirm no supplier reservation, payment, or ticket was created.

An old frontend deployed against the Phase 8 database cannot create bookings because its direct INSERT is intentionally denied. Rollback therefore requires a compatible frontend/function release; re-granting direct insert is not an acceptable recovery.

## Verification status

- Automated unit tests cover rejected client-controlled fields, user/query/fare quote binding and expiry, traveler count/type matching, and the shared pricing arithmetic.
- `supabase/tests/booking_authorization.sql` is an executable local PostgreSQL policy/grant script using seeded synthetic accounts. It requires a disposable local Supabase database and has not been run in this workspace.
- Live provider behavior is not verified. FlightAPI pricing can be refreshed, but ticketing and reservations are unsupported by the configured provider.
- Production migration state and deployed RLS policies are not verified. Do not make a production GO decision until an isolated database run and a reviewed production policy snapshot confirm the expected state.
