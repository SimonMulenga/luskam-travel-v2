// Server-side pricing engine. The browser NEVER computes the customer price.
import { createClient } from "npm:@supabase/supabase-js@2";
import { applyPricingRule, requirePricingRule } from "./pricingCore.ts";
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

const eq = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toUpperCase() === b.toUpperCase();

// Higher number = higher precedence.
function specificity(rule: PricingRule, ctx: PriceContext): number | null {
  const hasAirline = !!rule.airline_code;
  const hasRoute = !!rule.origin_airport && !!rule.destination_airport;
  const hasCabin = !!rule.cabin_class;
  const hasDomestic = rule.is_domestic !== null && rule.is_domestic !== undefined;

  if (hasAirline && !eq(rule.airline_code, ctx.airlineCode)) return null;
  if (rule.origin_airport && !eq(rule.origin_airport, ctx.origin)) return null;
  if (rule.destination_airport && !eq(rule.destination_airport, ctx.destination)) return null;
  if (hasCabin && (rule.cabin_class ?? "").toLowerCase() !== (ctx.cabin ?? "").toLowerCase()) return null;
  if (hasDomestic && rule.is_domestic !== !!ctx.isDomestic) return null;

  if (rule.min_ticket_price != null && ctx.supplierPrice < Number(rule.min_ticket_price)) return null;
  if (rule.max_ticket_price != null && ctx.supplierPrice > Number(rule.max_ticket_price)) return null;

  const now = Date.now();
  if (rule.valid_from && new Date(rule.valid_from).getTime() > now) return null;
  if (rule.valid_until && new Date(rule.valid_until).getTime() < now) return null;

  // 1. airline + route, 2. route, 3. airline, 4. cabin, 5. domestic flag, 6. global
  if (hasAirline && hasRoute) return 60;
  if (hasRoute) return 50;
  if (hasAirline) return 40;
  if (hasCabin) return 30;
  if (hasDomestic) return 20;
  return 10;
}

export function pickRule(rules: PricingRule[], ctx: PriceContext): PricingRule | null {
  let best: { rule: PricingRule; score: number } | null = null;
  for (const rule of rules) {
    const score = specificity(rule, ctx);
    if (score === null) continue;
    const candidate = { rule, score };
    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score && Number(rule.priority) > Number(best.rule.priority))
    ) {
      best = candidate;
    }
  }
  return best?.rule ?? null;
}

export function applyRule(rule: PricingRule | null, ctx: PriceContext): PricedResult {
  return applyPricingRule(requirePricingRule(rule), ctx);
}

export function priceOffer(rules: PricingRule[], ctx: PriceContext): PricedResult {
  return applyRule(pickRule(rules, ctx), ctx);
}
