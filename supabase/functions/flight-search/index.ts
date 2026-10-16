import { getDataProvider, getPricingProvider } from "../_shared/flight/registry.ts";
import { loadRules, serviceClient } from "../_shared/pricing.ts";
import { createFlightSearchHandler } from "./handler.ts";
import { rateLimitIdentityFromAddress } from "./rateLimitIdentity.ts";

async function rateLimitIdentity(req: Request): Promise<string> {
  // Supabase's edge gateway supplies cf-connecting-ip. Do not trust a
  // caller-provided X-Forwarded-For value. Missing IP metadata maps to a
  // shared bucket (fail closed) instead of disabling anonymous protection.
  const ip = req.headers.get("cf-connecting-ip")?.trim();
  const address = ip && ip.length <= 64 ? ip : "unknown-client-ip";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Rate limit identity cannot be derived");
  return rateLimitIdentityFromAddress(address, key);
}

const handler = createFlightSearchHandler({
  getRateLimitIdentity: rateLimitIdentity,
  rateLimit: async (identity, maxRequests, windowSeconds) => {
    const { data, error } = await serviceClient().rpc("consume_booking_edge_rate_limit", {
      p_user_id: identity,
      // The existing `inquiry` scope is a persistent, atomically incremented
      // bucket already supported by staging's deployed RPC and table.
      p_scope: "inquiry",
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });
    if (error || !data || typeof data.allowed !== "boolean") throw new Error("Rate limit storage unavailable");
    return { allowed: data.allowed, retryAfterSeconds: Number(data.retry_after_seconds) || windowSeconds };
  },
  loadRules,
  getPricingProvider,
  getDataProvider,
  allowedOrigins: (Deno.env.get("FLIGHT_SEARCH_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
});

Deno.serve(handler);
