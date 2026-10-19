import { createClient } from "npm:@supabase/supabase-js@2";
import { rateLimitIdentityFromAddress } from "../_shared/rateLimitIdentity.ts";
import { createKakandeTripHandler, type SavedTripSnapshot, type TripSnapshot } from "./handler.ts";
import { gatewayReportedAddress } from "./validation.ts";
import { verifyKakandeTurnstile } from "./turnstile.ts";
import type { KakandeTripRequest } from "./validation.ts";
import { verifyCustomerAccessToken } from "../_shared/verifyCustomerAccessToken.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
const fingerprintSecret = Deno.env.get("KAKANDE_REQUEST_FINGERPRINT_SECRET");
const authApiKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
const encoder = new TextEncoder();

async function hmac(value: string) {
  if (!fingerprintSecret || fingerprintSecret.trim().length < 32) throw new Error("request_service_unavailable");
  const key = await crypto.subtle.importKey("raw", encoder.encode(fingerprintSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return btoa(String.fromCharCode(...digest)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function client() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("request_service_unavailable");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function rateLimit(identity: string, maxRequests: number, windowSeconds: number) {
  const { data, error } = await client().rpc("consume_flight_quote_rate_limit", {
    p_identity: identity, p_max_requests: maxRequests, p_window_seconds: windowSeconds,
  });
  if (error || !data || typeof data.allowed !== "boolean"
    || !Number.isInteger(data.retry_after_seconds) || data.retry_after_seconds < 1) throw new Error("rate_limit_unavailable");
  return { allowed: data.allowed, retryAfterSeconds: data.retry_after_seconds };
}

const allowedOrigins = (Deno.env.get("KAKANDE_ALLOWED_ORIGINS") ?? "").split(",").map((value) => value.trim()).filter(Boolean);

Deno.serve(createKakandeTripHandler({
  verifyAccessToken: async (token) => {
    if (!supabaseUrl || !authApiKey) throw new Error("auth verification unavailable");
    return verifyCustomerAccessToken(supabaseUrl, authApiKey, token);
  },
  verifyCaptcha: (token) => verifyKakandeTurnstile(token, turnstileSecret),
  resolveTrip: async (tripId, mode) => {
    const { data, error } = await client().rpc("get_kakande_trip_option", { p_trip_id: tripId, p_mode: mode });
    if (error || !data || typeof data.known !== "boolean" || typeof data.available !== "boolean") throw new Error("trip_lookup_failed");
    return {
      known: data.known,
      available: data.available,
      tripId: data.trip_id,
      optionId: data.option_id,
      month: data.month,
      mode: data.mode,
      travelDate: data.travel_date,
      pricePerTravellerZmw: Number(data.price_per_traveller_zmw),
      currency: data.currency,
      tripUpdatedAt: data.trip_updated_at,
      optionUpdatedAt: data.option_updated_at,
    } as TripSnapshot;
  },
  rateLimitIdentity: async (request) => {
    const address = gatewayReportedAddress(request);
    if (!address || !fingerprintSecret || fingerprintSecret.trim().length < 32) throw new Error("rate_limit_identity_unavailable");
    return rateLimitIdentityFromAddress(address, fingerprintSecret, "luskam-kakande-trip-v1");
  },
  rateLimit,
  hashRequest: (request: KakandeTripRequest) => hmac(`luskam-kakande-request-fingerprint-v2:${JSON.stringify(request)}`),
  saveRequest: async (request, trip, idempotencyKey, requestHash, reference, userId) => {
    const { data, error } = await client().rpc("create_kakande_ministry_request_once_for_customer", {
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
      p_dedupe_key: requestHash,
      p_reference: reference,
      p_trip_id: request.tripId,
      p_mode: request.mode,
      p_travellers: request.travellers,
      p_trip_updated_at: trip.tripUpdatedAt,
      p_option_updated_at: trip.optionUpdatedAt,
      p_customer_name: request.fullName,
      p_customer_email: request.email,
      p_customer_phone: request.phone,
      p_customer_notes: request.notes,
      p_user_id: userId,
    });
    if (error || !data || !["created", "duplicate", "conflict", "trip_unavailable", "trip_changed"].includes(data.outcome)) return { outcome: "failed" as const };
    let snapshot: SavedTripSnapshot | undefined;
    if (data.snapshot && typeof data.snapshot === "object") {
      const row = data.snapshot as Record<string, unknown>;
      snapshot = {
        tripId: String(row.tripId ?? ""),
        optionId: String(row.optionId ?? ""),
        month: String(row.month ?? ""),
        mode: row.mode as "flight" | "road",
        travelDate: String(row.travelDate ?? ""),
        pricePerTravellerZmw: Number(row.pricePerTravellerZmw),
        travellerCount: Number(row.travellerCount),
        totalQuotedAmountZmw: Number(row.totalQuotedAmountZmw),
        currency: row.currency as "ZMW",
      };
    }
    return { outcome: data.outcome, reference: data.reference, snapshot };
  },
  allowedOrigins,
}));
