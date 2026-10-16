# Phase 6 manual release QA checklist

Status: NOT RUN. Browser automation is unavailable in this workspace; complete this checklist in a real browser before release. Do not enter real payment details or submit a real booking.

## Shared route and viewport checks

Test each route at 375px, 768px, and 1440px: `/`, `/flights`, `/checkout`, `/account`, `/admin`, `/hotels`, `/cars`, `/visa`, `/blog`, `/kakande`.

- [ ] Open each route directly and refresh it; it should render the intended page without a 404.
- [ ] Check horizontal overflow, clipped controls, image sizing, console errors, and failed network requests.
- [ ] Check navigation menus with pointer, keyboard, and touch; confirm focus is visible and Escape closes overlays where applicable.
- [ ] Tab through links and forms; verify labels, error associations, and reduced-motion behavior.

## Flight search to checkout

At each viewport, use a non-purchasing test session and provider-safe search parameters.

- [ ] Select origin and destination by airport/city and confirm IATA codes and names.
- [ ] Search one-way and round-trip routes; verify departure/return dates, passenger count, and cabin class in the submitted request/results.
- [ ] Exercise required-field/date validation and keyboard operation of selectors.
- [ ] Confirm returned results are provider responses; test sorting by price, duration, departure, and stops against displayed values.
- [ ] Select a result and inspect the fare summary and offer/provider reference carried to checkout.
- [ ] Navigate checkout steps, trigger validation, and verify back/forward navigation preserves entered non-sensitive fields.
- [ ] Stop before final submission; do not create bookings, reservations, or payments.

## Account and admin access

- [ ] Signed-out users cannot access private account/admin content by direct URL.
- [ ] Sign in with an authorized test customer; verify only that account's bookings and statuses are displayed.
- [ ] Verify a customer cannot access another customer's booking by changing a URL or client query parameter.
- [ ] Verify a non-admin cannot access admin pages or invoke admin actions; verify permitted staff roles see only their authorized controls.
- [ ] Inspect status labels and manual payment instructions against actual records; do not change statuses or execute payments.
- [ ] Confirm errors do not expose tokens, passenger data, or internal stack traces.

## Public content and deployment

- [ ] Verify Hotels, Cars, Visa, Blog, and Kakande content and inquiry actions at each viewport; distinguish examples from live inventory.
- [ ] Verify canonical, title, description, Open Graph/Twitter preview image for public pages using crawler preview tools.
- [ ] Confirm sitemap excludes `/account`, `/checkout`, `/admin`, `/auth`; robots rules and sitemap URL are reachable.
- [ ] Confirm existing static assets load and `/api/*` requests, if any, are not rewritten to the SPA.
