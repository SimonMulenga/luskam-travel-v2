-- Remove anonymous and PUBLIC ACL access from customer booking tables.
-- RLS remains enabled and all policies remain unchanged. Authenticated
-- customers retain their owner-scoped SELECT policies; trusted Edge Functions
-- continue using the service_role grants.

REVOKE ALL PRIVILEGES ON TABLE public.bookings, public.flight_bookings
  FROM PUBLIC, anon;

-- Preserve customer account/history reads explicitly in case an earlier
-- environment granted access through PUBLIC rather than authenticated.
GRANT SELECT ON TABLE public.bookings, public.flight_bookings TO authenticated;

-- Preserve the trusted create-booking-request and other server-side workflows.
GRANT ALL PRIVILEGES ON TABLE public.bookings, public.flight_bookings TO service_role;
