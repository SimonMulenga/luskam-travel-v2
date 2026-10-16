// Server-side pricing engine. The browser NEVER computes the customer price.
import { createClient } from "npm:@supabase/supabase-js@2";
import { applyPricingRuleOrThrow, pickPricingRule } from "./pricingCore.ts";
import type { PriceContext, PricedResult, PricingRule } from "./pricingTypes.ts";
export type { PriceContext, PricedResult, PricingRule } from "./pricingTypes.ts";

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export async function loadRules(): Promise<PricingRule[]> {
  const supabase = serviceClient();
  const { data, error } = await supabase.from("pricing_rules").select("*").eq("is_active", true);
  if (error) throw new Error("Pricing rules could not be loaded.");
  return (data ?? []) as PricingRule[];
}

export function pickRule(rules: PricingRule[], ctx: PriceContext): PricingRule | null {
  return pickPricingRule(rules, ctx);
}

export function applyRule(rule: PricingRule | null, ctx: PriceContext): PricedResult {
  return applyPricingRuleOrThrow(rule, ctx);
}

export function priceOffer(rules: PricingRule[], ctx: PriceContext): PricedResult {
  return applyRule(pickRule(rules, ctx), ctx);
}
