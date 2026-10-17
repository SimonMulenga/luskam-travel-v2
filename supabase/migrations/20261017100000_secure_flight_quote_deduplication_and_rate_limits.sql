-- Phase 9G remediation: transaction-safe rolling deduplication and sliding-window limits.
-- Apply after 20261016100000_flight_quote_requests.sql. No booking/provider/payment workflows.

-- The old key encoded an aligned time bucket. Keep its value for audit, but remove
-- the permanent table-wide uniqueness rule; the private expiring claim below is
-- now the authoritative rolling-window deduplication mechanism.
ALTER TABLE public.flight_quote_requests
  DROP CONSTRAINT IF EXISTS flight_quote_requests_dedupe_key_key;

CREATE TABLE private.flight_quote_dedupe_claims (
  dedupe_key text PRIMARY KEY CHECK (dedupe_key ~ '^[A-Za-z0-9_-]{43}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[A-Za-z0-9_-]{43}$'),
  reference text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
ALTER TABLE private.flight_quote_dedupe_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.flight_quote_dedupe_claims FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.flight_quote_dedupe_claims FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX flight_quote_dedupe_claims_expiry_idx
  ON private.flight_quote_dedupe_claims (expires_at);

CREATE OR REPLACE FUNCTION public.create_flight_quote_request_once(
  p_idempotency_key uuid,
  p_request_hash text,
  p_dedupe_key text,
  p_reference text,
  p_origin text,
  p_destination text,
  p_departure_date date,
  p_return_date date,
  p_trip_type text,
  p_adults integer,
  p_children integer,
  p_infants integer,
  p_cabin_class text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_special_requests text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_lock_id bigint;
  v_lock_dedupe bigint;
  v_first_lock bigint;
  v_second_lock bigint;
  v_existing public.flight_quote_requests%ROWTYPE;
  v_claim private.flight_quote_dedupe_claims%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;
  IF p_idempotency_key IS NULL
     OR p_request_hash IS NULL OR p_request_hash !~ '^[A-Za-z0-9_-]{43}$'
     OR p_dedupe_key IS NULL OR p_dedupe_key !~ '^[A-Za-z0-9_-]{43}$'
     OR p_dedupe_key IS DISTINCT FROM p_request_hash
     OR p_reference IS NULL OR p_reference !~ '^LTA-[0-9]{8}-[A-F0-9]{16}$'
     OR p_origin IS NULL OR p_origin !~ '^[A-Z]{3}$'
     OR p_destination IS NULL OR p_destination !~ '^[A-Z]{3}$' OR p_destination = p_origin
     OR p_departure_date IS NULL OR p_departure_date < v_now::date
     OR p_trip_type IS NULL
     OR (p_trip_type = 'oneway' AND p_return_date IS NOT NULL)
     OR (p_trip_type = 'return' AND (p_return_date IS NULL OR p_return_date < p_departure_date))
     OR p_trip_type NOT IN ('oneway', 'return')
     OR p_adults IS NULL OR p_adults NOT BETWEEN 1 AND 9
     OR p_children IS NULL OR p_children NOT BETWEEN 0 AND 8
     OR p_infants IS NULL OR p_infants NOT BETWEEN 0 AND 8
     OR p_adults::bigint + p_children::bigint + p_infants::bigint > 17
     OR p_infants > p_adults
     OR p_cabin_class IS NULL OR p_cabin_class NOT IN ('economy', 'premium_economy', 'business', 'first')
     OR p_customer_name IS NULL OR pg_catalog.length(p_customer_name) NOT BETWEEN 2 AND 120
     OR p_customer_email IS NULL OR pg_catalog.length(p_customer_email) NOT BETWEEN 3 AND 254
     OR p_customer_phone IS NULL OR pg_catalog.length(p_customer_phone) NOT BETWEEN 7 AND 32
     OR p_special_requests IS NULL OR pg_catalog.length(p_special_requests) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid flight quotation request';
  END IF;

  -- Acquire both namespaced locks in a deterministic order to avoid deadlocks.
  -- Collisions only serialize unrelated requests; table constraints remain authoritative.
  v_lock_id := pg_catalog.hashtextextended('flight-quote-idem:' || p_idempotency_key::text, 0);
  v_lock_dedupe := pg_catalog.hashtextextended('flight-quote-dedupe:' || p_dedupe_key, 0);
  v_first_lock := CASE WHEN v_lock_id <= v_lock_dedupe THEN v_lock_id ELSE v_lock_dedupe END;
  v_second_lock := CASE WHEN v_lock_id <= v_lock_dedupe THEN v_lock_dedupe ELSE v_lock_id END;
  PERFORM pg_catalog.pg_advisory_xact_lock(v_first_lock);
  IF v_second_lock <> v_first_lock THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(v_second_lock);
  END IF;
  -- Measure the rolling TTL after any wait, not before the competing request commits.
  v_now := pg_catalog.clock_timestamp();

  -- Reusing an idempotency key with different canonical content is a conflict.
  SELECT * INTO v_existing
  FROM public.flight_quote_requests
  WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.request_hash <> p_request_hash THEN
      RETURN pg_catalog.jsonb_build_object('outcome', 'conflict');
    END IF;
    -- Treat a retry as activity in the rolling window. Preserve whichever
    -- request reference currently owns the active fingerprint claim.
    INSERT INTO private.flight_quote_dedupe_claims (dedupe_key, request_hash, reference, expires_at)
    VALUES (p_dedupe_key, p_request_hash, v_existing.reference, v_now + interval '15 minutes')
    ON CONFLICT (dedupe_key) DO UPDATE
      SET expires_at = EXCLUDED.expires_at
      WHERE private.flight_quote_dedupe_claims.request_hash = EXCLUDED.request_hash;
    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('outcome', 'conflict');
    END IF;
    RETURN pg_catalog.jsonb_build_object('outcome', 'duplicate', 'reference', v_existing.reference);
  END IF;

  SELECT * INTO v_claim
  FROM private.flight_quote_dedupe_claims
  WHERE dedupe_key = p_dedupe_key AND expires_at > v_now;
  IF FOUND THEN
    IF v_claim.request_hash <> p_request_hash THEN
      RETURN pg_catalog.jsonb_build_object('outcome', 'conflict');
    END IF;
    UPDATE private.flight_quote_dedupe_claims
    SET expires_at = v_now + interval '15 minutes'
    WHERE dedupe_key = p_dedupe_key;
    RETURN pg_catalog.jsonb_build_object('outcome', 'duplicate', 'reference', v_claim.reference);
  END IF;

  DELETE FROM private.flight_quote_dedupe_claims
  WHERE dedupe_key = p_dedupe_key AND expires_at <= v_now;

  -- Bound opportunistic cleanup to keep expired claims from accumulating.
  WITH expired AS (
    SELECT dedupe_key
    FROM private.flight_quote_dedupe_claims
    WHERE expires_at <= v_now
    ORDER BY expires_at
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM private.flight_quote_dedupe_claims AS claims
  USING expired
  WHERE claims.dedupe_key = expired.dedupe_key;

  INSERT INTO public.flight_quote_requests (
    reference, idempotency_key, request_hash, dedupe_key,
    origin, destination, departure_date, return_date, trip_type,
    adults, children, infants, cabin_class,
    customer_name, customer_email, customer_phone, special_requests, status
  ) VALUES (
    p_reference, p_idempotency_key, p_request_hash, p_dedupe_key,
    p_origin, p_destination, p_departure_date, p_return_date, p_trip_type,
    p_adults, p_children, p_infants, p_cabin_class,
    p_customer_name, p_customer_email, p_customer_phone, p_special_requests, 'pending'
  );

  INSERT INTO private.flight_quote_dedupe_claims (dedupe_key, request_hash, reference, expires_at)
  VALUES (p_dedupe_key, p_request_hash, p_reference, v_now + interval '15 minutes');

  RETURN pg_catalog.jsonb_build_object('outcome', 'created', 'reference', p_reference);
END;
$$;
REVOKE ALL ON FUNCTION public.create_flight_quote_request_once(
  uuid, text, text, text, text, text, date, date, text, integer, integer, integer,
  text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_flight_quote_request_once(
  uuid, text, text, text, text, text, date, date, text, integer, integer, integer,
  text, text, text, text, text
) TO service_role;

-- Exact sliding window: serialize each pseudonymous address, prune expired hits,
-- count all surviving hits, and insert only when below the limit.
CREATE TABLE private.flight_quote_rate_limit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
ALTER TABLE private.flight_quote_rate_limit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.flight_quote_rate_limit_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.flight_quote_rate_limit_events FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX flight_quote_rate_limit_events_identity_time_idx
  ON private.flight_quote_rate_limit_events (identity, occurred_at);
CREATE INDEX flight_quote_rate_limit_events_time_idx
  ON private.flight_quote_rate_limit_events (occurred_at);

CREATE OR REPLACE FUNCTION public.consume_flight_quote_rate_limit(
  p_identity uuid,
  p_max_requests integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_oldest timestamptz;
  v_count integer;
  v_retry integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;
  IF p_identity IS NULL OR p_max_requests IS NULL OR p_max_requests < 1 OR p_max_requests > 100
     OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid rate limit parameters';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('flight-quote-rate:' || p_identity::text, 0)
  );
  -- Recompute after the per-identity lock wait so window boundaries use current time.
  v_now := pg_catalog.clock_timestamp();
  DELETE FROM private.flight_quote_rate_limit_events
  WHERE identity = p_identity AND occurred_at <= v_now - pg_catalog.make_interval(secs => p_window_seconds);

  WITH expired AS (
    SELECT id
    FROM private.flight_quote_rate_limit_events
    WHERE occurred_at <= v_now - interval '1 day'
    ORDER BY occurred_at
    LIMIT 500
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM private.flight_quote_rate_limit_events AS events
  USING expired
  WHERE events.id = expired.id;

  SELECT pg_catalog.count(*)::integer, pg_catalog.min(occurred_at)
  INTO v_count, v_oldest
  FROM private.flight_quote_rate_limit_events
  WHERE identity = p_identity
    AND occurred_at > v_now - pg_catalog.make_interval(secs => p_window_seconds);

  IF v_count >= p_max_requests THEN
    v_retry := CASE
      WHEN pg_catalog.ceil(extract(epoch FROM (
        v_oldest + pg_catalog.make_interval(secs => p_window_seconds) - v_now
      )))::integer < 1 THEN 1
      ELSE pg_catalog.ceil(extract(epoch FROM (
        v_oldest + pg_catalog.make_interval(secs => p_window_seconds) - v_now
      )))::integer
    END;
    RETURN pg_catalog.jsonb_build_object('allowed', false, 'retry_after_seconds', v_retry);
  END IF;

  INSERT INTO private.flight_quote_rate_limit_events (identity, occurred_at) VALUES (p_identity, v_now);
  RETURN pg_catalog.jsonb_build_object('allowed', true, 'retry_after_seconds', p_window_seconds);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_flight_quote_rate_limit(uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_flight_quote_rate_limit(uuid, integer, integer)
  TO service_role;

COMMENT ON FUNCTION public.create_flight_quote_request_once(
  uuid, text, text, text, text, text, date, date, text, integer, integer, integer,
  text, text, text, text, text
) IS 'Service-role-only atomic idempotency and 15-minute rolling deduplication for manual flight quotation requests.';
COMMENT ON FUNCTION public.consume_flight_quote_rate_limit(uuid, integer, integer)
  IS 'Service-role-only persistent exact sliding-window rate limit for anonymous flight quotation requests.';
