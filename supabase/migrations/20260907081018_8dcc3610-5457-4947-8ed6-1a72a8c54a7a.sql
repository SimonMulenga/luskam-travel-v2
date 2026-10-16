CREATE TABLE public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  rule_type text NOT NULL DEFAULT 'global',
  priority integer NOT NULL DEFAULT 0,
  markup_type text NOT NULL DEFAULT 'fixed',
  markup_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  airline_code text,
  origin_airport text,
  destination_airport text,
  cabin_class text,
  is_domestic boolean,
  min_ticket_price numeric,
  max_ticket_price numeric,
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_rules TO authenticated;
GRANT ALL ON public.pricing_rules TO service_role;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read pricing rules" ON public.pricing_rules FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'agent'::app_role));
CREATE POLICY "admins insert pricing rules" ON public.pricing_rules FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins update pricing rules" ON public.pricing_rules FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins delete pricing rules" ON public.pricing_rules FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER pricing_rules_set_updated_at BEFORE UPDATE ON public.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX pricing_rules_active_idx ON public.pricing_rules (is_active, priority DESC);

CREATE TABLE public.booking_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  supplier_price numeric NOT NULL,
  markup_amount numeric NOT NULL DEFAULT 0,
  customer_price numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  pricing_rule_id uuid REFERENCES public.pricing_rules(id) ON DELETE SET NULL,
  pricing_rule_name text,
  duffel_offer_id text,
  duffel_order_id text,
  duffel_booking_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.booking_pricing TO authenticated;
GRANT ALL ON public.booking_pricing TO service_role;
ALTER TABLE public.booking_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read booking pricing" ON public.booking_pricing FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'agent'::app_role));

CREATE TRIGGER booking_pricing_set_updated_at BEFORE UPDATE ON public.booking_pricing
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX booking_pricing_booking_idx ON public.booking_pricing (booking_id);

CREATE TABLE public.pricing_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  pricing_rule_id uuid,
  pricing_rule_name text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.pricing_audit_log TO authenticated;
GRANT ALL ON public.pricing_audit_log TO service_role;
ALTER TABLE public.pricing_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read pricing audit" ON public.pricing_audit_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admins write pricing audit" ON public.pricing_audit_log FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND actor_id = auth.uid());

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS duffel_order_id text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS duffel_booking_reference text;

INSERT INTO public.pricing_rules (name, description, rule_type, priority, markup_type, markup_amount, currency, is_active)
VALUES ('Default markup', 'Global markup applied when no more specific rule matches', 'global', 0, 'fixed', 120, 'USD', true);