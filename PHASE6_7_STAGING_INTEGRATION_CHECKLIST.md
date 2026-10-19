# Phase 6A / 7A staging integration checklist

Run this checklist only in the authorized staging project `ikbffvqkxwhkwlocjufc`. Use the staging website configured for that project and synthetic identities and requests. Never use production project `ftxfusnrztqbxfhgldsb`. Do not use SQL that writes, repairs migration history, changes triggers, or deletes Auth users.

## Prerequisites and fixtures

- Confirm the staging website's Supabase project reference is `ikbffvqkxwhkwlocjufc` before signing in. Confirm the production reference is not selected. Do not expose or paste API keys, tokens, or connection strings into test notes.
- Confirm migration `20261020100000` is already recorded and the five workflow tables and functions are present. The project owner has reported the read-only catalog verification succeeded; this does not verify each stored function body against this checkout.
- Prepare four distinct synthetic Auth accounts: Customer A, Customer B, one agent, and one admin. Give only the agent and admin their matching staff roles. Do not promote a customer account.
- Through the normal customer flow, create at least four synthetic, authenticated flight requests: Customer A requests for acceptance, decline, revision, and expiry; and one request for Customer B. Record their request references and confirm each appears under the correct customer account. Do not claim or reassign anonymous/legacy requests.
- Use no real traveller data, supplier reservations, or ticket references. For a positive ticket-issued transition, first obtain supplier sandbox confirmation and ticket references specifically designated for testing. If none are available, test that blank references are rejected and leave the booking at `awaiting_supplier_confirmation`.
- Use the seeded staging Kakande trip/option where available. If it is unavailable, stop that regression case and ask the staging owner to prepare a published synthetic-safe option through the normal admin workflow; do not alter shared trip configuration for this run.

## Quotation creation, issue, edit, and revision

1. Sign in as the agent, open **Admin → Quote workflow**, select Customer A's acceptance request, and create a draft with multiple line items. Verify the request reference, itinerary, traveller count, item amounts, and calculated total.
2. Edit that draft and save. Confirm the revised item list and total persist after refresh. Issue it and record the displayed 24-hour expiry.
3. Repeat draft creation and issue as the admin using Customer A's separate decline request. This checks both staff roles without sharing a quotation or request fixture.
4. On the revision fixture, issue revision 1, prepare revision 2 from its history, save and issue revision 2. Confirm revision 1 remains in history as superseded and only revision 2 is currently actionable.
5. Verify the UI blocks quantity, unit-price, item-count, precision, and total values outside the supported bounds before submission. Do not use SQL to manufacture boundary rows in staging; those cases belong in the rollback-only local lifecycle test.

## Customer viewing, acceptance, decline, and idempotency

1. Sign in as Customer A and open **My requests**. Verify A sees the issued quotation(s), item descriptions, ZMW totals, issue/expiry time, and revisions. Verify no customer email, internal note, actor ID, or unrelated request data appears.
2. Accept the acceptance fixture once. Confirm the quotation changes to accepted and exactly one booking request appears with status **Received**. The UI must not claim that a seat is reserved or a ticket issued.
3. Refresh My Requests and verify the booking request remains singular and its status is stable. The database enforces one booking per request. A second authenticated call to `respond_to_flight_quotation` for the same accepted quotation should return `duplicate` with the same booking ID; verify this only through an owner-approved staging QA harness using Customer A's existing session, never by copying session tokens into logs. If no such harness exists, mark RPC replay as unverified in staging; the rollback-only lifecycle test covers it locally.
4. Decline the separate decline fixture. Verify status becomes declined, no booking request is created, and the action is not available again.
5. For expiry, wait until the separate quotation's displayed 24-hour validity has elapsed. Refresh the customer view and confirm no accept/decline action is available. Have staff persist expiry and confirm it is shown as expired. Do not backdate timestamps or alter records directly.

## Cross-customer isolation and staff booking workflow

1. Sign in as Customer B. Confirm Customer B sees their own request only and cannot see Customer A's quotation or booking in My Requests.
2. With the owner-approved authenticated QA harness, attempt `respond_to_flight_quotation` using the known synthetic Customer A quotation ID while authenticated as Customer B. Expect an authorization failure with no quotation or booking details returned. Do not query Customer A's rows as a privileged SQL role to simulate a customer.
3. As agent, advance Customer A's accepted booking request from `booking_requested` to `processing`, then `awaiting_supplier_confirmation`. Confirm each update appears in the customer view and the staff audit history.
4. Attempt an invalid next transition through the UI if available; it should be blocked. If checking server rejection, use the same authenticated staging QA harness and only the synthetic booking ID.
5. Attempt ticket issuance with empty supplier/ticket references; it must fail. If the staging supplier sandbox has issued real test references, enter those exact values and confirm `confirmed_ticket_issued`. Never enter fabricated production-looking references. Then, if appropriate, advance to completed and confirm ticket references remain immutable.

## Kakande, legacy bookings, and PWA regression checks

- Submit one Kakande request from Customer A using the existing published staging trip option. Verify its prior My Requests display/status still works. Do not change the Kakande request lifecycle or shared trip inventory as part of the flight test.
- Open the existing **Bookings** tab and verify its historical/legacy booking records still render. Do not create, cancel, or edit a legacy booking for this regression check.
- After an approved staging website deployment over HTTPS, verify installation in Android Chrome (**Install app / Add to Home screen**) and iPhone Safari (**Share → Add to Home Screen**). Verify manifest name/icons and launch behavior.
- While online, load a public page, then go offline and verify the generic offline page. Check that account, admin, API, quotation, and booking responses are not served from service-worker cache. Restore connectivity and confirm the app recovers. Do not infer mobile installation readiness from a local desktop build.

## Evidence and stop conditions

Record only synthetic request references, quotation/booking statuses, timestamps, browser/version, and pass/fail results. Do not capture customer PII, tokens, API keys, or database URLs. Stop and report a blocker if project identity, role assignments, fixture ownership, RPC authorization, one-booking behavior, or private-data isolation differs from the expected result. Do not fix staging data manually during this run.

The positive supplier/ticket path depends on supplier sandbox-issued references. The 24-hour expiry path requires waiting a full validity period. The RPC replay and cross-customer RPC denial checks require an owner-approved authenticated staging QA harness if the deployed UI does not expose those retry cases. Keep any unverified case explicitly marked as such.
