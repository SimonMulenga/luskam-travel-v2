-- Phase 9D: atomic quote replay protection and persistent Edge Function limits.
-- Apply after the booking authorization and anonymous grant migrations.
-- This migration does not change Option A booking statuses or supplier behavior.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.booking_quote_claims (
  user_id uuid NOT NULL,
  quote_nonce uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[A-Za-z0-9_-]{43}$'),
  quote_expires_at timestamptz NOT NULL,
  booking_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_quote_claims_pk PRIMARY KEY (user_id, quote_nonce)
);
ALTER TABLE private.booking_quote_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.booking_quote_claims FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS private.booking_edge_rate_limits (
  user_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('quote', 'submit_flight', 'inquiry')),
  window_seconds integer NOT NULL CHECK (window_seconds > 0),
  bucket_start bigint NOT NULL,
  hit_count integer NOT NULL CHECK (hit_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_edge_rate_limits_pk PRIMARY KEY (user_id, scope, window_seconds, bucket_start)
);
ALTER TABLE private.booking_edge_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.booking_edge_rate_limits FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS booking_quote_claims_expiry_idx
  ON private.booking_quote_claims (quote_expires_at);

CREATE OR REPLACE FUNCTION public.consume_booking_edge_rate_limit(
  p_user_id uuid,
  p_scope text,
  p_max_requests integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
DECLARE
  v_now bigint := floor(extract(epoch FROM clock_timestamp()))::bigint;
  v_bucket bigint;
  v_count integer;
  v_retry integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;
  IF p_user_id IS NULL OR p_scope IS NULL OR p_scope NOT IN ('quote', 'submit_flight', 'inquiry')
     OR p_max_requests IS NULL OR p_max_requests < 1 OR p_max_requests > 100
     OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid rate limit parameters';
  END IF;

  v_bucket := (v_now / p_window_seconds) * p_window_seconds;
  INSERT INTO private.booking_edge_rate_limits(user_id, scope, window_seconds, bucket_start, hit_count)
  VALUES (p_user_id, p_scope, p_window_seconds, v_bucket, 1)
  ON CONFLICT (user_id, scope, window_seconds, bucket_start)
  DO UPDATE SET hit_count = CASE
      WHEN private.booking_edge_rate_limits.hit_count < p_max_requests
        THEN private.booking_edge_rate_limits.hit_count + 1
      ELSE private.booking_edge_rate_limits.hit_count
    END,
    updated_at = clock_timestamp()
  RETURNING hit_count INTO v_count;

  -- Opportunistic bounded cleanup for this identity only.
  DELETE FROM private.booking_edge_rate_limits
  WHERE user_id = p_user_id AND bucket_start < v_now - 86400;

  v_retry := greatest(1, (v_bucket + p_window_seconds - v_now)::integer);
  RETURN jsonb_build_object('allowed', v_count <= p_max_requests, 'retry_after_seconds', v_retry);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_booking_edge_rate_limit(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_booking_edge_rate_limit(uuid, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_flight_booking_request_replay(
  p_user_id uuid,
  p_quote_nonce uuid,
  p_idempotency_key uuid,
  p_request_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
DECLARE
  v_claim private.booking_quote_claims%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;
  IF p_user_id IS NULL OR p_quote_nonce IS NULL OR p_idempotency_key IS NULL
     OR p_request_hash IS NULL OR p_request_hash !~ '^[A-Za-z0-9_-]{43}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid replay lookup';
  END IF;

  -- Coordinate with creation so a lookup cannot mistake an uncommitted claim
  -- for an unused nonce and reject an otherwise valid retry at quote expiry.
  -- Hash collisions only serialize unrelated requests; the primary key remains
  -- the authoritative uniqueness guarantee.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_user_id::text), pg_catalog.hashtext(p_quote_nonce::text)
  );

  -- Retain replay tombstones for 30 days, then remove at most 100 expired rows
  -- per call. Expired unconsumed quote tokens are rejected by the Edge Function.
  WITH expired AS (
    SELECT user_id, quote_nonce
    FROM private.booking_quote_claims
    WHERE quote_expires_at < clock_timestamp() - interval '30 days'
    ORDER BY quote_expires_at
    LIMIT 100
  )
  DELETE FROM private.booking_quote_claims AS claims
  USING expired
  WHERE claims.user_id = expired.user_id AND claims.quote_nonce = expired.quote_nonce;

  SELECT * INTO v_claim
  FROM private.booking_quote_claims
  WHERE user_id = p_user_id AND quote_nonce = p_quote_nonce
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'new'); END IF;
  IF v_claim.idempotency_key <> p_idempotency_key OR v_claim.request_hash <> p_request_hash
     OR v_claim.booking_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'conflict');
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = v_claim.booking_id AND user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'claimed booking is unavailable'; END IF;
  RETURN jsonb_build_object('outcome', 'replay', 'booking', jsonb_build_object(
    'id', v_booking.id, 'reference', v_booking.reference, 'total_amount', v_booking.total_amount,
    'currency', v_booking.currency, 'status', v_booking.status, 'payment_status', v_booking.payment_status,
    'type', v_booking.type, 'travel_date', v_booking.travel_date, 'details', v_booking.details,
    'created_at', v_booking.created_at
  ));
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_flight_booking_request_replay(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_flight_booking_request_replay(uuid, uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.create_flight_booking_request_once(
  p_user_id uuid,
  p_quote_nonce uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_quote_expires_at timestamptz,
  p_reference text,
  p_total_amount numeric,
  p_currency text,
  p_travel_date date,
  p_details jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
DECLARE
  v_claim private.booking_quote_claims%ROWTYPE;
  v_inserted integer;
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;
  IF p_user_id IS NULL OR p_quote_nonce IS NULL OR p_idempotency_key IS NULL
     OR p_request_hash IS NULL OR p_request_hash !~ '^[A-Za-z0-9_-]{43}$'
     OR p_quote_expires_at IS NULL
     OR p_reference IS NULL OR length(p_reference) > 64
     OR p_total_amount IS NULL OR p_total_amount <= 0
     OR p_currency IS NULL OR p_currency <> 'USD' OR jsonb_typeof(p_details) <> 'object'
     OR p_details ->> 'requestOnly' IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object('outcome', 'conflict');
  END IF;

  -- Share the replay lookup lock. This makes the preflight wait for an
  -- in-flight creation of this customer/nonce, even if the quote expires while
  -- that transaction is completing. The primary key still protects against
  -- duplicate claims independently of this cooperative lock.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_user_id::text), pg_catalog.hashtext(p_quote_nonce::text)
  );

  -- Resolve a committed claim before considering expiry. A matching request
  -- remains safely replayable after expiry; a different key or payload never
  -- reuses the nonce.
  SELECT * INTO v_claim
  FROM private.booking_quote_claims
  WHERE user_id = p_user_id AND quote_nonce = p_quote_nonce
  FOR UPDATE;
  IF FOUND THEN
    IF v_claim.idempotency_key <> p_idempotency_key OR v_claim.request_hash <> p_request_hash
       OR v_claim.booking_id IS NULL THEN
      RETURN jsonb_build_object('outcome', 'conflict');
    END IF;
    SELECT * INTO v_booking FROM public.bookings WHERE id = v_claim.booking_id AND user_id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'claimed booking is unavailable';
    END IF;
    RETURN jsonb_build_object('outcome', 'replay', 'booking', jsonb_build_object(
      'id', v_booking.id, 'reference', v_booking.reference, 'total_amount', v_booking.total_amount,
      'currency', v_booking.currency, 'status', v_booking.status, 'payment_status', v_booking.payment_status,
      'type', v_booking.type, 'travel_date', v_booking.travel_date, 'details', v_booking.details,
      'created_at', v_booking.created_at
    ));
  END IF;

  -- Expiry applies only to an unused nonce. Reject before claiming it, so an
  -- expired quote cannot create a booking or leave a replay tombstone.
  IF p_quote_expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('outcome', 'conflict');
  END IF;

  -- The unique nonce claim and booking insert commit atomically. A competing
  -- request waits on the unique key, then sees either the complete booking or
  -- the conflicting request fingerprint; no abandoned in-progress claim exists.
  INSERT INTO private.booking_quote_claims(user_id, quote_nonce, idempotency_key, request_hash, quote_expires_at)
  VALUES (p_user_id, p_quote_nonce, p_idempotency_key, p_request_hash, p_quote_expires_at)
  ON CONFLICT (user_id, quote_nonce) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT * INTO v_claim
    FROM private.booking_quote_claims
    WHERE user_id = p_user_id AND quote_nonce = p_quote_nonce
    FOR UPDATE;
    IF v_claim.idempotency_key <> p_idempotency_key OR v_claim.request_hash <> p_request_hash
       OR v_claim.booking_id IS NULL THEN
      RETURN jsonb_build_object('outcome', 'conflict');
    END IF;
    SELECT * INTO v_booking FROM public.bookings WHERE id = v_claim.booking_id AND user_id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'claimed booking is unavailable';
    END IF;
    RETURN jsonb_build_object('outcome', 'replay', 'booking', jsonb_build_object(
      'id', v_booking.id, 'reference', v_booking.reference, 'total_amount', v_booking.total_amount,
      'currency', v_booking.currency, 'status', v_booking.status, 'payment_status', v_booking.payment_status,
      'type', v_booking.type, 'travel_date', v_booking.travel_date, 'details', v_booking.details,
      'created_at', v_booking.created_at
    ));
  END IF;

  INSERT INTO public.bookings(user_id, reference, type, status, payment_status, total_amount, currency, travel_date, details)
  VALUES (p_user_id, p_reference, 'flight', 'pending', 'pending', p_total_amount, p_currency, p_travel_date, p_details)
  RETURNING * INTO v_booking;

  UPDATE private.booking_quote_claims
  SET booking_id = v_booking.id
  WHERE user_id = p_user_id AND quote_nonce = p_quote_nonce;

  RETURN jsonb_build_object('outcome', 'created', 'booking', jsonb_build_object(
    'id', v_booking.id, 'reference', v_booking.reference, 'total_amount', v_booking.total_amount,
    'currency', v_booking.currency, 'status', v_booking.status, 'payment_status', v_booking.payment_status,
    'type', v_booking.type, 'travel_date', v_booking.travel_date, 'details', v_booking.details,
    'created_at', v_booking.created_at
  ));
END;
$$;
REVOKE ALL ON FUNCTION public.create_flight_booking_request_once(uuid, uuid, uuid, text, timestamptz, text, numeric, text, date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_flight_booking_request_once(uuid, uuid, uuid, text, timestamptz, text, numeric, text, date, jsonb) TO service_role;

COMMENT ON FUNCTION public.create_flight_booking_request_once(uuid, uuid, uuid, text, timestamptz, text, numeric, text, date, jsonb)
IS 'Service-role-only atomic Option A booking-request creation; one quote nonce can create at most one booking for its verified owner.';
COMMENT ON FUNCTION public.consume_booking_edge_rate_limit(uuid, text, integer, integer)
IS 'Service-role-only persistent fixed-window rate limiter for create-booking-request.';
COMMENT ON FUNCTION public.resolve_flight_booking_request_replay(uuid, uuid, uuid, text)
IS 'Service-role-only lookup for safe idempotent retries before fare provider revalidation.';
