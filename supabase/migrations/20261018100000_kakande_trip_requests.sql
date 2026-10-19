-- Phase 10 increment 1: separate, server-priced Kakande monthly group travel requests.
-- Historical June-September 2026 prices are retained as closed, unpublished records.
-- No Ministry authorization, ticketing, payment, or reservation is implied.

CREATE TABLE private.kakande_monthly_trips (
  trip_id text PRIMARY KEY CHECK (trip_id ~ '^[a-z0-9-]{1,32}$'),
  month_label text NOT NULL CHECK (pg_catalog.length(month_label) BETWEEN 1 AND 40),
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE TABLE private.kakande_trip_options (
  option_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id text NOT NULL REFERENCES private.kakande_monthly_trips(trip_id) ON DELETE RESTRICT,
  transport_mode text NOT NULL CHECK (transport_mode IN ('flight', 'road')),
  departure_date date NOT NULL,
  price_per_traveller_zmw numeric(12,2) NOT NULL
    CHECK (price_per_traveller_zmw > 0 AND price_per_traveller_zmw < 10000000000),
  is_published boolean NOT NULL DEFAULT false,
  availability text NOT NULL CHECK (availability IN ('open', 'filling_fast', 'fully_booked', 'closed')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (trip_id, transport_mode),
  UNIQUE (option_id, trip_id, transport_mode)
);

ALTER TABLE private.kakande_monthly_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.kakande_trip_options ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.kakande_monthly_trips FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.kakande_trip_options FROM PUBLIC, anon, authenticated, service_role;

-- Preserve only the supplied historical data. These dates have elapsed and
-- these entries are closed/unpublished; no upcoming prices or dates are invented.
INSERT INTO private.kakande_monthly_trips (trip_id, month_label, is_published) VALUES
  ('jun-2026', 'June 2026', false),
  ('jul-2026', 'July 2026', false),
  ('aug-2026', 'August 2026', false),
  ('sep-2026', 'September 2026', false);

INSERT INTO private.kakande_trip_options
  (trip_id, transport_mode, departure_date, price_per_traveller_zmw, is_published, availability)
VALUES
  ('jun-2026', 'flight', DATE '2026-06-10', 10950.00, false, 'closed'),
  ('jun-2026', 'road',   DATE '2026-06-08',  4500.00, false, 'closed'),
  ('jul-2026', 'flight', DATE '2026-07-10', 11200.00, false, 'closed'),
  ('jul-2026', 'road',   DATE '2026-07-08',  4700.00, false, 'closed'),
  ('aug-2026', 'flight', DATE '2026-08-10', 11200.00, false, 'closed'),
  ('aug-2026', 'road',   DATE '2026-08-08',  4700.00, false, 'closed'),
  ('sep-2026', 'flight', DATE '2026-09-10', 11500.00, false, 'closed'),
  ('sep-2026', 'road',   DATE '2026-09-08',  4900.00, false, 'closed');

CREATE TABLE public.kakande_ministry_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  trip_id text NOT NULL REFERENCES private.kakande_monthly_trips(trip_id) ON DELETE RESTRICT,
  option_id uuid NOT NULL,
  trip_month text NOT NULL,
  travel_mode text NOT NULL,
  travel_date date NOT NULL,
  price_per_traveller_zmw numeric(12,2) NOT NULL,
  traveller_count integer NOT NULL,
  total_quoted_amount_zmw numeric(14,2) GENERATED ALWAYS AS
    (price_per_traveller_zmw * traveller_count) STORED,
  currency_code text NOT NULL DEFAULT 'ZMW' CHECK (currency_code = 'ZMW'),
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text NOT NULL,
  customer_notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  internal_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT kakande_requests_option_snapshot_fk FOREIGN KEY (option_id, trip_id, travel_mode)
    REFERENCES private.kakande_trip_options(option_id, trip_id, transport_mode) ON DELETE RESTRICT,
  CONSTRAINT kakande_requests_reference_format CHECK (reference ~ '^KMR-[0-9]{8}-[A-F0-9]{16}$'),
  CONSTRAINT kakande_requests_trip_id_format CHECK (trip_id ~ '^[a-z0-9-]{1,32}$'),
  CONSTRAINT kakande_requests_mode_check CHECK (travel_mode IN ('flight', 'road')),
  CONSTRAINT kakande_requests_date_check CHECK (travel_date >= DATE '2000-01-01'),
  CONSTRAINT kakande_requests_price_check CHECK
    (price_per_traveller_zmw > 0 AND price_per_traveller_zmw < 10000000000),
  CONSTRAINT kakande_requests_traveller_count_check CHECK (traveller_count BETWEEN 1 AND 10),
  CONSTRAINT kakande_requests_name_length_check CHECK (pg_catalog.length(customer_name) BETWEEN 2 AND 80),
  CONSTRAINT kakande_requests_email_length_check CHECK (pg_catalog.length(customer_email) BETWEEN 3 AND 120),
  CONSTRAINT kakande_requests_phone_length_check CHECK (pg_catalog.length(customer_phone) BETWEEN 7 AND 20),
  CONSTRAINT kakande_requests_customer_notes_length_check CHECK (pg_catalog.length(customer_notes) <= 400),
  CONSTRAINT kakande_requests_status_check CHECK (status IN ('pending', 'in_progress', 'approved', 'rejected')),
  CONSTRAINT kakande_requests_internal_notes_length_check CHECK (pg_catalog.length(internal_notes) <= 5000)
);

CREATE INDEX kakande_requests_created_at_idx ON public.kakande_ministry_requests (created_at DESC);
CREATE INDEX kakande_requests_status_created_at_idx ON public.kakande_ministry_requests (status, created_at DESC);
CREATE INDEX kakande_requests_trip_date_idx ON public.kakande_ministry_requests (trip_id, travel_date DESC);

-- The price, trip, mode, date, traveller-count and computed-total snapshot cannot
-- be changed by authenticated users, service_role, or any application RPC.
CREATE OR REPLACE FUNCTION private.prevent_kakande_snapshot_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF ROW(OLD.trip_id, OLD.option_id, OLD.trip_month, OLD.travel_mode, OLD.travel_date,
         OLD.price_per_traveller_zmw, OLD.traveller_count, OLD.total_quoted_amount_zmw, OLD.currency_code)
     IS DISTINCT FROM
     ROW(NEW.trip_id, NEW.option_id, NEW.trip_month, NEW.travel_mode, NEW.travel_date,
         NEW.price_per_traveller_zmw, NEW.traveller_count, NEW.total_quoted_amount_zmw, NEW.currency_code) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Kakande request price and trip snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.prevent_kakande_snapshot_update() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER kakande_requests_snapshot_immutable
  BEFORE UPDATE ON public.kakande_ministry_requests
  FOR EACH ROW EXECUTE FUNCTION private.prevent_kakande_snapshot_update();
CREATE TRIGGER kakande_requests_set_updated_at
  BEFORE UPDATE ON public.kakande_ministry_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.kakande_request_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.kakande_ministry_requests(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('request_created', 'status_changed', 'notes_changed', 'status_and_notes_changed')),
  previous_status text,
  new_status text,
  previous_internal_notes text,
  new_internal_notes text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT kakande_event_previous_status_check CHECK
    (previous_status IS NULL OR previous_status IN ('pending', 'in_progress', 'approved', 'rejected')),
  CONSTRAINT kakande_event_new_status_check CHECK
    (new_status IS NULL OR new_status IN ('pending', 'in_progress', 'approved', 'rejected'))
);
CREATE INDEX kakande_request_events_request_created_idx ON public.kakande_request_events (request_id, created_at, event_id);

CREATE TABLE private.kakande_request_idempotency (
  idempotency_key uuid PRIMARY KEY,
  request_hash text NOT NULL CHECK (request_hash ~ '^[A-Za-z0-9_-]{43}$'),
  request_id uuid NOT NULL REFERENCES public.kakande_ministry_requests(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE TABLE private.kakande_request_dedupe_claims (
  dedupe_key text PRIMARY KEY CHECK (dedupe_key ~ '^[A-Za-z0-9_-]{43}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[A-Za-z0-9_-]{43}$'),
  request_id uuid NOT NULL REFERENCES public.kakande_ministry_requests(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
ALTER TABLE private.kakande_request_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.kakande_request_dedupe_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.kakande_request_idempotency FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE private.kakande_request_dedupe_claims FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX kakande_request_dedupe_expiry_idx ON private.kakande_request_dedupe_claims (expires_at);

CREATE TABLE private.kakande_trip_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('trip_created', 'trip_updated')),
  previous_state jsonb,
  new_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX kakande_trip_events_trip_created_idx ON private.kakande_trip_events (trip_id, created_at, event_id);
ALTER TABLE private.kakande_trip_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.kakande_trip_events FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.kakande_ministry_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kakande_request_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kakande_ministry_requests FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.kakande_request_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.kakande_ministry_requests, public.kakande_request_events TO authenticated;

CREATE POLICY "kakande staff read requests" ON public.kakande_ministry_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'agent'::public.app_role));
CREATE POLICY "kakande staff read request events" ON public.kakande_request_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'agent'::public.app_role));

CREATE OR REPLACE FUNCTION public.get_kakande_trip_option(p_trip_id text, p_mode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
DECLARE
  v_trip private.kakande_monthly_trips%ROWTYPE;
  v_option private.kakande_trip_options%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;
  IF p_trip_id IS NULL OR p_trip_id !~ '^[a-z0-9-]{1,32}$' OR p_mode IS NULL OR p_mode NOT IN ('flight', 'road') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid trip option';
  END IF;
  SELECT * INTO v_trip FROM private.kakande_monthly_trips WHERE trip_id = p_trip_id;
  SELECT * INTO v_option FROM private.kakande_trip_options
    WHERE trip_id = p_trip_id AND transport_mode = p_mode;
  IF NOT FOUND OR v_trip.trip_id IS NULL THEN
    RETURN jsonb_build_object('known', false, 'available', false);
  END IF;
  RETURN jsonb_build_object(
    'known', true,
    'available', v_trip.is_published AND v_option.is_published
      AND v_option.availability IN ('open', 'filling_fast') AND v_option.departure_date > CURRENT_DATE,
    'trip_id', v_trip.trip_id,
    'option_id', v_option.option_id,
    'month', v_trip.month_label,
    'mode', v_option.transport_mode,
    'travel_date', v_option.departure_date,
    'price_per_traveller_zmw', v_option.price_per_traveller_zmw,
    'currency', 'ZMW',
    'trip_published', v_trip.is_published,
    'option_published', v_option.is_published,
    'availability', v_option.availability,
    'trip_updated_at', v_trip.updated_at,
    'option_updated_at', v_option.updated_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_kakande_trip_option(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_kakande_trip_option(text, text) TO service_role;

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
    INSERT INTO private.kakande_request_dedupe_claims (dedupe_key, request_hash, request_id, expires_at)
    VALUES (p_dedupe_key, p_request_hash, v_existing.id, v_now + interval '15 minutes')
    ON CONFLICT (dedupe_key) DO UPDATE SET expires_at = EXCLUDED.expires_at
      WHERE private.kakande_request_dedupe_claims.request_hash = EXCLUDED.request_hash;
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
    customer_phone, customer_notes
  ) VALUES (
    p_reference, p_trip_id, v_option_id, v_month, p_mode, v_departure_date,
     v_price, p_travellers, pg_catalog.btrim(p_customer_name),
    pg_catalog.lower(pg_catalog.btrim(p_customer_email)), pg_catalog.btrim(p_customer_phone),
     v_customer_notes
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
REVOKE ALL ON FUNCTION public.create_kakande_ministry_request_once(
  uuid, text, text, text, text, text, integer, timestamptz, timestamptz, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_kakande_ministry_request_once(
  uuid, text, text, text, text, text, integer, timestamptz, timestamptz, text, text, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.update_kakande_ministry_request(
  p_request_id uuid,
  p_status text,
  p_internal_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean;
  v_is_agent boolean;
  v_request public.kakande_ministry_requests%ROWTYPE;
  v_old_status text;
  v_old_internal_notes text;
  v_event_type text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authenticated staff required';
  END IF;
  v_is_admin := public.has_role(v_actor, 'admin'::public.app_role);
  v_is_agent := public.has_role(v_actor, 'agent'::public.app_role);
  IF NOT v_is_admin AND NOT v_is_agent THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'staff role required';
  END IF;
  IF p_request_id IS NULL OR p_status IS NULL OR p_status NOT IN ('pending', 'in_progress', 'approved', 'rejected')
     OR p_internal_notes IS NULL OR pg_catalog.length(p_internal_notes) > 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid request update';
  END IF;
  SELECT * INTO v_request FROM public.kakande_ministry_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  IF v_is_agent AND NOT v_is_admin
     AND (p_status <> 'in_progress' OR v_request.status NOT IN ('pending', 'in_progress')) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'agents may only move pending requests to in progress';
  END IF;
  IF v_request.status IS NOT DISTINCT FROM p_status
     AND v_request.internal_notes IS NOT DISTINCT FROM p_internal_notes THEN
    RETURN jsonb_build_object('outcome', 'unchanged', 'reference', v_request.reference);
  END IF;
  v_old_status := v_request.status;
  v_old_internal_notes := v_request.internal_notes;
  IF v_request.status IS DISTINCT FROM p_status AND v_request.internal_notes IS DISTINCT FROM p_internal_notes THEN
    v_event_type := 'status_and_notes_changed';
  ELSIF v_request.status IS DISTINCT FROM p_status THEN
    v_event_type := 'status_changed';
  ELSE
    v_event_type := 'notes_changed';
  END IF;
  UPDATE public.kakande_ministry_requests
    SET status = p_status, internal_notes = p_internal_notes
    WHERE id = v_request.id
    RETURNING * INTO v_request;
  INSERT INTO public.kakande_request_events (
    request_id, actor_id, event_type, previous_status, new_status,
    previous_internal_notes, new_internal_notes
  ) VALUES (
    v_request.id, v_actor, v_event_type,
    v_old_status, v_request.status,
    v_old_internal_notes, v_request.internal_notes
  );
  RETURN jsonb_build_object('outcome', 'updated', 'reference', v_request.reference, 'status', v_request.status);
END;
$$;
REVOKE ALL ON FUNCTION public.update_kakande_ministry_request(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_kakande_ministry_request(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_kakande_monthly_trip(
  p_trip_id text,
  p_month_label text,
  p_trip_published boolean,
  p_flight_date date,
  p_flight_price_zmw numeric,
  p_flight_published boolean,
  p_flight_availability text,
  p_road_date date,
  p_road_price_zmw numeric,
  p_road_published boolean,
  p_road_availability text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_existing boolean;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR v_actor IS NULL
     OR NOT public.has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'administrator role required';
  END IF;
  IF p_trip_id IS NULL OR p_trip_id !~ '^[a-z0-9-]{1,32}$'
     OR p_month_label IS NULL OR pg_catalog.length(pg_catalog.btrim(p_month_label)) NOT BETWEEN 1 AND 40
     OR p_trip_published IS NULL OR p_flight_date IS NULL OR p_road_date IS NULL
     OR p_flight_availability IS NULL OR p_road_availability IS NULL
     OR p_flight_price_zmw IS NULL OR p_flight_price_zmw <= 0 OR p_flight_price_zmw >= 10000000000
     OR p_flight_price_zmw <> pg_catalog.round(p_flight_price_zmw, 2)
     OR p_road_price_zmw IS NULL OR p_road_price_zmw <= 0 OR p_road_price_zmw >= 10000000000
     OR p_road_price_zmw <> pg_catalog.round(p_road_price_zmw, 2)
     OR p_flight_published IS NULL OR p_road_published IS NULL
     OR p_flight_availability NOT IN ('open', 'filling_fast', 'fully_booked', 'closed')
     OR p_road_availability NOT IN ('open', 'filling_fast', 'fully_booked', 'closed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid Kakande trip';
  END IF;
  IF p_trip_published AND ((p_flight_published AND p_flight_availability IN ('open', 'filling_fast') AND p_flight_date <= CURRENT_DATE)
      OR (p_road_published AND p_road_availability IN ('open', 'filling_fast') AND p_road_date <= CURRENT_DATE)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'published available options must have future departure dates';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kakande-trip-management:' || p_trip_id, 0));
  SELECT EXISTS (SELECT 1 FROM private.kakande_monthly_trips WHERE trip_id = p_trip_id) INTO v_existing;
  IF v_existing THEN
    IF EXISTS (
      SELECT 1 FROM private.kakande_monthly_trips AS trip
      JOIN private.kakande_trip_options AS opt USING (trip_id)
      WHERE trip.trip_id = p_trip_id AND opt.departure_date <= CURRENT_DATE
        AND ((trip.month_label IS DISTINCT FROM pg_catalog.btrim(p_month_label))
          OR (trip.is_published IS DISTINCT FROM p_trip_published)
          OR (opt.transport_mode = 'flight' AND
            (opt.departure_date IS DISTINCT FROM p_flight_date OR opt.price_per_traveller_zmw IS DISTINCT FROM p_flight_price_zmw
             OR opt.is_published IS DISTINCT FROM p_flight_published OR opt.availability IS DISTINCT FROM p_flight_availability))
          OR (opt.transport_mode = 'road' AND
            (opt.departure_date IS DISTINCT FROM p_road_date OR opt.price_per_traveller_zmw IS DISTINCT FROM p_road_price_zmw
             OR opt.is_published IS DISTINCT FROM p_road_published OR opt.availability IS DISTINCT FROM p_road_availability)))
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'historical Kakande trip options are immutable';
    END IF;
    SELECT jsonb_build_object('trip', to_jsonb(trip), 'options',
      coalesce(jsonb_agg(to_jsonb(opt) ORDER BY opt.transport_mode), '[]'::jsonb))
      INTO v_before FROM private.kakande_monthly_trips AS trip
      LEFT JOIN private.kakande_trip_options AS opt USING (trip_id)
      WHERE trip.trip_id = p_trip_id GROUP BY trip.trip_id;
  END IF;
  INSERT INTO private.kakande_monthly_trips (trip_id, month_label, is_published, updated_at)
    VALUES (p_trip_id, pg_catalog.btrim(p_month_label), p_trip_published, pg_catalog.clock_timestamp())
    ON CONFLICT (trip_id) DO UPDATE SET month_label = EXCLUDED.month_label,
      is_published = EXCLUDED.is_published, updated_at = pg_catalog.clock_timestamp();
  INSERT INTO private.kakande_trip_options
    (trip_id, transport_mode, departure_date, price_per_traveller_zmw, is_published, availability, updated_at)
  VALUES
    (p_trip_id, 'flight', p_flight_date, p_flight_price_zmw, p_flight_published, p_flight_availability, pg_catalog.clock_timestamp()),
    (p_trip_id, 'road', p_road_date, p_road_price_zmw, p_road_published, p_road_availability, pg_catalog.clock_timestamp())
  ON CONFLICT (trip_id, transport_mode) DO UPDATE SET departure_date = EXCLUDED.departure_date,
    price_per_traveller_zmw = EXCLUDED.price_per_traveller_zmw, is_published = EXCLUDED.is_published,
    availability = EXCLUDED.availability, updated_at = pg_catalog.clock_timestamp();
  SELECT jsonb_build_object('trip', to_jsonb(trip), 'options',
    coalesce(jsonb_agg(to_jsonb(opt) ORDER BY opt.transport_mode), '[]'::jsonb))
    INTO v_after FROM private.kakande_monthly_trips AS trip
    LEFT JOIN private.kakande_trip_options AS opt USING (trip_id)
    WHERE trip.trip_id = p_trip_id GROUP BY trip.trip_id;
  INSERT INTO private.kakande_trip_events (trip_id, actor_id, event_type, previous_state, new_state)
    VALUES (p_trip_id, v_actor, CASE WHEN v_existing THEN 'trip_updated' ELSE 'trip_created' END, v_before, v_after);
  RETURN jsonb_build_object('outcome', CASE WHEN v_existing THEN 'updated' ELSE 'created' END, 'trip_id', p_trip_id);
END;
$$;
REVOKE ALL ON FUNCTION public.save_kakande_monthly_trip(text, text, boolean, date, numeric, boolean, text, date, numeric, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_kakande_monthly_trip(text, text, boolean, date, numeric, boolean, text, date, numeric, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.read_kakande_trip_events(p_trip_id text)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL
     OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'administrator role required';
  END IF;
  RETURN QUERY SELECT pg_catalog.to_jsonb(event_row) FROM private.kakande_trip_events AS event_row
    WHERE event_row.trip_id = p_trip_id ORDER BY event_row.created_at, event_row.event_id;
END;
$$;
REVOKE ALL ON FUNCTION public.read_kakande_trip_events(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_kakande_trip_events(text) TO authenticated;

COMMENT ON TABLE public.kakande_ministry_requests IS
  'Anonymous Kakande monthly group travel requests with immutable database-priced trip snapshots. Luskam workflow status is internal and does not represent Kakande Ministries approval or create a reservation.';
COMMENT ON TABLE public.kakande_request_events IS
  'Staff-only audit history for Kakande request creation, status and internal-note changes; note history is confidential staff data.';
COMMENT ON FUNCTION public.create_kakande_ministry_request_once(
  uuid, text, text, text, text, text, integer, timestamptz, timestamptz, text, text, text, text
) IS 'Service-role-only atomic idempotency and rolling 15-minute duplicate prevention. Prices and dates are read from locked authoritative trip-option rows.';
