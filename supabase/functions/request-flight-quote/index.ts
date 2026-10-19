import { createClient } from "npm:@supabase/supabase-js@2";
import { createFlightQuoteHandler, gatewayReportedClientAddress, type FlightQuoteRequest } from "./handler.ts";
import { rateLimitIdentityFromAddress } from "../_shared/rateLimitIdentity.ts";
import { verifyTurnstileToken } from "./turnstile.ts";
import { verifyCustomerAccessToken } from "../_shared/verifyCustomerAccessToken.ts";

const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const fingerprintSecret = Deno.env.get("FLIGHT_QUOTE_FINGERPRINT_SECRET");
const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
const authApiKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
const encoder = new TextEncoder();
async function fingerprintRequest(request: FlightQuoteRequest) {
  if (!fingerprintSecret || fingerprintSecret.length < 32) throw new Error("request service unavailable");
  const key = await crypto.subtle.importKey("raw", encoder.encode(fingerprintSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(JSON.stringify(request))));
  return btoa(String.fromCharCode(...digest)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
const defaultClient = () => {
  if (!url || !serviceKey) throw new Error("request service unavailable");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
};

const handler = createFlightQuoteHandler({
  verifyAccessToken: async (token) => {
    if (!url || !authApiKey) throw new Error("auth verification unavailable");
    return verifyCustomerAccessToken(url, authApiKey, token);
  },
  verifyCaptcha: (token) => verifyTurnstileToken(token, turnstileSecret),
  rateLimitIdentity: async (request) => {
    const address = gatewayReportedClientAddress(request);
    if (!address || !serviceKey) throw new Error("rate limit identity unavailable");
    return rateLimitIdentityFromAddress(address, serviceKey, "luskam-flight-quote-v1");
  },
  hashRequest: fingerprintRequest,
  rateLimit: async (identity, maxRequests, windowSeconds) => {
    const { data, error } = await defaultClient().rpc("consume_flight_quote_rate_limit", {
      p_identity: identity,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });
    if (error || !data || typeof data.allowed !== "boolean"
      || !Number.isInteger(data.retry_after_seconds) || data.retry_after_seconds < 1) throw new Error("rate limiter unavailable");
    return { allowed: data.allowed, retryAfterSeconds: data.retry_after_seconds };
  },
  saveRequest: async (request: FlightQuoteRequest, idempotencyKey, requestHash, dedupeKey, reference, userId) => {
    const { data, error } = await defaultClient().rpc("create_flight_quote_request_once_for_customer", {
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
      p_dedupe_key: dedupeKey,
      p_reference: reference,
      p_origin: request.search.origin,
      p_destination: request.search.destination,
      p_departure_date: request.search.departureDate,
      p_return_date: request.search.returnDate,
      p_trip_type: request.search.tripType,
      p_adults: request.search.passengers.adults,
      p_children: request.search.passengers.children,
      p_infants: request.search.passengers.infants,
      p_cabin_class: request.search.cabinClass,
      p_customer_name: request.contact.fullName,
      p_customer_email: request.contact.email,
      p_customer_phone: request.contact.phone,
      p_special_requests: request.specialRequests,
      p_user_id: userId,
    });
    if (error || !data || !["created", "duplicate", "conflict"].includes(data.outcome)) {
      return { outcome: "failed" as const };
    }
    return { outcome: data.outcome, reference: data.reference };
  },
  allowedOrigins: (Deno.env.get("BOOKING_ALLOWED_ORIGINS") ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean),
});

Deno.serve(handler);
