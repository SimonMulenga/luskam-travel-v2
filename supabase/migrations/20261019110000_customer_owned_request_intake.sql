-- Phase 4B: owner-aware service-role intake RPCs with anonymous-compatible wrappers.
-- Apply after 20261019100000_customer_request_ownership.sql.
-- Edge Functions must verify optional Auth tokens and pass only the resulting UID.

CREATE OR REPLACE FUNCTION private.create_flight_quote_request_once_core(
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
  p_special_requests text,
  p_user_id uuid
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
    IF v_existing.user_id IS DISTINCT FROM p_user_id THEN
      RETURN pg_catalog.jsonb_build_object('outcome', 'conflict');
    END IF;
    -- Treat a retry as activity in the rolling window. Preserve whichever
    -- request reference currently owns the active fingerprint claim.
    INSERT INTO private.flight_quote_dedupe_claims (dedupe_key, request_hash, reference, expires_at)
    VALUES (p_dedupe_key, p_request_hash, v_existing.reference, v_now + interval '15 minutes')
    ON CONFLICT (dedupe_key) DO UPDATE
      SET expires_at = EXCLUDED.expires_at
      WHERE private.flight_quote_dedupe_claims.request_hash = EXCLUDED.request_hash
        AND private.flight_quote_dedupe_claims.reference = EXCLUDED.reference;
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
    SELECT * INTO v_existing FROM public.flight_quote_requests WHERE reference = v_claim.reference;
    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('outcome', 'conflict');
    END IF;
    -- Anonymous requests have no stable account identity. Only their same-key
    -- idempotency branch may replay a reference; a dedupe-only match is opaque.
    IF p_user_id IS NULL OR v_existing.user_id IS DISTINCT FROM p_user_id THEN
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
    reference, idempotency_key, request_hash, dedupe_key, user_id,
    origin, destination, departure_date, return_date, trip_type,
    adults, children, infants, cabin_class,
    customer_name, customer_email, customer_phone, special_requests, status
  ) VALUES (
    p_reference, p_idempotency_key, p_request_hash, p_dedupe_key, p_user_id,
    p_origin, p_destination, p_departure_date, p_return_date, p_trip_type,
    p_adults, p_children, p_infants, p_cabin_class,
    p_customer_name, p_customer_email, p_customer_phone, p_special_requests, 'pending'
  );

  INSERT INTO private.flight_quote_dedupe_claims (dedupe_key, request_hash, reference, expires_at)
  VALUES (p_dedupe_key, p_request_hash, p_reference, v_now + interval '15 minutes');

  RETURN pg_catalog.jsonb_build_object('outcome', 'created', 'reference', p_reference);
END;
$$;

ALTER FUNCTION private.create_flight_quote_request_once_core(uuid, text, text, text, text, text, date, date, text, integer, integer, integer, text, text, text, text, text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.create_flight_quote_request_once_core(uuid, text, text, text, text, text, date, date, text, integer, integer, integer, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated, service_role;

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
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
  SELECT private.create_flight_quote_request_once_core($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NULL::uuid);
$$;
ALTER FUNCTION public.create_flight_quote_request_once(uuid, text, text, text, text, text, date, date, text, integer, integer, integer, text, text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_flight_quote_request_once(uuid, text, text, text, text, text, date, date, text, integer, integer, integer, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_flight_quote_request_once(uuid, text, text, text, text, text, date, date, text, integer, integer, integer, text, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.create_flight_quote_request_once_for_customer(
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
  p_special_requests text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
  SELECT private.create_flight_quote_request_once_core($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18);
$$;
ALTER FUNCTION public.create_flight_quote_request_once_for_customer(uuid, text, text, text, text, text, date, date, text, integer, integer, integer, text, text, text, text, text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_flight_quote_request_once_for_customer(uuid, text, text, text, text, text, date, date, text, integer, integer, integer, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_flight_quote_request_once_for_customer(uuid, text, text, text, text, text, date, date, text, integer, integer, integer, text, text, text, text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.create_kakande_ministry_request_once_core(
  p_idempotency_key uuid,
  p_request_hash text,
  p_dedupe_key text,
  p_reference text,
  p_trip_id text,
  p_mode text,
  p_travellers integer,
  p_trip_updated_at timestamptz,
  p_option_updated_at timestamptz,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_notes text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_month text;
  v_trip_published boolean;
  v_option_id uuid;
  v_departure_date date;
  v_price numeric(12,2);
  v_option_published boolean;
  v_availability text;
  v_trip_updated_at timestamptz;
  v_option_timestamp timestamptz;
  v_total numeric(14,2);
  v_customer_notes text;
  v_idem private.kakande_request_idempotency%ROWTYPE;
  v_claim private.kakande_request_dedupe_claims%ROWTYPE;
  v_existing public.kakande_ministry_requests%ROWTYPE;
  v_lock_id bigint;
  v_lock_dedupe bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;
  -- Persist notes in one canonical form. LF is allowed for ordinary paragraphs;
  -- CRLF and bare CR are normalized to LF before length/control validation.
  v_customer_notes := pg_catalog.btrim(pg_catalog.replace(
    pg_catalog.replace(p_customer_notes, E'\r\n', E'\n'), E'\r', E'\n'
  ));
  IF p_idempotency_key IS NULL
     OR p_request_hash IS NULL OR p_request_hash !~ '^[A-Za-z0-9_-]{43}$'
     OR p_dedupe_key IS NULL OR p_dedupe_key !~ '^[A-Za-z0-9_-]{43}$'
     OR p_dedupe_key IS DISTINCT FROM p_request_hash
     OR p_reference IS NULL OR p_reference !~ '^KMR-[0-9]{8}-[A-F0-9]{16}$'
     OR p_trip_id IS NULL OR p_trip_id !~ '^[a-z0-9-]{1,32}$'
     OR p_mode IS NULL OR p_mode NOT IN ('flight', 'road')
     OR p_travellers IS NULL OR p_travellers NOT BETWEEN 1 AND 10
     OR p_trip_updated_at IS NULL OR p_option_updated_at IS NULL
     OR p_customer_name IS NULL OR pg_catalog.length(pg_catalog.btrim(p_customer_name)) NOT BETWEEN 2 AND 80
     OR p_customer_name ~ '[[:cntrl:]]'
     OR p_customer_email IS NULL OR pg_catalog.length(pg_catalog.btrim(p_customer_email)) NOT BETWEEN 3 AND 120
     OR pg_catalog.btrim(p_customer_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR p_customer_phone IS NULL OR pg_catalog.length(pg_catalog.btrim(p_customer_phone)) NOT BETWEEN 7 AND 20
     OR pg_catalog.btrim(p_customer_phone) !~ '^\+?[0-9][0-9[:space:]().-]{5,19}$'
     OR p_customer_phone ~ '[[:cntrl:]]'
     OR pg_catalog.length(pg_catalog.regexp_replace(p_customer_phone, '[^0-9]', '', 'g')) < 7
      OR v_customer_notes IS NULL OR pg_catalog.length(v_customer_notes) > 400
      OR pg_catalog.translate(v_customer_notes, E'\n', '') ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid Kakande request';
  END IF;

  v_lock_id := pg_catalog.hashtextextended('kakande-request-idem:' || p_idempotency_key::text, 0);
  v_lock_dedupe := pg_catalog.hashtextextended('kakande-request-dedupe:' || p_dedupe_key, 0);
  IF v_lock_id <= v_lock_dedupe THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_id);
    IF v_lock_id <> v_lock_dedupe THEN PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_dedupe); END IF;
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_dedupe);
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_id);
  END IF;
  v_now := pg_catalog.clock_timestamp();

  SELECT * INTO v_idem FROM private.kakande_request_idempotency WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    SELECT * INTO v_existing FROM public.kakande_ministry_requests WHERE id = v_idem.request_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'idempotency mapping is invalid'; END IF;
    IF v_idem.request_hash IS DISTINCT FROM p_request_hash THEN
      RETURN jsonb_build_object('outcome', 'conflict');
    END IF;
    IF v_existing.user_id IS DISTINCT FROM p_user_id THEN
      RETURN jsonb_build_object('outcome', 'conflict');
    END IF;
    INSERT INTO private.kakande_request_dedupe_claims (dedupe_key, request_hash, request_id, expires_at)
    VALUES (p_dedupe_key, p_request_hash, v_existing.id, v_now + interval '15 minutes')
    ON CONFLICT (dedupe_key) DO UPDATE SET expires_at = EXCLUDED.expires_at
      WHERE private.kakande_request_dedupe_claims.request_hash = EXCLUDED.request_hash
        AND private.kakande_request_dedupe_claims.request_id = EXCLUDED.request_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'conflict'); END IF;
    RETURN jsonb_build_object('outcome', 'duplicate', 'reference', v_existing.reference,
      'snapshot', jsonb_build_object('tripId', v_existing.trip_id, 'optionId', v_existing.option_id,
        'month', v_existing.trip_month, 'mode', v_existing.travel_mode, 'travelDate', v_existing.travel_date,
        'pricePerTravellerZmw', v_existing.price_per_traveller_zmw, 'travellerCount', v_existing.traveller_count,
        'totalQuotedAmountZmw', v_existing.total_quoted_amount_zmw, 'currency', v_existing.currency_code));
  END IF;

  SELECT * INTO v_claim FROM private.kakande_request_dedupe_claims
    WHERE dedupe_key = p_dedupe_key AND expires_at > v_now;
  IF FOUND THEN
    IF v_claim.request_hash IS DISTINCT FROM p_request_hash THEN
      RETURN jsonb_build_object('outcome', 'conflict');
    END IF;
    SELECT * INTO v_existing FROM public.kakande_ministry_requests WHERE id = v_claim.request_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'deduplication mapping is invalid'; END IF;
    -- An unowned anonymous claim is not an identity proof. Same-key retries
    -- were handled above; a new-key anonymous dedupe match must not disclose it.
    IF p_user_id IS NULL OR v_existing.user_id IS DISTINCT FROM p_user_id THEN
      RETURN jsonb_build_object('outcome', 'conflict');
    END IF;
    UPDATE private.kakande_request_dedupe_claims SET expires_at = v_now + interval '15 minutes'
      WHERE dedupe_key = p_dedupe_key;
    RETURN jsonb_build_object('outcome', 'duplicate', 'reference', v_existing.reference,
      'snapshot', jsonb_build_object('tripId', v_existing.trip_id, 'optionId', v_existing.option_id,
        'month', v_existing.trip_month, 'mode', v_existing.travel_mode, 'travelDate', v_existing.travel_date,
        'pricePerTravellerZmw', v_existing.price_per_traveller_zmw, 'travellerCount', v_existing.traveller_count,
        'totalQuotedAmountZmw', v_existing.total_quoted_amount_zmw, 'currency', v_existing.currency_code));
  END IF;

  DELETE FROM private.kakande_request_dedupe_claims WHERE dedupe_key = p_dedupe_key AND expires_at <= v_now;
  WITH expired AS (
    SELECT dedupe_key FROM private.kakande_request_dedupe_claims
    WHERE expires_at <= v_now ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
  )
  DELETE FROM private.kakande_request_dedupe_claims AS claims USING expired WHERE claims.dedupe_key = expired.dedupe_key;

  -- Lock authoritative rows against concurrent staff changes. Price and date are
  -- selected here; none are accepted from the browser or Edge Function payload.
  SELECT trip.month_label, trip.is_published, opt.option_id, opt.departure_date,
         opt.price_per_traveller_zmw, opt.is_published, opt.availability,
         trip.updated_at, opt.updated_at
    INTO v_month, v_trip_published, v_option_id, v_departure_date, v_price,
         v_option_published, v_availability, v_trip_updated_at, v_option_timestamp
    FROM private.kakande_monthly_trips AS trip
    JOIN private.kakande_trip_options AS opt ON opt.trip_id = trip.trip_id
    WHERE trip.trip_id = p_trip_id AND opt.transport_mode = p_mode
    FOR SHARE OF trip, opt;
  IF NOT FOUND OR NOT v_trip_published OR NOT v_option_published
     OR v_availability NOT IN ('open', 'filling_fast') OR v_departure_date <= v_now::date THEN
    RETURN jsonb_build_object('outcome', 'trip_unavailable');
  END IF;
  IF p_trip_updated_at IS DISTINCT FROM v_trip_updated_at OR p_option_updated_at IS DISTINCT FROM v_option_timestamp THEN
    RETURN jsonb_build_object('outcome', 'trip_changed');
  END IF;
  v_total := v_price * p_travellers;
  IF v_price IS NULL OR v_price <= 0 OR v_price >= 10000000000 OR v_total <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid authoritative trip price';
  END IF;

  INSERT INTO public.kakande_ministry_requests (
    reference, trip_id, option_id, trip_month, travel_mode, travel_date,
    price_per_traveller_zmw, traveller_count, customer_name, customer_email,
    customer_phone, customer_notes, user_id
  ) VALUES (
    p_reference, p_trip_id, v_option_id, v_month, p_mode, v_departure_date,
    v_price, p_travellers, pg_catalog.btrim(p_customer_name),
    pg_catalog.lower(pg_catalog.btrim(p_customer_email)), pg_catalog.btrim(p_customer_phone),
    v_customer_notes, p_user_id
  ) RETURNING * INTO v_existing;

  INSERT INTO private.kakande_request_idempotency (idempotency_key, request_hash, request_id)
    VALUES (p_idempotency_key, p_request_hash, v_existing.id);
  INSERT INTO private.kakande_request_dedupe_claims (dedupe_key, request_hash, request_id, expires_at)
    VALUES (p_dedupe_key, p_request_hash, v_existing.id, v_now + interval '15 minutes');
  INSERT INTO public.kakande_request_events (request_id, actor_id, event_type, previous_status, new_status)
    VALUES (v_existing.id, auth.uid(), 'request_created', NULL, v_existing.status);

  RETURN jsonb_build_object('outcome', 'created', 'reference', v_existing.reference,
    'snapshot', jsonb_build_object('tripId', v_existing.trip_id, 'optionId', v_existing.option_id,
      'month', v_existing.trip_month, 'mode', v_existing.travel_mode, 'travelDate', v_existing.travel_date,
      'pricePerTravellerZmw', v_existing.price_per_traveller_zmw, 'travellerCount', v_existing.traveller_count,
      'totalQuotedAmountZmw', v_existing.total_quoted_amount_zmw, 'currency', v_existing.currency_code));
END;
$$;

ALTER FUNCTION private.create_kakande_ministry_request_once_core(uuid, text, text, text, text, text, integer, timestamptz, timestamptz, text, text, text, text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.create_kakande_ministry_request_once_core(uuid, text, text, text, text, text, integer, timestamptz, timestamptz, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_kakande_ministry_request_once(

  p_idempotency_key uuid,
  p_request_hash text,
  p_dedupe_key text,
  p_reference text,
  p_trip_id text,
  p_mode text,
  p_travellers integer,
  p_trip_updated_at timestamptz,
  p_option_updated_at timestamptz,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_notes text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
  SELECT private.create_kakande_ministry_request_once_core($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NULL::uuid);
$$;
ALTER FUNCTION public.create_kakande_ministry_request_once(uuid, text, text, text, text, text, integer, timestamptz, timestamptz, text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_kakande_ministry_request_once(uuid, text, text, text, text, text, integer, timestamptz, timestamptz, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_kakande_ministry_request_once(uuid, text, text, text, text, text, integer, timestamptz, timestamptz, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.create_kakande_ministry_request_once_for_customer(
  p_idempotency_key uuid,
  p_request_hash text,
  p_dedupe_key text,
  p_reference text,
  p_trip_id text,
  p_mode text,
  p_travellers integer,
  p_trip_updated_at timestamptz,
  p_option_updated_at timestamptz,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_notes text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
  SELECT private.create_kakande_ministry_request_once_core($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14);
$$;
ALTER FUNCTION public.create_kakande_ministry_request_once_for_customer(uuid, text, text, text, text, text, integer, timestamptz, timestamptz, text, text, text, text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_kakande_ministry_request_once_for_customer(uuid, text, text, text, text, text, integer, timestamptz, timestamptz, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_kakande_ministry_request_once_for_customer(uuid, text, text, text, text, text, integer, timestamptz, timestamptz, text, text, text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.create_flight_quote_request_once_for_customer(uuid, text, text, text, text, text, date, date, text, integer, integer, integer, text, text, text, text, text, uuid) IS
  'Service-role-only; p_user_id must come from a server-verified Supabase Auth identity. Owner-mismatched replay returns conflict.';
COMMENT ON FUNCTION public.create_kakande_ministry_request_once_for_customer(uuid, text, text, text, text, text, integer, timestamptz, timestamptz, text, text, text, text, uuid) IS
  'Service-role-only; p_user_id must come from a server-verified Supabase Auth identity. Owner-mismatched replay returns conflict.';
