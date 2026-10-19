-- Rollback-only Phase 10 Kakande data-model and staff-RPC checks. Staging only.
-- Run as postgres/supabase_admin after reviewing the project ref and applying
-- the local migration in a separately approved staging change. Never COMMIT.
-- Use three existing synthetic Auth identities with the stated roles.
-- Run with psql -X -v ON_ERROR_STOP=1 so an SQL error stops the script; connection close rolls back the open transaction.

BEGIN;
SELECT set_config('phase10.customer_id', 'REPLACE_WITH_SYNTHETIC_CUSTOMER_UID', true);
SELECT set_config('phase10.agent_id', 'REPLACE_WITH_SYNTHETIC_AGENT_UID', true);
SELECT set_config('phase10.admin_id', 'REPLACE_WITH_SYNTHETIC_ADMIN_UID', true);
SELECT set_config('phase10.trip_id', 'k' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 31)), true);
SELECT set_config('phase10.idempotency_key', gen_random_uuid()::text, true);
SELECT set_config('phase10.reference', 'KMR-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)), true);
SELECT set_config('phase10.unavailable_reference', 'KMR-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)), true);

DO $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Unexpected SQL Editor role %', current_user;
  END IF;
  IF current_setting('phase10.customer_id') LIKE 'REPLACE_%'
     OR current_setting('phase10.agent_id') LIKE 'REPLACE_%'
     OR current_setting('phase10.admin_id') LIKE 'REPLACE_%' THEN
    RAISE EXCEPTION 'Replace all three synthetic Auth UID placeholders';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase10.customer_id')::uuid)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase10.agent_id')::uuid)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = current_setting('phase10.admin_id')::uuid) THEN
    RAISE EXCEPTION 'All synthetic Auth users must exist';
  END IF;
  IF current_setting('phase10.customer_id')::uuid = current_setting('phase10.agent_id')::uuid
     OR current_setting('phase10.customer_id')::uuid = current_setting('phase10.admin_id')::uuid
     OR current_setting('phase10.agent_id')::uuid = current_setting('phase10.admin_id')::uuid THEN
    RAISE EXCEPTION 'Synthetic customer, agent, and admin identities must be distinct';
  END IF;
  -- This privileged setup check verifies stored assignments directly. The
  -- self-scoped has_role helper is exercised later under each simulated JWT.
  IF EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = current_setting('phase10.customer_id')::uuid
         AND role IN ('admin'::public.app_role, 'agent'::public.app_role)
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = current_setting('phase10.agent_id')::uuid
         AND role = 'agent'::public.app_role
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = current_setting('phase10.admin_id')::uuid
         AND role = 'admin'::public.app_role
     ) THEN
    RAISE EXCEPTION 'Configured customer/agent/admin stored roles are not correct';
  END IF;
  IF has_table_privilege('authenticated', 'public.kakande_ministry_requests', 'INSERT')
     OR has_table_privilege('authenticated', 'public.kakande_ministry_requests', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.kakande_ministry_requests', 'DELETE')
     OR has_table_privilege('anon', 'public.kakande_ministry_requests', 'SELECT')
     OR has_table_privilege('anon', 'public.kakande_ministry_requests', 'INSERT') THEN
    RAISE EXCEPTION 'Direct browser-role request-table privileges are too broad';
  END IF;
  IF has_function_privilege('anon', 'public.create_kakande_ministry_request_once(uuid,text,text,text,text,text,integer,timestamptz,timestamptz,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.create_kakande_ministry_request_once(uuid,text,text,text,text,text,integer,timestamptz,timestamptz,text,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.create_kakande_ministry_request_once(uuid,text,text,text,text,text,integer,timestamptz,timestamptz,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_kakande_trip_option(text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_kakande_trip_option(text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.update_kakande_ministry_request(uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.save_kakande_monthly_trip(text,text,boolean,date,numeric,boolean,text,date,numeric,boolean,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.save_kakande_monthly_trip(text,text,boolean,date,numeric,boolean,text,date,numeric,boolean,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Kakande RPC execute grants are too broad or missing';
  END IF;
  IF NOT has_table_privilege(current_user, 'public.kakande_ministry_requests', 'UPDATE')
     OR NOT has_table_privilege(current_user, 'private.kakande_trip_options', 'UPDATE') THEN
    RAISE EXCEPTION 'SQL Editor role cannot exercise privileged trigger/fixture checks';
  END IF;
END;
$$;

-- The four historic months retain their supplied prices and remain unpublished/closed.
DO $$
DECLARE expected record;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('jun-2026', 'flight', DATE '2026-06-10', 10950.00::numeric),
      ('jun-2026', 'road',   DATE '2026-06-08',  4500.00::numeric),
      ('jul-2026', 'flight', DATE '2026-07-10', 11200.00::numeric),
      ('jul-2026', 'road',   DATE '2026-07-08',  4700.00::numeric),
      ('aug-2026', 'flight', DATE '2026-08-10', 11200.00::numeric),
      ('aug-2026', 'road',   DATE '2026-08-08',  4700.00::numeric),
      ('sep-2026', 'flight', DATE '2026-09-10', 11500.00::numeric),
      ('sep-2026', 'road',   DATE '2026-09-08',  4900.00::numeric)
    ) AS fixture(trip_id, transport_mode, departure_date, price_zmw)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM private.kakande_monthly_trips AS trip
      JOIN private.kakande_trip_options AS opt USING (trip_id)
      WHERE trip.trip_id = expected.trip_id AND NOT trip.is_published
        AND opt.transport_mode = expected.transport_mode
        AND opt.departure_date = expected.departure_date
        AND opt.price_per_traveller_zmw = expected.price_zmw
        AND NOT opt.is_published AND opt.availability = 'closed'
    ) THEN RAISE EXCEPTION 'Historical fixture mismatch for %/%', expected.trip_id, expected.transport_mode; END IF;
  END LOOP;
END;
$$;

-- Create an isolated future trip through the admin-only trip RPC.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase10.admin_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('phase10.admin_id'))::text, true);
DO $$
BEGIN
  IF current_user <> 'authenticated'
     OR auth.uid() IS DISTINCT FROM current_setting('phase10.admin_id')::uuid THEN
    RAISE EXCEPTION 'Simulated authenticated admin_id context did not resolve correctly';
  END IF;
END;
$$;
DO $$
DECLARE result jsonb;
BEGIN
  result := public.save_kakande_monthly_trip(
    current_setting('phase10.trip_id'), 'Synthetic test month', true,
    current_date + 90, 5000.00, true, 'open',
    current_date + 88, 1200.00, true, 'filling_fast'
  );
  IF result ->> 'outcome' <> 'created' THEN RAISE EXCEPTION 'Admin could not create isolated synthetic trip'; END IF;
END;
$$;
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM private.kakande_trip_events
      WHERE trip_id = current_setting('phase10.trip_id') AND actor_id = current_setting('phase10.admin_id')::uuid) <> 1 THEN
    RAISE EXCEPTION 'Trip creation audit attribution was not recorded';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase10.agent_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('phase10.agent_id'))::text, true);
DO $$
BEGIN
  IF current_user <> 'authenticated'
     OR auth.uid() IS DISTINCT FROM current_setting('phase10.agent_id')::uuid THEN
    RAISE EXCEPTION 'Simulated authenticated agent_id context did not resolve correctly';
  END IF;
END;
$$;
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.save_kakande_monthly_trip(
      current_setting('phase10.trip_id'), 'Synthetic test month', true,
      current_date + 90, 5000.00, true, 'open', current_date + 88, 1200.00, true, 'open'
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Agent was able to manage trip prices or dates'; END IF;
END;
$$;
RESET ROLE;

-- Resolve authoritative option and create the request only through the service RPC.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
DECLARE option_data jsonb; created jsonb; replay jsonb; cross_key jsonb; changed_payload jsonb;
  unsafe_rejected boolean := false;
BEGIN
  option_data := public.get_kakande_trip_option(current_setting('phase10.trip_id'), 'flight');
  IF option_data ->> 'available' <> 'true'
     OR (option_data ->> 'price_per_traveller_zmw')::numeric <> 5000.00 THEN
    RAISE EXCEPTION 'Authoritative synthetic option was not available at its stored price';
  END IF;
  created := public.create_kakande_ministry_request_once(
    current_setting('phase10.idempotency_key')::uuid, repeat('a', 43), repeat('a', 43),
    current_setting('phase10.reference'), current_setting('phase10.trip_id'), 'flight', 2,
    (option_data ->> 'trip_updated_at')::timestamptz,
    (option_data ->> 'option_updated_at')::timestamptz,
     'Synthetic Kakande Tester', 'kakande-test@example.test', '+260 977 000 111', 'First paragraph' || E'\r\n' || 'Second paragraph'
  );
  IF created ->> 'outcome' <> 'created'
     OR (created #>> '{snapshot,pricePerTravellerZmw}')::numeric <> 5000.00
     OR (created #>> '{snapshot,travellerCount}')::integer <> 2
     OR (created #>> '{snapshot,totalQuotedAmountZmw}')::numeric <> 10000.00
     OR created #>> '{snapshot,currency}' <> 'ZMW' THEN
    RAISE EXCEPTION 'Database did not calculate and return the expected ZMW snapshot';
  END IF;

  -- Multiline notes are accepted, but other unsafe controls fail closed.
  BEGIN
    BEGIN
      PERFORM public.create_kakande_ministry_request_once(
        gen_random_uuid(), repeat('f', 43), repeat('f', 43), current_setting('phase10.unavailable_reference'),
        current_setting('phase10.trip_id'), 'flight', 2,
        (option_data ->> 'trip_updated_at')::timestamptz,
        (option_data ->> 'option_updated_at')::timestamptz,
        'Synthetic Kakande Tester', 'kakande-test@example.test', '+260 977 000 111', 'Unsafe' || chr(1) || 'note'
      );
    EXCEPTION WHEN SQLSTATE '22023' THEN unsafe_rejected := true;
    END;
    IF NOT unsafe_rejected THEN RAISE EXCEPTION 'Database accepted an unsafe control character in notes'; END IF;
  END;

  replay := public.create_kakande_ministry_request_once(
    current_setting('phase10.idempotency_key')::uuid, repeat('a', 43), repeat('a', 43),
    current_setting('phase10.reference'), current_setting('phase10.trip_id'), 'flight', 2,
    (option_data ->> 'trip_updated_at')::timestamptz,
    (option_data ->> 'option_updated_at')::timestamptz,
    'Synthetic Kakande Tester', 'kakande-test@example.test', '+260 977 000 111', 'First paragraph' || E'\r\n' || 'Second paragraph'
  );
  IF replay ->> 'outcome' <> 'duplicate' OR replay ->> 'reference' <> current_setting('phase10.reference') THEN
    RAISE EXCEPTION 'Same idempotency retry did not replay its request';
  END IF;
  cross_key := public.create_kakande_ministry_request_once(
    gen_random_uuid(), repeat('a', 43), repeat('a', 43), current_setting('phase10.unavailable_reference'),
    current_setting('phase10.trip_id'), 'flight', 2,
    (option_data ->> 'trip_updated_at')::timestamptz,
    (option_data ->> 'option_updated_at')::timestamptz,
    'Synthetic Kakande Tester', 'kakande-test@example.test', '+260 977 000 111', 'First paragraph' || E'\r\n' || 'Second paragraph'
  );
  IF cross_key ->> 'outcome' <> 'duplicate' OR cross_key ->> 'reference' <> current_setting('phase10.reference') THEN
    RAISE EXCEPTION 'Different idempotency key bypassed duplicate prevention';
  END IF;
  changed_payload := public.create_kakande_ministry_request_once(
    current_setting('phase10.idempotency_key')::uuid, repeat('e', 43), repeat('e', 43), current_setting('phase10.unavailable_reference'),
    current_setting('phase10.trip_id'), 'flight', 2,
    (option_data ->> 'trip_updated_at')::timestamptz,
    (option_data ->> 'option_updated_at')::timestamptz,
    'Synthetic Kakande Tester', 'kakande-test@example.test', '+260 977 000 111', 'Changed request payload'
  );
  IF changed_payload ->> 'outcome' <> 'conflict' THEN
    RAISE EXCEPTION 'Idempotency key reuse with changed request hash was not rejected';
  END IF;
END;
$$;
RESET ROLE;
-- Verify persisted customer notes and rejected-input absence as the original privileged test role.
DO $$
BEGIN
  IF (SELECT customer_notes FROM public.kakande_ministry_requests
      WHERE reference = current_setting('phase10.reference')) <> 'First paragraph' || E'\n' || 'Second paragraph' THEN
    RAISE EXCEPTION 'Database did not normalize CRLF notes to LF';
  END IF;
  IF EXISTS (SELECT 1 FROM public.kakande_ministry_requests
             WHERE reference = current_setting('phase10.unavailable_reference')) THEN
    RAISE EXCEPTION 'Rejected unsafe notes created a request';
  END IF;
END;
$$;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.kakande_ministry_requests
      WHERE reference = current_setting('phase10.reference') AND traveller_count = 2
        AND price_per_traveller_zmw = 5000.00 AND total_quoted_amount_zmw = 10000.00
        AND travel_mode = 'flight' AND travel_date = current_date + 90
        AND currency_code = 'ZMW') <> 1 THEN
    RAISE EXCEPTION 'Generated total or server-selected request snapshot was not persisted';
  END IF;
END;
$$;

-- A privileged direct attempt cannot mutate the saved price/date/count snapshot.
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    UPDATE public.kakande_ministry_requests SET price_per_traveller_zmw = 1
    WHERE reference = current_setting('phase10.reference');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Database immutability trigger allowed a price snapshot change'; END IF;
  IF (SELECT price_per_traveller_zmw FROM public.kakande_ministry_requests
      WHERE reference = current_setting('phase10.reference')) <> 5000.00 THEN
    RAISE EXCEPTION 'Failed snapshot mutation changed stored data';
  END IF;
END;
$$;

-- Customer cannot read or update requests or call staff workflow RPCs.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase10.customer_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('phase10.customer_id'))::text, true);
DO $$
BEGIN
  IF current_user <> 'authenticated'
     OR auth.uid() IS DISTINCT FROM current_setting('phase10.customer_id')::uuid THEN
    RAISE EXCEPTION 'Simulated authenticated customer_id context did not resolve correctly';
  END IF;
END;
$$;
DO $$
DECLARE visible integer; denied boolean := false;
BEGIN
  SELECT count(*) INTO visible FROM public.kakande_ministry_requests;
  IF visible <> 0 THEN RAISE EXCEPTION 'Customer enumerated Kakande requests'; END IF;
  BEGIN
    PERFORM public.update_kakande_ministry_request(
      (SELECT id FROM public.kakande_ministry_requests WHERE reference = current_setting('phase10.reference')),
      'approved', 'forged customer note'
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Customer invoked staff decision RPC'; END IF;
END;
$$;
RESET ROLE;

-- Agent can move a pending request to In Progress and add private notes, but cannot approve.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase10.agent_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('phase10.agent_id'))::text, true);
DO $$
BEGIN
  IF current_user <> 'authenticated'
     OR auth.uid() IS DISTINCT FROM current_setting('phase10.agent_id')::uuid THEN
    RAISE EXCEPTION 'Simulated authenticated agent_id context did not resolve correctly';
  END IF;
END;
$$;
DO $$
DECLARE v_request_id uuid; result jsonb; denied boolean := false;
BEGIN
  SELECT id INTO v_request_id FROM public.kakande_ministry_requests WHERE reference = current_setting('phase10.reference');
  result := public.update_kakande_ministry_request(v_request_id, 'in_progress', 'Synthetic agent review note');
  IF result ->> 'outcome' <> 'updated' OR result ->> 'status' <> 'in_progress' THEN
    RAISE EXCEPTION 'Agent could not set In Progress and add notes';
  END IF;
  BEGIN
    PERFORM public.update_kakande_ministry_request(v_request_id, 'approved', 'Synthetic agent review note');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Agent approved a request'; END IF;
END;
$$;
RESET ROLE;

-- Admin can approve; both staff actions are attributed and history preserves the note/status transition.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase10.admin_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('phase10.admin_id'))::text, true);
DO $$
BEGIN
  IF current_user <> 'authenticated'
     OR auth.uid() IS DISTINCT FROM current_setting('phase10.admin_id')::uuid THEN
    RAISE EXCEPTION 'Simulated authenticated admin_id context did not resolve correctly';
  END IF;
END;
$$;
DO $$
DECLARE v_request_id uuid;
BEGIN
  SELECT id INTO v_request_id FROM public.kakande_ministry_requests WHERE reference = current_setting('phase10.reference');
  IF (public.update_kakande_ministry_request(v_request_id, 'approved', 'Synthetic admin approval') ->> 'status') <> 'approved' THEN
    RAISE EXCEPTION 'Admin approval did not persist';
  END IF;
  IF (SELECT count(*) FROM public.kakande_request_events AS event_row
      WHERE event_row.request_id = v_request_id AND event_row.actor_id = current_setting('phase10.agent_id')::uuid
        AND event_row.event_type = 'status_and_notes_changed' AND event_row.previous_status = 'pending'
        AND event_row.new_status = 'in_progress' AND event_row.new_internal_notes = 'Synthetic agent review note') <> 1 THEN
    RAISE EXCEPTION 'Agent audit attribution/status/note history is incomplete';
  END IF;
  IF (SELECT count(*) FROM public.kakande_request_events AS event_row
      WHERE event_row.request_id = v_request_id AND event_row.actor_id = current_setting('phase10.admin_id')::uuid
        AND event_row.event_type = 'status_and_notes_changed' AND event_row.previous_status = 'in_progress'
        AND event_row.new_status = 'approved' AND event_row.new_internal_notes = 'Synthetic admin approval') <> 1 THEN
    RAISE EXCEPTION 'Admin audit attribution/status/note history is incomplete';
  END IF;
END;
$$;
RESET ROLE;

-- A staff price/date change affects future requests only; the existing snapshot remains unchanged.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('phase10.admin_id'), true);
SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub',current_setting('phase10.admin_id'))::text, true);
DO $$
BEGIN
  IF current_user <> 'authenticated'
     OR auth.uid() IS DISTINCT FROM current_setting('phase10.admin_id')::uuid THEN
    RAISE EXCEPTION 'Simulated authenticated admin_id context did not resolve correctly';
  END IF;
END;
$$;
DO $$
DECLARE snapshot_row record;
BEGIN
  SELECT price_per_traveller_zmw, total_quoted_amount_zmw, travel_date INTO snapshot_row
  FROM public.kakande_ministry_requests WHERE reference = current_setting('phase10.reference');
  IF snapshot_row.price_per_traveller_zmw <> 5000.00 OR snapshot_row.total_quoted_amount_zmw <> 10000.00
     OR snapshot_row.travel_date <> current_date + 90 THEN
    RAISE EXCEPTION 'Trip price update changed the historical request snapshot';
  END IF;
END;
$$;
RESET ROLE;

-- Retry and availability checks use the service-only lookup and creation RPCs.
-- Set the synthetic option to fully booked as the privileged fixture owner.
DO $$
DECLARE changed_rows integer;
BEGIN
  UPDATE private.kakande_trip_options
  SET availability = 'fully_booked', updated_at = pg_catalog.clock_timestamp()
  WHERE trip_id = current_setting('phase10.trip_id') AND transport_mode = 'flight';
  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one synthetic flight option to mark fully booked; changed %', changed_rows;
  END IF;
END;
$$;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
DECLARE duplicate_result jsonb; option_data jsonb; unavailable jsonb;
BEGIN
  option_data := public.get_kakande_trip_option(current_setting('phase10.trip_id'), 'flight');
  IF option_data ->> 'availability' <> 'fully_booked'
     OR option_data ->> 'available' <> 'false' THEN
    RAISE EXCEPTION 'Synthetic flight option was not fully booked before rejection test';
  END IF;
  duplicate_result := public.create_kakande_ministry_request_once(
    current_setting('phase10.idempotency_key')::uuid, repeat('a', 43), repeat('a', 43),
    current_setting('phase10.reference'), current_setting('phase10.trip_id'), 'flight', 2,
    (option_data ->> 'trip_updated_at')::timestamptz,
    (option_data ->> 'option_updated_at')::timestamptz,
    'Synthetic Kakande Tester', 'kakande-test@example.test', '+260 977 000 111', 'First paragraph' || E'\r\n' || 'Second paragraph'
  );
  IF duplicate_result ->> 'outcome' <> 'duplicate'
     OR (duplicate_result #>> '{snapshot,pricePerTravellerZmw}')::numeric <> 5000.00 THEN
    RAISE EXCEPTION 'Retry did not replay the original immutable snapshot';
  END IF;
  unavailable := public.create_kakande_ministry_request_once(
    gen_random_uuid(), repeat('b', 43), repeat('b', 43),
    current_setting('phase10.unavailable_reference'),
    current_setting('phase10.trip_id'), 'flight', 3,
    (option_data ->> 'trip_updated_at')::timestamptz,
    (option_data ->> 'option_updated_at')::timestamptz,
    'Synthetic Kakande Tester', 'kakande-test@example.test', '+260 977 000 111', 'Unavailable-option test'
  );
  IF unavailable ->> 'outcome' <> 'trip_unavailable' THEN
    RAISE EXCEPTION 'Fully booked option accepted a new request';
  END IF;
END;
$$;
RESET ROLE;

-- An unpublished option and an expired option are also rejected by the database RPC.
UPDATE private.kakande_trip_options
SET is_published = false, availability = 'open', updated_at = pg_catalog.clock_timestamp()
WHERE trip_id = current_setting('phase10.trip_id') AND transport_mode = 'flight';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
DECLARE option_data jsonb; result jsonb;
BEGIN
  option_data := public.get_kakande_trip_option(current_setting('phase10.trip_id'), 'flight');
  result := public.create_kakande_ministry_request_once(
    gen_random_uuid(), repeat('c', 43), repeat('c', 43), current_setting('phase10.unavailable_reference'),
    current_setting('phase10.trip_id'), 'flight', 4,
    (option_data ->> 'trip_updated_at')::timestamptz,
    (option_data ->> 'option_updated_at')::timestamptz,
    'Synthetic Kakande Tester', 'kakande-test@example.test', '+260 977 000 111', 'Unpublished-option test'
  );
  IF result ->> 'outcome' <> 'trip_unavailable' THEN RAISE EXCEPTION 'Unpublished option accepted a new request'; END IF;
END;
$$;
RESET ROLE;

UPDATE private.kakande_trip_options
SET is_published = true, availability = 'open', departure_date = current_date - 1,
    updated_at = pg_catalog.clock_timestamp()
WHERE trip_id = current_setting('phase10.trip_id') AND transport_mode = 'flight';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $$
DECLARE option_data jsonb; result jsonb;
BEGIN
  option_data := public.get_kakande_trip_option(current_setting('phase10.trip_id'), 'flight');
  result := public.create_kakande_ministry_request_once(
    gen_random_uuid(), repeat('d', 43), repeat('d', 43), current_setting('phase10.unavailable_reference'),
    current_setting('phase10.trip_id'), 'flight', 5,
    (option_data ->> 'trip_updated_at')::timestamptz,
    (option_data ->> 'option_updated_at')::timestamptz,
    'Synthetic Kakande Tester', 'kakande-test@example.test', '+260 977 000 111', 'Expired-option test'
  );
  IF result ->> 'outcome' <> 'trip_unavailable' THEN RAISE EXCEPTION 'Expired option accepted a new request'; END IF;
END;
$$;
RESET ROLE;

SELECT 'PASS: authoritative pricing, immutable snapshots, availability, idempotency, staff role boundaries and audit history' AS result;
ROLLBACK;
