import type { PriceContext, PricedResult, PricingRule } from "./pricingTypes.ts";

export function requirePricingRule(rule: PricingRule | null | undefined): PricingRule {
  if (!rule) {
    throw new Error("No active pricing rule matches this fare. A staff-approved pricing rule is required.");
  }
  return rule;
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
