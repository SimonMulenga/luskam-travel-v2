// Admin-only markup preview. Uses the same server-side pricing engine as search,
// so the preview always matches what a customer would be quoted.
import { corsHeaders, json } from "../_shared/cors.ts";
import { applyRule, loadRules, pickRule, serviceClient } from "../_shared/pricing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const admin = serviceClient();
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const allowed = (roles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "agent");
  if (!allowed) return json({ error: "Forbidden" }, 403);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch { /* ignore */ }

  const supplierPrice = Number(body.supplierPrice);
  if (!isFinite(supplierPrice) || supplierPrice < 0) {
    return json({ error: "supplierPrice must be a positive number" }, 400);
  }

  const origin = String(body.origin ?? "").toUpperCase().slice(0, 3) || undefined;
  const destination = String(body.destination ?? "").toUpperCase().slice(0, 3) || undefined;

  const ctx = {
    supplierPrice,
    airlineCode: String(body.airlineCode ?? "").toUpperCase().slice(0, 3) || undefined,
    origin,
    destination,
    cabin: String(body.cabin ?? "economy").toLowerCase(),
    isDomestic: origin && destination ? origin.slice(0, 2) === destination.slice(0, 2) : false,
  };

  // Fail closed if pricing configuration is unavailable; an empty rule set
  // must not make a supplier fare look like an approved customer quotation.
  const rules = await loadRules();
  const rule = pickRule(rules, ctx);
  const priced = applyRule(rule, ctx);

  return json({
    ...priced,
    margin_percent: priced.supplier_price > 0
      ? Math.round((priced.markup_amount / priced.supplier_price) * 1000) / 10
      : 0,
  });
});
