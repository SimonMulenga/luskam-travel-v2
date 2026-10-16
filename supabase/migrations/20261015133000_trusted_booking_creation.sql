-- Booking rows must be created by the authenticated create-booking-request
-- Edge Function using the service role. The old customer INSERT policy allowed
-- forged total_amount values even when the status was pending.
DROP POLICY IF EXISTS "own bookings insert" ON public.bookings;
REVOKE INSERT, DELETE ON TABLE public.bookings FROM authenticated;
-- flight_bookings currently has only a read policy for customers and an
-- update policy for admin/agent. There is no client creation workflow.
REVOKE INSERT, UPDATE ON TABLE public.flight_bookings FROM authenticated;

-- Existing RLS policies always pass auth.uid(). Also bind the function's
-- identity argument to that verified session so clients cannot use this
-- SECURITY DEFINER helper as a role-membership oracle for other users.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() = _user_id
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = _role
    )
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Existing narrow staff UPDATE privileges and owner SELECT remain governed by
-- the Phase 7 migration's column grants and RLS policies. The cancellation RPC
-- remains the only customer write path, with an owner check and atomic status
-- predicates. service_role bypasses RLS for trusted Edge Function inserts.

COMMENT ON TABLE public.bookings IS
  'Booking requests are created by trusted server operations; authenticated customers can read their own rows and request eligible cancellations through request_booking_cancellation.';
