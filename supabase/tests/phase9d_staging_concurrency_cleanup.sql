-- Guarded cleanup for the single committed synthetic concurrency booking.
-- Verify the staging project and inspect the exact booking ID before running.
-- This transaction deletes only the tagged booking and cascaded child rows.
-- It deliberately retains the matching replay tombstone. Do not add broader deletes.
-- Use a fresh privileged connection with no unrelated open transaction.

BEGIN;
SELECT set_config('phase9d.cleanup_user', '2e33f3a7-61e6-4971-8c2e-4dc817df7937', true);
SELECT set_config('phase9d.cleanup_nonce', 'aabf8133-3ff1-4a6c-8b7c-c0fd91a02e01', true);
SELECT set_config('phase9d.cleanup_key', 'bb0d3584-8aab-4e9e-8442-84badd9aa102', true);
SELECT set_config('phase9d.cleanup_hash', repeat('e', 43), true);
SELECT set_config('phase9d.cleanup_booking_id', '26a4e3e8-8d04-4615-977c-1c146c19f9e8', true);
SELECT set_config('phase9d.cleanup_reference', 'PHASE9D-STAGING-7a4edeb7-bfd3-4d80-aac5-1bb8e0bdc202', true);

DO $$
DECLARE matched_bookings integer; matched_claims integer; deleted_bookings integer; retained_claims integer;
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Unexpected cleanup role %', current_user;
  END IF;
  IF current_setting('phase9d.cleanup_booking_id') !~ '^[0-9a-fA-F-]{36}$' THEN
    RAISE EXCEPTION 'Replace the booking ID with the exact UUID from the verification output';
  END IF;
  IF current_setting('phase9d.cleanup_reference') <> 'PHASE9D-STAGING-7a4edeb7-bfd3-4d80-aac5-1bb8e0bdc202' THEN
    RAISE EXCEPTION 'Unexpected synthetic reference';
  END IF;

  SELECT count(*) INTO matched_bookings
  FROM public.bookings
  WHERE id = current_setting('phase9d.cleanup_booking_id')::uuid
    AND user_id = current_setting('phase9d.cleanup_user')::uuid
    AND reference = current_setting('phase9d.cleanup_reference')
    AND status = 'pending' AND payment_status = 'pending'
    AND total_amount = 123.45 AND currency = 'USD'
    AND duffel_order_id IS NULL AND duffel_booking_reference IS NULL
    AND details @> '{"requestOnly":true,"synthetic":true,"test_only":true}'::jsonb;
  IF matched_bookings <> 1 THEN
    RAISE EXCEPTION 'Cleanup refused: expected one exact pending synthetic booking; found %', matched_bookings;
  END IF;

  SELECT count(*) INTO matched_claims
  FROM private.booking_quote_claims
  WHERE user_id = current_setting('phase9d.cleanup_user')::uuid
    AND quote_nonce = current_setting('phase9d.cleanup_nonce')::uuid
    AND idempotency_key = current_setting('phase9d.cleanup_key')::uuid
    AND request_hash = current_setting('phase9d.cleanup_hash')
    AND booking_id = current_setting('phase9d.cleanup_booking_id')::uuid;
  IF matched_claims <> 1 THEN
    RAISE EXCEPTION 'Cleanup refused: expected exactly one matching replay tombstone; found %', matched_claims;
  END IF;

  DELETE FROM public.bookings
  WHERE id = current_setting('phase9d.cleanup_booking_id')::uuid
    AND user_id = current_setting('phase9d.cleanup_user')::uuid
    AND reference = current_setting('phase9d.cleanup_reference')
    AND status = 'pending' AND payment_status = 'pending'
    AND total_amount = 123.45 AND currency = 'USD'
    AND duffel_order_id IS NULL AND duffel_booking_reference IS NULL
    AND details @> '{"requestOnly":true,"synthetic":true,"test_only":true}'::jsonb;
  GET DIAGNOSTICS deleted_bookings = ROW_COUNT;
  IF deleted_bookings <> 1 THEN
    RAISE EXCEPTION 'Cleanup refused: expected one deleted booking; deleted %', deleted_bookings;
  END IF;

  SELECT count(*) INTO retained_claims
  FROM private.booking_quote_claims
  WHERE user_id = current_setting('phase9d.cleanup_user')::uuid
    AND quote_nonce = current_setting('phase9d.cleanup_nonce')::uuid
    AND idempotency_key = current_setting('phase9d.cleanup_key')::uuid
    AND request_hash = current_setting('phase9d.cleanup_hash')
    AND booking_id = current_setting('phase9d.cleanup_booking_id')::uuid;

  IF EXISTS (SELECT 1 FROM public.bookings
             WHERE id = current_setting('phase9d.cleanup_booking_id')::uuid
                OR reference = current_setting('phase9d.cleanup_reference'))
     OR EXISTS (SELECT 1 FROM public.flight_bookings
                WHERE booking_id = current_setting('phase9d.cleanup_booking_id')::uuid)
     OR EXISTS (SELECT 1 FROM public.booking_payments
                WHERE booking_id = current_setting('phase9d.cleanup_booking_id')::uuid)
     OR EXISTS (SELECT 1 FROM public.booking_pricing
                WHERE booking_id = current_setting('phase9d.cleanup_booking_id')::uuid)
     OR retained_claims <> 1 THEN
    RAISE EXCEPTION 'Cleanup verification failed: booking children remain or replay tombstone is missing';
  END IF;
END;
$$;

SELECT 'PASS: exact synthetic booking removed; matching replay tombstone retained' AS result;
COMMIT;
