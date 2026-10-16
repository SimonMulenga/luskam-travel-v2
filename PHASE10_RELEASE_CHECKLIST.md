# Option A production launch checklist

## Operating model

Luskam accepts travel quotation and booking requests. The website does not reserve airline seats, make supplier reservations, issue tickets, or process online payments. FlightAPI provides search/quotation information only. Customer-facing fare values are indicative and subject to supplier availability and Luskam confirmation. A submitted request is not an airline booking. Ticketing remains a manual staff operation after supplier and payment verification.

## Backend approval gap

The current `bookings` schema has `status`, `payment_status`, `total_amount`, and `currency`, but no trusted field or audit record that represents staff approval of a final quotation for payment collection. `payment_status = pending` only represents payment state; it is not proof that the final fare was verified or that payment was authorized. A generic `confirmed` booking status must not be treated as supplier confirmation or ticket issuance.

Until a reviewed backend change exists, the customer UI must show no payment coordinates or payment request. Staff must verify availability and amount with the supplier, communicate the confirmed quotation through an approved channel, then give verified payment instructions manually. The smallest compatible backend enhancement is an audited quote approval record (booking id, final amount/currency, approver user id, approved timestamp, expiry, and revocation state) created only by an authorized staff operation. Exposing payment instructions to customers would additionally require an authenticated, owner-scoped read of that approval record. Ticket or supplier confirmation requires separate verified fields if the business later wants to track them; current generic statuses are insufficient evidence.

## Deployment sequence (production, after separate approval)

1. Export and review the exact production migration diff and deployed policy snapshot; take a database backup and schedule a booking submission maintenance window.
2. Apply Phase 7 migration `20261015120000_harden_customer_booking_updates.sql`, then Phase 8 migration `20261015133000_trusted_booking_creation.sql`. Stop and recover from backup/forward fix if either migration fails. Do not restore customer direct INSERT grants as a rollback.
3. Deploy the trusted `create-booking-request` Edge Function with production secrets configured in Supabase secret storage. Validate an authenticated quote and synthetic request in staging first; do not log tokens or passenger details.
4. Deploy the frontend that calls the function. During migration-to-frontend transition, old clients will be denied direct booking INSERT; pause submissions until the compatible frontend is live.
5. Verify owner-only booking reads, request creation, fare change rejection, cancellation authorization, staff updates, manual request follow-up, and absence of supplier reservations, ticketing, and payment processing.
6. Enable general traffic only after smoke checks pass. Keep production database and provider credentials out of Vercel browser variables.

## Vercel environment checklist

- [ ] Preview branch environment points only to staging Supabase URL and anon key.
- [ ] Production Supabase URL and anon key are configured only in Production environment scope.
- [ ] `SUPABASE_SERVICE_ROLE_KEY`, `FLIGHTAPI_KEY`, and quote-signing secret exist only in Supabase Edge Function secret storage, never Vite `VITE_*` variables or client bundles.
- [ ] Confirm deployed function names, region, CORS origin allowlist, and production domain before release.
- [ ] Confirm Vercel build command is `npm run build`, output directory is `dist`, and SPA rewrites preserve static asset and API paths.
- [ ] Preview hostname is protected from indexing; verify private routes are noindex and absent from sitemap.

## Manual staff operations checklist

For each incoming flight request:

1. Review the request reference, passenger spelling, contact details, route, dates, cabin, and indicative amount in the authenticated admin dashboard.
2. Check current availability and fare directly with the supplier. Record the supplier quote through the approved internal process; do not infer supplier availability from an old web search result.
3. Contact the customer with the confirmed itinerary, final amount/currency, quote expiry, and payment instructions only after verification and approval by authorized staff.
4. Verify received payment using the official payment channel and update payment status only through the approved staff process. A payment record alone is not evidence of supplier reservation or ticket issuance.
5. Complete any supplier booking and ticket issuance manually. Communicate supplier confirmation and ticket details to the customer only after the supplier confirms them.
6. Update the internal request status accurately. Until a dedicated supplier/ticket status is implemented, never use generic `confirmed` or `completed` as proof of ticketing; communicate ticket status separately and directly.
7. For schedule-only/unpriced inquiries, obtain a quote before requesting payment. Never collect payment against a zero-priced inquiry.
8. Handle cancellation requests by checking the existing status and payment state. Escalate paid or supplier-confirmed cases through the applicable supplier process; the customer cancellation RPC only cancels eligible local requests.

## Rollback and recovery

- If frontend deployment fails before migrations, restore the previous frontend.
- If a migration fails, stop and inspect transaction/migration history; do not continue with partial application. Use a reviewed forward correction or restore the verified backup under the incident procedure.
- After Phase 8 migrations, the prior frontend cannot create bookings because direct authenticated booking INSERT is intentionally revoked. Keep submissions paused and redeploy the compatible trusted Edge Function/frontend; never re-grant direct client insertion as routine rollback.
- If the Edge Function fails, pause submissions while repairing or redeploying it. Existing owner reads and eligible cancellation should remain available.
- If authorization tests fail, disable request intake and investigate grants, RLS, and deployed migration state before reopening.

## Post-launch monitoring

- Monitor Edge Function errors, latency, auth failures, quote expiry/change rejections, duplicate/idempotency outcomes, and database insert failures.
- Review Vercel errors, browser JavaScript failures, route refreshes, and asset delivery.
- Review Supabase Auth events and RLS denials for anomalies; never put passenger fields, access tokens, or secrets in logs.
- Reconcile incoming requests against staff review, supplier quote, manually verified payment, and manual ticketing records.
- Confirm daily that no automated reservation, ticket issuance, or payment path has been enabled unintentionally.
- Recheck dependency advisories, backups, deployed RLS policies, storage access, and service-role secret rotation on the release schedule.
