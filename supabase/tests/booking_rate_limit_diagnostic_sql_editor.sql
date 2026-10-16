-- Rollback-only diagnostic for the Phase 9D rate limiter. Staging only.
-- Verify the Supabase dashboard project reference before running.
-- Prints all three JSON responses; all counter writes are rolled back.
-- Run as postgres/supabase_admin. Do not add COMMIT.

BEGIN;
SELECT set_config('phase9d.diag_user_id', gen_random_uuid()::text, true);

DO $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Unexpected SQL Editor role %; stop before running diagnostic', current_user;
  END IF;
  IF NOT has_table_privilege(session_user, 'private.booking_edge_rate_limits', 'SELECT') THEN
    RAISE EXCEPTION 'SQL Editor session role cannot inspect the private rate-limit table';
  END IF;
END;
$$;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

SELECT 'rate1' AS call, public.consume_booking_edge_rate_limit(
  current_setting('phase9d.diag_user_id')::uuid, 'quote', 2, 86400
) AS response;
RESET ROLE;
SELECT 'counter_after_rate1' AS checkpoint, user_id, scope, window_seconds, bucket_start, hit_count
FROM private.booking_edge_rate_limits
WHERE user_id = current_setting('phase9d.diag_user_id')::uuid AND scope = 'quote' AND window_seconds = 86400;
SET LOCAL ROLE service_role;
SELECT 'rate2' AS call, public.consume_booking_edge_rate_limit(
  current_setting('phase9d.diag_user_id')::uuid, 'quote', 2, 86400
) AS response;
RESET ROLE;
SELECT 'counter_after_rate2' AS checkpoint, user_id, scope, window_seconds, bucket_start, hit_count
FROM private.booking_edge_rate_limits
WHERE user_id = current_setting('phase9d.diag_user_id')::uuid AND scope = 'quote' AND window_seconds = 86400;
SET LOCAL ROLE service_role;
SELECT 'rate3' AS call, public.consume_booking_edge_rate_limit(
  current_setting('phase9d.diag_user_id')::uuid, 'quote', 2, 86400
) AS response;
RESET ROLE;
SELECT 'counter_after_rate3' AS checkpoint, user_id, scope, window_seconds, bucket_start, hit_count
FROM private.booking_edge_rate_limits
WHERE user_id = current_setting('phase9d.diag_user_id')::uuid AND scope = 'quote' AND window_seconds = 86400;

ROLLBACK;
