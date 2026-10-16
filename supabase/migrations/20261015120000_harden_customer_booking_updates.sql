-- Narrow authenticated booking updates to fields used by the staff dashboard.
-- Customer cancellation remains available through an owner-checked RPC below.

-- Customer-created records are requests, never payment or ticket confirmations.
ALTER TABLE public.bookings ALTER COLUMN status SET DEFAULT 'pending';
DROP POLICY IF EXISTS "own bookings insert" ON public.bookings;
CREATE POLICY "own bookings insert" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND payment_status = 'pending'
    AND duffel_order_id IS NULL
    AND duffel_booking_reference IS NULL
  );

DROP POLICY IF EXISTS "own bookings update" ON public.bookings;

DROP POLICY IF EXISTS "staff update all bookings" ON public.bookings;
CREATE POLICY "staff update all bookings" ON public.bookings
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'agent'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'agent'::public.app_role)
  );

REVOKE UPDATE ON TABLE public.bookings FROM authenticated;
GRANT UPDATE (status, payment_status) ON TABLE public.bookings TO authenticated;

-- The current client has no flight_bookings UPDATE path. Provider references,
-- supplier values, ticket state, and passenger contact data remain service-role
-- managed; staff retain SELECT access through existing RLS policies.
REVOKE UPDATE ON TABLE public.flight_bookings FROM authenticated;

CREATE OR REPLACE FUNCTION public.request_booking_cancellation(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.bookings
  SET status = 'cancelled'
  WHERE id = p_booking_id
    AND user_id = auth.uid()
    AND lower(status) NOT IN ('cancelled', 'completed', 'failed')
    AND lower(payment_status) <> 'paid';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking cannot be cancelled' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.request_booking_cancellation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_booking_cancellation(uuid) TO authenticated;

COMMENT ON FUNCTION public.request_booking_cancellation(uuid) IS
  'Allows an authenticated booking owner to request cancellation only while the booking is not terminal or paid.';

-- Recovery statements are in supabase/tests/recover_booking_authorization_hardening.sql.
-- They restore customer-controlled booking and payment state exposure; use only
-- as an explicit emergency decision, never as a routine release rollback.
