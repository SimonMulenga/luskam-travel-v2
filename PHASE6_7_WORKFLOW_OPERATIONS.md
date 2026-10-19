# Phase 6A / 6B / 6C / 7A workflow operations

The flight quotation workflow is additive to the existing flight inquiry and legacy bookings features. Customer acceptance creates a **booking request** only. There is no payment collection, supplier reservation, automatic ticketing, or automatic customer notification in this phase.

## Admin and agent quotation verification

1. Sign in using an authorized synthetic staging agent or admin account and open **Admin → Quote workflow**.
2. Select a synthetic flight quotation request. Confirm the route, dates, traveller count, cabin, and reference.
3. Select **New draft**, add one or more ZMW line items, and save. Check that the displayed total equals the sum of quantity × unit amount.
4. Reopen the draft, change a line, and save. Issue it and confirm the UI displays its 24-hour expiry.
5. Use **Prepare revision** on a non-accepted issued/declined/expired/superseded version. Confirm the previous version remains in history, then issue the new draft.
6. Refresh and confirm statuses/history persist. The existing **Flight quotes** tab still owns inquiry status/internal notes; the legacy **Bookings** tab remains unchanged.

## Customer quotation verification

1. Use a synthetic authenticated customer account that owns the request; never use an email/reference to claim an anonymous request.
2. Open **Account → My requests**. Confirm only the customer RPC results are shown and quotation lines, ZMW totals, issue/expiry times, and revisions are visible.
3. Accept a currently issued quotation once. Confirm a booking request appears with the received status and no ticket claim.
4. Retry/refresh and verify there is no second booking. A second acceptance is idempotent. Decline a separate issued quotation and confirm its status is recorded.
5. Expired, accepted, declined, and superseded quotes have no response buttons. Server RPC checks remain authoritative for expiry and ownership.

## Booking operations verification

1. As staff, open **Admin → Quote workflow → Accepted quotation booking requests**.
2. Search by synthetic reference/customer/route and inspect audit history.
3. Advance only through the displayed allowed next statuses. Confirm invalid transitions return an error and remain unchanged.
4. To record `confirmed_ticket_issued`, enter the real supplier confirmation reference and airline ticket number only after they have been supplied. Never use generated or placeholder values.
5. Confirm the customer sees the resulting booking status. No payment state is modified by this workflow.

## PWA installation and offline behavior

- Android: open the deployed HTTPS site in Chrome and use **Install app** / **Add to Home screen** when offered.
- iPhone/iPad: open in Safari, use **Share → Add to Home Screen**.
- The manifest icons use the current Luskam favicon artwork. The service worker caches only the static offline fallback. It never stores API, authentication, quotation, booking, account, or admin responses. If offline, public navigation receives a generic offline page; private navigation is not intercepted.
- Deploy the static assets over HTTPS before verifying installation. A service worker update is activated immediately and old `luskam-shell-*` caches are removed.

## Email and WhatsApp notification preparation

`src/lib/flightWorkflowNotifications.ts` provides pure email text/HTML templates for quotation issued/expiry reminder/accept/decline, booking request/status, and ticket-issued events. It does not send messages. The typed payload includes a deterministic idempotency key.

Before any provider integration, select an approved transactional email provider, configure its server-side secret and verified sender, and implement a server-side outbox with unique idempotency keys and retries. Insert an outbox event in the same database transaction as the quotation/booking event, then deliver asynchronously so provider failure cannot roll back workflow state. Do not send from browser code. WhatsApp Business requires an approved business sender and approved message templates; do not use personal-account automation or unofficial APIs. No live notifications have been sent or configured.

## Database verification and staging safety

Run `supabase/tests/flight_quotation_booking_readonly_staging_verification.sql` only after confirming the connected SQL client is the authorized staging project `ikbffvqkxwhkwlocjufc`. It is read-only and uses a `READ ONLY` transaction; it reports catalog structure and grants, not customer rows. Do not run `flight_quotation_booking_lifecycle.sql` or concurrency scenarios against active staging: those scripts create workflow data, exercise writes/locks, and the lifecycle test deletes a synthetic Auth user within a savepoint and toggles a trigger. Use a disposable local Supabase/PostgreSQL environment for those cases. No remote SQL execution is part of the local implementation work.

## Staging deployment checklist

- Confirm the staged source commit contains the new UI, generated client types, PWA assets, tests, and documentation.
- Confirm staging project reference is exactly `ikbffvqkxwhkwlocjufc` and production ref `ftxfusnrztqbxfhgldsb` is not selected.
- Review migration history before any deployment. Migration `20261020100000` is already deployed; do not reapply or edit it. Deploy only a separately reviewed forward migration if one is later authored and approved.
- Complete static checks, review the production build output, and perform the workflow checks above using synthetic users and requests.
- Check browser console/network responses for authorization errors and verify no private endpoint responses were cached.
- Enable notification delivery only after server-side provider configuration, verified sender approval, outbox/retry implementation, and explicit operational authorization.

## Production readiness

Current local UI work is not evidence of staging or production execution. Before any production release, independently verify schema, migrations, staff/customer roles, ownership isolation, valid transitions, numeric bounds, expiry behavior, backups/recovery, and mobile flows. Use approved synthetic accounts and a planned release window. Production deployment requires explicit authorization and is outside this implementation.
