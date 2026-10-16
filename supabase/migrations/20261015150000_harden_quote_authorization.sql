-- Quotations are authoritative and must not be customer-controlled.
-- Customers retain owner-scoped SELECT only. Admins and explicitly assigned
-- agents may manage quotes; trusted service-role operations retain access.

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.quotes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.quotes TO authenticated;
GRANT ALL ON TABLE public.quotes TO service_role;

DROP POLICY IF EXISTS "own quotes all" ON public.quotes;
DROP POLICY IF EXISTS "staff read all quotes" ON public.quotes;
DROP POLICY IF EXISTS "customers read own quotes" ON public.quotes;
DROP POLICY IF EXISTS "staff insert quotes" ON public.quotes;
DROP POLICY IF EXISTS "staff update quotes" ON public.quotes;
DROP POLICY IF EXISTS "staff delete quotes" ON public.quotes;

CREATE POLICY "customers read own quotes" ON public.quotes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "staff read all quotes" ON public.quotes
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'agent'::public.app_role)
  );

CREATE POLICY "staff insert quotes" ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'agent'::public.app_role)
  );

CREATE POLICY "staff update quotes" ON public.quotes
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'agent'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'agent'::public.app_role)
  );

CREATE POLICY "staff delete quotes" ON public.quotes
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'agent'::public.app_role)
  );

COMMENT ON TABLE public.quotes IS
  'Authoritative quotations: customers may read their own; admins and assigned agents manage them; trusted service-role operations retain access.';
