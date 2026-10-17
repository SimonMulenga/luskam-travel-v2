-- Option A flight quotation requests: no automated airline or payment workflow.
-- Customer details and internal notes are visible only to assigned staff.

CREATE TABLE public.flight_quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  idempotency_key uuid NOT NULL UNIQUE,
  request_hash text NOT NULL CHECK (request_hash ~ '^[A-Za-z0-9_-]{43}$'),
  dedupe_key text NOT NULL UNIQUE CHECK (dedupe_key ~ '^[A-Za-z0-9_-]{43}$'),
  origin text NOT NULL CHECK (origin ~ '^[A-Z]{3}$'),
  destination text NOT NULL CHECK (destination ~ '^[A-Z]{3}$' AND destination <> origin),
  departure_date date NOT NULL,
  return_date date,
  trip_type text NOT NULL CHECK (trip_type IN ('oneway', 'return')),
  adults integer NOT NULL CHECK (adults BETWEEN 1 AND 9),
  children integer NOT NULL CHECK (children BETWEEN 0 AND 8),
  infants integer NOT NULL CHECK (infants BETWEEN 0 AND 8),
  cabin_class text NOT NULL CHECK (cabin_class IN ('economy', 'premium_economy', 'business', 'first')),
  customer_name text NOT NULL CHECK (length(customer_name) BETWEEN 2 AND 120),
  customer_email text NOT NULL CHECK (length(customer_email) BETWEEN 3 AND 254),
  customer_phone text NOT NULL CHECK (length(customer_phone) BETWEEN 7 AND 32),
  special_requests text NOT NULL DEFAULT '' CHECK (length(special_requests) <= 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'quoted', 'confirmed', 'closed')),
  internal_notes text NOT NULL DEFAULT '' CHECK (length(internal_notes) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flight_quote_requests_trip_dates_check CHECK (
    (trip_type = 'oneway' AND return_date IS NULL)
    OR (trip_type = 'return' AND return_date IS NOT NULL AND return_date >= departure_date)
  ),
  CONSTRAINT flight_quote_requests_passenger_total_check CHECK (adults + children + infants <= 17),
  CONSTRAINT flight_quote_requests_infants_check CHECK (infants <= adults)
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
