import type { PriceContext, PricedResult, PricingRule } from "./pricingTypes.ts";

export function requirePricingRule(rule: PricingRule | null | undefined): PricingRule {
  if (!rule) {
    throw new Error("No active pricing rule matches this fare. A staff-approved pricing rule is required.");
  }
  return rule;
}

const same = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toUpperCase() === b.toUpperCase();

function specificity(rule: PricingRule, ctx: PriceContext): number | null {
  const hasAirline = !!rule.airline_code;
  const hasRoute = !!rule.origin_airport && !!rule.destination_airport;
  const hasCabin = !!rule.cabin_class;
  const hasDomestic = rule.is_domestic !== null && rule.is_domestic !== undefined;

  if (hasAirline && !same(rule.airline_code, ctx.airlineCode)) return null;
  if (rule.origin_airport && !same(rule.origin_airport, ctx.origin)) return null;
  if (rule.destination_airport && !same(rule.destination_airport, ctx.destination)) return null;
  if (hasCabin && rule.cabin_class?.toLowerCase() !== ctx.cabin?.toLowerCase()) return null;
  if (hasDomestic && rule.is_domestic !== !!ctx.isDomestic) return null;
  if (rule.min_ticket_price != null && ctx.supplierPrice < Number(rule.min_ticket_price)) return null;
  if (rule.max_ticket_price != null && ctx.supplierPrice > Number(rule.max_ticket_price)) return null;

  const now = Date.now();
  if (rule.valid_from && new Date(rule.valid_from).getTime() > now) return null;
  if (rule.valid_until && new Date(rule.valid_until).getTime() < now) return null;

  if (hasAirline && hasRoute) return 60;
  if (hasRoute) return 50;
  if (hasAirline) return 40;
  if (hasCabin) return 30;
  if (hasDomestic) return 20;
  return 10;
}

export function pickPricingRule(rules: PricingRule[], ctx: PriceContext): PricingRule | null {
  let best: { rule: PricingRule; score: number } | null = null;
  for (const rule of rules) {
    const score = specificity(rule, ctx);
    if (score === null) continue;
    if (!best || score > best.score || (score === best.score && Number(rule.priority) > Number(best.rule.priority))) {
      best = { rule, score };
    }
  }
  return best?.rule ?? null;
}

/** Pure calculation shared by the server pricing engine and unit tests. */
export function applyPricingRule(ruleInput: PricingRule | null | undefined, ctx: PriceContext): PricedResult {
  const rule = requirePricingRule(ruleInput);

  const supplier = Number(ctx.supplierPrice);
  let markup = rule.markup_type === "percentage"
    ? (supplier * Number(rule.markup_amount)) / 100
    : Number(rule.markup_amount);
  markup = Math.max(0, Math.round(markup * 100) / 100);
  return {
    supplier_price: Math.round(supplier * 100) / 100,
    markup_amount: markup,
    customer_price: Math.round((supplier + markup) * 100) / 100,
    pricing_rule_id: rule.id,
    pricing_rule_name: rule.name,
  };
}

export function applyPricingRuleOrThrow(rule: PricingRule | null | undefined, ctx: PriceContext): PricedResult {
  return applyPricingRule(requirePricingRule(rule), ctx);
}
