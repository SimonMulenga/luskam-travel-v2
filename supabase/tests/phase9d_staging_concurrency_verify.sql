-- Read-only verification of the committed synthetic concurrency fixture.
-- Verify project ikbffvqkxwhkwlocjufc and replace the booking ID with the exact
-- ID returned by Session A and Session B before running.
-- Run on a fresh privileged connection; this script is read-only and rolls back.

BEGIN;
SELECT set_config('phase9d.concurrent_user', '2e33f3a7-61e6-4971-8c2e-4dc817df7937', true);
SELECT set_config('phase9d.concurrent_nonce', 'aabf8133-3ff1-4a6c-8b7c-c0fd91a02e01', true);
SELECT set_config('phase9d.concurrent_key', 'bb0d3584-8aab-4e9e-8442-84badd9aa102', true);
SELECT set_config('phase9d.concurrent_hash', repeat('e', 43), true);
SELECT set_config('phase9d.concurrent_booking_id', '26a4e3e8-8d04-4615-977c-1c146c19f9e8', true);
SELECT set_config('phase9d.concurrent_reference', 'PHASE9D-STAGING-7a4edeb7-bfd3-4d80-aac5-1bb8e0bdc202', true);

DO $$
DECLARE booking_count integer; claim_count integer;
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Unexpected verification role %', current_user;
  END IF;
  IF current_setting('phase9d.concurrent_booking_id') !~ '^[0-9a-fA-F-]{36}$' THEN
    RAISE EXCEPTION 'Replace the booking ID with the exact UUID returned by both sessions';
  END IF;
  SELECT count(*) INTO booking_count
  FROM public.bookings
  WHERE id = current_setting('phase9d.concurrent_booking_id')::uuid
    AND user_id = current_setting('phase9d.concurrent_user')::uuid
    AND reference = current_setting('phase9d.concurrent_reference');
  IF booking_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one booking matching the exact synthetic ID, owner, and reference; found %', booking_count;
  END IF;
  SELECT count(*) INTO claim_count
  FROM private.booking_quote_claims
  WHERE user_id = current_setting('phase9d.concurrent_user')::uuid
    AND quote_nonce = current_setting('phase9d.concurrent_nonce')::uuid
    AND idempotency_key = current_setting('phase9d.concurrent_key')::uuid
    AND request_hash = current_setting('phase9d.concurrent_hash')
    AND booking_id = current_setting('phase9d.concurrent_booking_id')::uuid;
  IF claim_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one matching replay tombstone; found %', claim_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id = current_setting('phase9d.concurrent_booking_id')::uuid
      AND status = 'pending' AND payment_status = 'pending'
      AND total_amount = 123.45 AND currency = 'USD'
      AND duffel_order_id IS NULL AND duffel_booking_reference IS NULL
      AND details @> '{"requestOnly":true,"synthetic":true,"test_only":true}'::jsonb
      AND NOT (details ?| ARRAY['pnr','ticket_number','ticket_status','provider_booking_reference','provider_offer_id','duffel_order_id'])
  ) THEN
    RAISE EXCEPTION 'Booking is not the expected unconfirmed, unpaid Option A request';
  END IF;
  IF EXISTS (SELECT 1 FROM public.flight_bookings WHERE booking_id = current_setting('phase9d.concurrent_booking_id')::uuid)
     OR EXISTS (SELECT 1 FROM public.booking_payments WHERE booking_id = current_setting('phase9d.concurrent_booking_id')::uuid)
     OR EXISTS (SELECT 1 FROM public.booking_pricing WHERE booking_id = current_setting('phase9d.concurrent_booking_id')::uuid) THEN
    RAISE EXCEPTION 'Unexpected flight, payment, or pricing child record exists for the inquiry request';
  END IF;
END;
$$;

SELECT b.id, b.user_id, b.reference, b.status, b.payment_status, b.total_amount, b.currency,
       b.duffel_order_id, b.duffel_booking_reference, b.details,
       c.quote_nonce, c.idempotency_key, c.request_hash, c.quote_expires_at, c.booking_id AS tombstone_booking_id
FROM public.bookings AS b
JOIN private.booking_quote_claims AS c
  ON c.booking_id = b.id
WHERE b.id = current_setting('phase9d.concurrent_booking_id')::uuid
  AND b.user_id = current_setting('phase9d.concurrent_user')::uuid
  AND b.reference = current_setting('phase9d.concurrent_reference')
  AND c.user_id = current_setting('phase9d.concurrent_user')::uuid
  AND c.quote_nonce = current_setting('phase9d.concurrent_nonce')::uuid
  AND c.idempotency_key = current_setting('phase9d.concurrent_key')::uuid;

ROLLBACK;
