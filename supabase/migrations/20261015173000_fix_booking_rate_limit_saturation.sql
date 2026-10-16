-- Phase 9D follow-up: retain one rejected hit beyond the configured limit.
-- The original function saturated at p_max_requests, then treated that count
-- as allowed because its result contract is hit_count <= p_max_requests.

CREATE OR REPLACE FUNCTION public.consume_booking_edge_rate_limit(
  p_user_id uuid,
  p_scope text,
  p_max_requests integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, auth
AS $$
DECLARE
  v_now bigint := floor(extract(epoch FROM clock_timestamp()))::bigint;
  v_bucket bigint;
  v_count integer;
  v_retry integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'service role required';
  END IF;
  IF p_user_id IS NULL OR p_scope IS NULL OR p_scope NOT IN ('quote', 'submit_flight', 'inquiry')
     OR p_max_requests IS NULL OR p_max_requests < 1 OR p_max_requests > 100
     OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid rate limit parameters';
  END IF;

  v_bucket := (v_now / p_window_seconds) * p_window_seconds;
  INSERT INTO private.booking_edge_rate_limits(user_id, scope, window_seconds, bucket_start, hit_count)
  VALUES (p_user_id, p_scope, p_window_seconds, v_bucket, 1)
  ON CONFLICT (user_id, scope, window_seconds, bucket_start)
  DO UPDATE SET hit_count = CASE
      -- Keep a max+1 sentinel so every request beyond the limit remains denied.
      WHEN private.booking_edge_rate_limits.hit_count <= p_max_requests
        THEN private.booking_edge_rate_limits.hit_count + 1
      ELSE private.booking_edge_rate_limits.hit_count
    END,
    updated_at = clock_timestamp()
  RETURNING hit_count INTO v_count;

  DELETE FROM private.booking_edge_rate_limits
  WHERE user_id = p_user_id AND bucket_start < v_now - 86400;

  v_retry := greatest(1, (v_bucket + p_window_seconds - v_now)::integer);
  RETURN jsonb_build_object('allowed', v_count <= p_max_requests, 'retry_after_seconds', v_retry);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_booking_edge_rate_limit(uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_booking_edge_rate_limit(uuid, text, integer, integer)
  TO service_role;

COMMENT ON FUNCTION public.consume_booking_edge_rate_limit(uuid, text, integer, integer)
  IS 'Service-role-only persistent fixed-window rate limiter; stores a max+1 sentinel so over-limit requests remain denied.';
