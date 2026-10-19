-- Public Kakande trip catalogue. Exposes only currently selectable,
-- customer-facing option data; private trip tables remain inaccessible.
CREATE FUNCTION public.list_public_kakande_trip_options()
RETURNS TABLE (
  trip_id text,
  option_id uuid,
  month_label text,
  transport_mode text,
  departure_date date,
  price_per_traveller_zmw numeric,
  availability text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT
    trip.trip_id,
    option.option_id,
    trip.month_label,
    option.transport_mode,
    option.departure_date,
    option.price_per_traveller_zmw,
    option.availability
  FROM private.kakande_monthly_trips AS trip
  JOIN private.kakande_trip_options AS option USING (trip_id)
  WHERE trip.is_published
    AND option.is_published
    AND trip.month_label ~ '^(January|February|March|April|May|June|July|August|September|October|November|December) [0-9]{4}$'
    AND option.availability IN ('open', 'filling_fast')
    AND option.departure_date > CURRENT_DATE
  ORDER BY option.departure_date, trip.trip_id, option.transport_mode;
$$;

REVOKE ALL ON FUNCTION public.list_public_kakande_trip_options()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_kakande_trip_options()
  TO anon, authenticated;

COMMENT ON FUNCTION public.list_public_kakande_trip_options() IS
  'Public read-only Kakande catalogue of published future open or filling-fast travel options. Excludes private trip metadata, requests, notes, audit events, closed, fully booked, unpublished, and expired options.';
