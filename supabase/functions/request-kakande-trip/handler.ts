import { validateKakandeRequest, type KakandeTripRequest } from "./validation.ts";

const MAX_BODY_BYTES = 12_000;
const ADDRESS_LIMIT = 4;
const GLOBAL_LIMIT = 60;
const WINDOW_SECONDS = 900;
export const KAKANDE_GLOBAL_LIMIT_IDENTITY = "2b49d0b0-21d8-4f28-9f10-a7a09aeb4101";
export const KAKANDE_TURNSTILE_HOSTNAME = "luskam-travel-v2.vercel.app";
export const KAKANDE_TURNSTILE_ACTION = "kakande_trip_request";

export type TripSnapshot = {
  known: boolean;
  available: boolean;
  tripId: string;
  optionId: string;
  month: string;
  mode: "flight" | "road";
  travelDate: string;
  pricePerTravellerZmw: number;
  currency: "ZMW";
  tripUpdatedAt: string;
  optionUpdatedAt: string;
};
export type SavedTripSnapshot = Omit<TripSnapshot, "known" | "available" | "tripUpdatedAt" | "optionUpdatedAt">
  & { travellerCount: number; totalQuotedAmountZmw: number };
type TripOption = TripSnapshot;
type RateResult = { allowed: boolean; retryAfterSeconds: number };
export type SaveResult = { outcome: "created" | "duplicate" | "conflict" | "trip_unavailable" | "trip_changed" | "failed"; reference?: string; snapshot?: SavedTripSnapshot };
export type KakandeDependencies = {
  verifyCaptcha: (token: string) => Promise<{ success: boolean; hostname?: string; action?: string }>;
  resolveTrip: (tripId: string, mode: "flight" | "road") => Promise<TripOption>;
  rateLimitIdentity: (request: Request) => Promise<string>;
  rateLimit: (identity: string, limit: number, windowSeconds: number) => Promise<RateResult>;
  hashRequest: (request: KakandeTripRequest) => Promise<string>;
  saveRequest: (request: KakandeTripRequest, trip: TripSnapshot, idempotencyKey: string, hash: string, reference: string, userId: string | null) => Promise<SaveResult>;
  verifyAccessToken?: (token: string) => Promise<string | null>;
  allowedOrigins?: string[];
  now?: () => Date;
};

const DEFAULT_ORIGINS = [
  "https://luskam-travel-v2.vercel.app", "http://localhost:5173", "http://127.0.0.1:5173",
];
const validOrigin = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.origin === value && (parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname)));
  } catch { return false; }
};

async function readBody(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function createResponse(request: Request, allowed: Set<string>, body: unknown, status: number, retryAfter?: number) {
  const origin = request.headers.get("origin");
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
  if (origin && allowed.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  if (retryAfter !== undefined) headers.set("Retry-After", String(Math.max(1, retryAfter)));
  return new Response(JSON.stringify(body), { status, headers });
}

function error(request: Request, origins: Set<string>, status: number, code: string, message: string, retryAfter?: number) {
  return createResponse(request, origins, { error: { code, message } }, status, retryAfter);
}

export function createKakandeTripHandler(deps: KakandeDependencies) {
  const origins = new Set([...DEFAULT_ORIGINS, ...(deps.allowedOrigins ?? []).filter(validOrigin)]);
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    if (origin && !origins.has(origin)) return error(request, origins, 403, "ORIGIN_NOT_ALLOWED", "This website origin is not allowed.");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseCors(request, origins) });
    if (request.method !== "POST") return error(request, origins, 405, "METHOD_NOT_ALLOWED", "Use POST to submit a travel request.");
    if ((request.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return error(request, origins, 415, "UNSUPPORTED_MEDIA_TYPE", "Send a JSON request.");
    }
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return error(request, origins, 413, "REQUEST_TOO_LARGE", "The request is too large.");

    let body: unknown;
    try {
      const raw = await readBody(request);
      if (raw === null) return error(request, origins, 413, "REQUEST_TOO_LARGE", "The request is too large.");
      body = JSON.parse(raw);
    } catch { return error(request, origins, 400, "INVALID_REQUEST", "Check the request details and try again."); }
    const validated = validateKakandeRequest(body);
    if (!validated.request || !validated.idempotencyKey) return error(request, origins, 400, "INVALID_REQUEST", "Check the request details and try again.");
    let userId: string | null = null;
    const authorization = request.headers.get("authorization");
    if (authorization !== null) {
      const match = /^Bearer ([^\s,]+)$/i.exec(authorization.trim());
      if (!match) return error(request, origins, 401, "INVALID_AUTH_TOKEN", "Sign in again or remove the invalid authorization token.");
      if (!deps.verifyAccessToken) return error(request, origins, 503, "AUTH_VERIFICATION_UNAVAILABLE", "We couldn't verify your sign-in. Please try again.");
      try { userId = await deps.verifyAccessToken(match[1]); }
      catch { return error(request, origins, 503, "AUTH_VERIFICATION_UNAVAILABLE", "We couldn't verify your sign-in. Please try again."); }
      if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
        return error(request, origins, 401, "INVALID_AUTH_TOKEN", "Sign in again or remove the invalid authorization token.");
      }
      userId = userId.toLowerCase();
    }
    if (!validated.turnstileToken) return error(request, origins, 400, "CAPTCHA_REQUIRED", "Complete verification and try again.");

    let captcha: { success: boolean; hostname?: string; action?: string };
    try { captcha = await deps.verifyCaptcha(validated.turnstileToken); }
    catch { return error(request, origins, 503, "REQUEST_UNAVAILABLE", "We couldn't process the request. Try again later."); }
    if (!captcha.success || captcha.hostname !== KAKANDE_TURNSTILE_HOSTNAME || captcha.action !== KAKANDE_TURNSTILE_ACTION) {
      return error(request, origins, 403, "CAPTCHA_FAILED", "Verification could not be completed. Please try again.");
    }

    // Resolve the canonical option only after CAPTCHA. The database RPC makes
    // the final availability decision after checking replay claims, so a
    // legitimate retry still replays if staff later close the trip.
    let trip: TripOption;
    try { trip = await deps.resolveTrip(validated.request.tripId, validated.request.mode); }
    catch { return error(request, origins, 503, "REQUEST_UNAVAILABLE", "We couldn't process the request. Try again later."); }
    if (!trip.known || typeof trip.available !== "boolean"
      || trip.tripId !== validated.request.tripId || trip.mode !== validated.request.mode
      || typeof trip.optionId !== "string" || !trip.optionId
      || typeof trip.month !== "string" || !trip.month
      || typeof trip.travelDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(trip.travelDate)
      || !Number.isFinite(trip.pricePerTravellerZmw) || trip.pricePerTravellerZmw <= 0
      || trip.currency !== "ZMW" || !Number.isFinite(Date.parse(trip.tripUpdatedAt))
      || !Number.isFinite(Date.parse(trip.optionUpdatedAt))) {
      return error(request, origins, 409, "TRIP_UNAVAILABLE", "This trip is no longer available. Contact the travel team for upcoming dates.");
    }

    // Keep both persistent quotas ahead of the final availability decision:
    // the atomic RPC checks idempotency first (so closed-trip retries replay)
    // and then revalidates availability under database row locks. This also
    // ensures unavailable-option attempts remain covered by abuse controls.
    try {
      const addressIdentity = await deps.rateLimitIdentity(request);
      const addressLimit = await deps.rateLimit(addressIdentity, ADDRESS_LIMIT, WINDOW_SECONDS);
      if (!addressLimit.allowed) return error(request, origins, 429, "RATE_LIMITED", "Too many requests. Please try again later.", addressLimit.retryAfterSeconds);
      // Separate stable identity keeps this endpoint's global quota independent
      // of the flight quotation endpoint. The two RPCs are separate transactions.
      const globalLimit = await deps.rateLimit(KAKANDE_GLOBAL_LIMIT_IDENTITY, GLOBAL_LIMIT, WINDOW_SECONDS);
      if (!globalLimit.allowed) return error(request, origins, 429, "GLOBAL_RATE_LIMITED", "Requests are temporarily busy. Try again later.", globalLimit.retryAfterSeconds);
    } catch { return error(request, origins, 503, "RATE_LIMIT_UNAVAILABLE", "We couldn't process the request. Try again later."); }

    try {
      const requestHash = await deps.hashRequest(validated.request);
      const now = deps.now?.() ?? new Date();
      const reference = `KMR-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
      const saved = await deps.saveRequest(validated.request, trip, validated.idempotencyKey, requestHash, reference, userId);
      if (saved.outcome === "trip_unavailable") return error(request, origins, 409, "TRIP_UNAVAILABLE", "This trip is no longer available. Contact the travel team for upcoming dates.");
      if (saved.outcome === "trip_changed") return error(request, origins, 409, "TRIP_CHANGED", "This trip option changed. Refresh the page and try again.");
      if (saved.outcome === "conflict") return error(request, origins, 409, "REQUEST_CONFLICT", "This submission key was used for different request details. Start a new request.");
      if ((saved.outcome === "created" || saved.outcome === "duplicate") && saved.reference
        && /^KMR-\d{8}-[A-F0-9]{16}$/.test(saved.reference) && saved.snapshot
        && saved.snapshot.tripId === validated.request.tripId && saved.snapshot.optionId
        && saved.snapshot.month && /^\d{4}-\d{2}-\d{2}$/.test(saved.snapshot.travelDate)
        && saved.snapshot.mode === validated.request.mode
        && saved.snapshot.travellerCount === validated.request.travellers
        && Number.isFinite(saved.snapshot.pricePerTravellerZmw) && saved.snapshot.pricePerTravellerZmw > 0
        && Number.isFinite(saved.snapshot.totalQuotedAmountZmw) && saved.snapshot.totalQuotedAmountZmw > 0
        && Math.round(saved.snapshot.totalQuotedAmountZmw * 100)
          === Math.round(saved.snapshot.pricePerTravellerZmw * 100) * saved.snapshot.travellerCount
        && saved.snapshot.currency === "ZMW") {
        return createResponse(request, origins, { reference: saved.reference, duplicate: saved.outcome === "duplicate", snapshot: saved.snapshot }, 200);
      }
      return error(request, origins, 503, "REQUEST_UNAVAILABLE", "We couldn't confirm that the request was saved. Try again later.");
    } catch { return error(request, origins, 503, "REQUEST_UNAVAILABLE", "We couldn't confirm that the request was saved. Try again later."); }
  };
}

function responseCors(request: Request, allowed: Set<string>): Headers {
  const headers = new Headers({ "Vary": "Origin", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" });
  const origin = request.headers.get("origin");
  if (origin && allowed.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}
