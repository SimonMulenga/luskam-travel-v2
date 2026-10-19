-- Phase 10: admin-only read access for Kakande trip management.
-- Private trip tables remain inaccessible directly to browser roles.

CREATE FUNCTION public.list_kakande_monthly_trips()
RETURNS TABLE (
  trip_id text,
  month_label text,
  is_published boolean,
  created_at timestamptz,
  updated_at timestamptz,
  flight_option jsonb,
  road_option jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated'
     OR auth.uid() IS NULL
     OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'administrator role required';
  END IF;

  RETURN QUERY
  SELECT
    trip.trip_id,
    trip.month_label,
    trip.is_published,
    trip.created_at,
    trip.updated_at,
    CASE WHEN flight.option_id IS NULL THEN NULL::jsonb ELSE
      pg_catalog.jsonb_build_object(
        'option_id', flight.option_id,
        'transport_mode', flight.transport_mode,
        'departure_date', flight.departure_date,
        'price_per_traveller_zmw', flight.price_per_traveller_zmw,
        'is_published', flight.is_published,
        'availability', flight.availability,
        'created_at', flight.created_at,
        'updated_at', flight.updated_at
      )
    END,
    CASE WHEN road.option_id IS NULL THEN NULL::jsonb ELSE
      pg_catalog.jsonb_build_object(
        'option_id', road.option_id,
        'transport_mode', road.transport_mode,
        'departure_date', road.departure_date,
        'price_per_traveller_zmw', road.price_per_traveller_zmw,
        'is_published', road.is_published,
        'availability', road.availability,
        'created_at', road.created_at,
        'updated_at', road.updated_at
      )
    END
  FROM private.kakande_monthly_trips AS trip
  LEFT JOIN private.kakande_trip_options AS flight
    ON flight.trip_id = trip.trip_id AND flight.transport_mode = 'flight'
  LEFT JOIN private.kakande_trip_options AS road
    ON road.trip_id = trip.trip_id AND road.transport_mode = 'road'
  ORDER BY trip.trip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_kakande_monthly_trips()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_kakande_monthly_trips() TO authenticated;

COMMENT ON FUNCTION public.list_kakande_monthly_trips() IS
  'Returns Kakande trip configuration to authenticated admins only; excludes requests, customer data, internal notes, and audit records.';
