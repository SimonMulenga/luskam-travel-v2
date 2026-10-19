-- Stored generated columns are computed after BEFORE triggers. Protect the
-- generated total through its immutable source fields instead of reading NEW.total.
CREATE OR REPLACE FUNCTION private.prevent_kakande_snapshot_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF ROW(OLD.trip_id, OLD.option_id, OLD.trip_month, OLD.travel_mode, OLD.travel_date,
         OLD.price_per_traveller_zmw, OLD.traveller_count, OLD.currency_code)
     IS DISTINCT FROM
     ROW(NEW.trip_id, NEW.option_id, NEW.trip_month, NEW.travel_mode, NEW.travel_date,
         NEW.price_per_traveller_zmw, NEW.traveller_count, NEW.currency_code) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Kakande request price and trip snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_kakande_snapshot_update()
  FROM PUBLIC, anon, authenticated, service_role;
