-- Disable the historical default USD 120 markup without deleting its record.
-- Run after 20260907081018 creates public.pricing_rules.
-- A staging administrator must configure an explicitly approved rule before
-- priced flight quotes or booking requests are available.

UPDATE public.pricing_rules
SET is_active = false,
    updated_at = now()
WHERE name = 'Default markup'
  AND rule_type = 'global'
  AND markup_type = 'fixed'
  AND markup_amount = 120
  AND currency = 'USD';
