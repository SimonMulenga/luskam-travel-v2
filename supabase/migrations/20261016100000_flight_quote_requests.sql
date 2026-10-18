-- Option A flight quotation requests: no automated airline or payment workflow.
-- Customer details and internal notes are visible only to assigned staff.

CREATE TABLE public.flight_quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  idempotency_key uuid NOT NULL UNIQUE,
  request_hash text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  origin text NOT NULL,
  destination text NOT NULL,
  departure_date date NOT NULL,
  return_date date,
  trip_type text NOT NULL,
  adults integer NOT NULL,
  children integer NOT NULL,
  infants integer NOT NULL,
  cabin_class text NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text NOT NULL,
  special_requests text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  internal_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flight_quote_requests_request_hash_format_check CHECK (request_hash ~ '^[A-Za-z0-9_-]{43}$'),
  CONSTRAINT flight_quote_requests_dedupe_key_format_check CHECK (dedupe_key ~ '^[A-Za-z0-9_-]{43}$'),
  CONSTRAINT flight_quote_requests_origin_iata_check CHECK (origin ~ '^[A-Z]{3}$'),
  CONSTRAINT flight_quote_requests_destination_iata_check CHECK (destination ~ '^[A-Z]{3}$'),
  CONSTRAINT flight_quote_requests_distinct_airports_check CHECK (destination <> origin),
  CONSTRAINT flight_quote_requests_trip_type_check CHECK (trip_type IN ('oneway', 'return')),
  CONSTRAINT flight_quote_requests_adults_range_check CHECK (adults BETWEEN 1 AND 9),
  CONSTRAINT flight_quote_requests_children_range_check CHECK (children BETWEEN 0 AND 8),
  CONSTRAINT flight_quote_requests_infants_range_check CHECK (infants BETWEEN 0 AND 8),
  CONSTRAINT flight_quote_requests_cabin_class_check CHECK (cabin_class IN ('economy', 'premium_economy', 'business', 'first')),
  CONSTRAINT flight_quote_requests_customer_name_length_check CHECK (length(customer_name) BETWEEN 2 AND 120),
  CONSTRAINT flight_quote_requests_customer_email_length_check CHECK (length(customer_email) BETWEEN 3 AND 254),
  CONSTRAINT flight_quote_requests_customer_phone_length_check CHECK (length(customer_phone) BETWEEN 7 AND 32),
  CONSTRAINT flight_quote_requests_special_requests_length_check CHECK (length(special_requests) <= 1000),
  CONSTRAINT flight_quote_requests_status_check CHECK (status IN ('pending', 'reviewing', 'quoted', 'confirmed', 'closed')),
  CONSTRAINT flight_quote_requests_internal_notes_length_check CHECK (length(internal_notes) <= 5000),
  CONSTRAINT flight_quote_requests_trip_dates_check CHECK (
    (trip_type = 'oneway' AND return_date IS NULL)
    OR (trip_type = 'return' AND return_date IS NOT NULL AND return_date >= departure_date)
  ),
  CONSTRAINT flight_quote_requests_passenger_total_check CHECK (adults + children + infants <= 17),
  CONSTRAINT flight_quote_requests_infants_not_exceed_adults_check CHECK (infants <= adults)
);

CREATE INDEX flight_quote_requests_created_at_idx ON public.flight_quote_requests (created_at DESC);
CREATE INDEX flight_quote_requests_status_created_at_idx ON public.flight_quote_requests (status, created_at DESC);

ALTER TABLE public.flight_quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_quote_requests FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.flight_quote_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.flight_quote_requests TO authenticated;
GRANT UPDATE (status, internal_notes) ON TABLE public.flight_quote_requests TO authenticated;
GRANT ALL ON TABLE public.flight_quote_requests TO service_role;

CREATE POLICY "flight quote staff read" ON public.flight_quote_requests
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'agent'::public.app_role)
  );

CREATE POLICY "flight quote staff update" ON public.flight_quote_requests
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'agent'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'agent'::public.app_role)
  );

CREATE TRIGGER flight_quote_requests_set_updated_at
  BEFORE UPDATE ON public.flight_quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.flight_quote_requests IS
  'Anonymous manual flight quotation requests. Only the trusted Edge Function inserts; admin and agent roles can read and update workflow status/internal notes. A confirmed request is not an airline reservation or issued ticket.';
