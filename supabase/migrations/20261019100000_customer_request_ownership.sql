-- Phase 4: add optional authenticated-customer ownership and safe read RPCs.
-- Existing anonymous requests remain unowned. No contact-data backfill is performed.

ALTER TABLE public.flight_quote_requests
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.kakande_ministry_requests
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX flight_quote_requests_customer_created_idx
  ON public.flight_quote_requests (user_id, created_at DESC, id DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX kakande_requests_customer_created_idx
  ON public.kakande_ministry_requests (user_id, created_at DESC, id DESC)
  WHERE user_id IS NOT NULL;

-- Ownership is assigned only when a trusted creation RPC inserts a request.
-- It cannot be reassigned later. Clearing ownership is allowed only as the
-- referential action of deleting the owning Auth user.
CREATE OR REPLACE FUNCTION private.prevent_customer_request_owner_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF NEW.user_id IS NULL
       AND OLD.user_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM auth.users AS auth_user WHERE auth_user.id = OLD.user_id
       ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'request ownership cannot be reassigned';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION private.prevent_customer_request_owner_reassignment() OWNER TO postgres;

REVOKE ALL ON FUNCTION private.prevent_customer_request_owner_reassignment()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER flight_quote_requests_owner_immutable
  BEFORE UPDATE OF user_id ON public.flight_quote_requests
  FOR EACH ROW EXECUTE FUNCTION private.prevent_customer_request_owner_reassignment();

CREATE TRIGGER kakande_requests_owner_immutable
  BEFORE UPDATE OF user_id ON public.kakande_ministry_requests
  FOR EACH ROW EXECUTE FUNCTION private.prevent_customer_request_owner_reassignment();

-- Do not add customer SELECT policies to either request table. Both tables
-- contain staff-only fields and retain their existing staff RLS policies.
CREATE OR REPLACE FUNCTION public.my_flight_quote_requests()
RETURNS TABLE (
  reference text,
  created_at timestamptz,
  origin text,
  destination text,
  departure_date date,
  return_date date,
  trip_type text,
  adults integer,
  children integer,
  infants integer,
  cabin_class text,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, auth, public
SET row_security = off
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authenticated customer required';
  END IF;

  RETURN QUERY
    SELECT request.reference, request.created_at, request.origin, request.destination,
           request.departure_date, request.return_date, request.trip_type,
           request.adults, request.children, request.infants, request.cabin_class,
           request.status
    FROM public.flight_quote_requests AS request
    WHERE request.user_id = v_user_id
    ORDER BY request.created_at DESC, request.id DESC;
END;
$$;

ALTER FUNCTION public.my_flight_quote_requests() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.my_flight_quote_requests() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_flight_quote_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_kakande_ministry_requests()
RETURNS TABLE (
  reference text,
  created_at timestamptz,
  trip_month text,
  travel_mode text,
  travel_date date,
  price_per_traveller_zmw numeric,
  traveller_count integer,
  total_quoted_amount_zmw numeric,
  currency_code text,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, auth, public
SET row_security = off
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authenticated customer required';
  END IF;

  RETURN QUERY
    SELECT request.reference, request.created_at, request.trip_month,
           request.travel_mode, request.travel_date,
           request.price_per_traveller_zmw, request.traveller_count,
           request.total_quoted_amount_zmw, request.currency_code, request.status
    FROM public.kakande_ministry_requests AS request
    WHERE request.user_id = v_user_id
    ORDER BY request.created_at DESC, request.id DESC;
END;
$$;

ALTER FUNCTION public.my_kakande_ministry_requests() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.my_kakande_ministry_requests() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_kakande_ministry_requests() TO authenticated;

COMMENT ON COLUMN public.flight_quote_requests.user_id IS
  'Optional Auth owner. Existing anonymous requests remain NULL; only a future trusted intake path may set this on insert.';
COMMENT ON COLUMN public.kakande_ministry_requests.user_id IS
  'Optional Auth owner. Existing anonymous requests remain NULL; only a future trusted intake path may set this on insert.';
COMMENT ON FUNCTION public.my_flight_quote_requests() IS
  'Returns only the authenticated caller''s flight quote request itinerary and workflow status; excludes contact details and staff notes.';
COMMENT ON FUNCTION public.my_kakande_ministry_requests() IS
  'Returns only the authenticated caller’s Kakande request travel snapshot and Luskam workflow status; excludes contact details, staff notes, and audit events.';

-- Preserve the currently deployed anonymous intake contracts and their
-- service-role-only execution boundary. Existing inserts omit user_id and
-- therefore continue to create unowned (NULL owner) requests until a later,
-- separately deployed trusted intake change supplies a verified Auth UID.
DO $$
BEGIN
  IF to_regprocedure('public.create_flight_quote_request_once(uuid,text,text,text,text,text,date,date,text,integer,integer,integer,text,text,text,text,text)') IS NULL
     OR to_regprocedure('public.create_kakande_ministry_request_once(uuid,text,text,text,text,text,integer,timestamptz,timestamptz,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Expected existing flight and Kakande request creation RPCs';
  END IF;
  IF has_function_privilege('anon', 'public.create_flight_quote_request_once(uuid,text,text,text,text,text,date,date,text,integer,integer,integer,text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_flight_quote_request_once(uuid,text,text,text,text,text,date,date,text,integer,integer,integer,text,text,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.create_flight_quote_request_once(uuid,text,text,text,text,text,date,date,text,integer,integer,integer,text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.create_kakande_ministry_request_once(uuid,text,text,text,text,text,integer,timestamptz,timestamptz,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_kakande_ministry_request_once(uuid,text,text,text,text,text,integer,timestamptz,timestamptz,text,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.create_kakande_ministry_request_once(uuid,text,text,text,text,text,integer,timestamptz,timestamptz,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Existing request RPC execution grants differ from the service-role-only contract';
  END IF;
END;
$$;
