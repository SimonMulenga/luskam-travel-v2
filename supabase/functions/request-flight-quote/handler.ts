export type FlightQuoteRequest = {
  search: {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate: string | null;
    tripType: "oneway" | "return";
    passengers: { adults: number; children: number; infants: number };
    cabinClass: "economy" | "premium_economy" | "business" | "first";
  };
  contact: { fullName: string; email: string; phone: string };
  specialRequests: string;
};

export type SavedRequest = { outcome: "created" | "duplicate" | "conflict" | "failed"; reference?: string };
export type CaptchaResult = { success: boolean; hostname?: string; action?: string };
export type FlightQuoteDependencies = {
  verifyCaptcha: (token: string) => Promise<CaptchaResult>;
  rateLimitIdentity: (request: Request) => Promise<string>;
  rateLimit: (identity: string, maxRequests: number, windowSeconds: number) => Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  hashRequest?: (request: FlightQuoteRequest) => Promise<string>;
  saveRequest: (request: FlightQuoteRequest, idempotencyKey: string, requestHash: string, dedupeKey: string, reference: string) => Promise<SavedRequest>;
  allowedOrigins?: string[];
  expectedCaptchaHostname?: string;
  expectedCaptchaAction?: string;
  now?: () => Date;
};

/** Supabase's gateway-reported address only. This does not authenticate the header's provenance. */
export function gatewayReportedClientAddress(request: Request): string | null {
  const raw = request.headers.get("cf-connecting-ip");
  if (!raw || raw !== raw.trim() || raw.length > 45 || raw.includes(",") || /\s/.test(raw)) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) {
    const octets = raw.split(".").map(Number);
    return octets.every((part) => part >= 0 && part <= 255) ? octets.join(".") : null;
  }
  if (!raw.includes(":")) return null;
  try {
    const hostname = new URL(`http://[${raw}]/`).hostname;
    return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1).toLowerCase() : null;
  } catch { return null; }
}

const MAX_BODY_BYTES = 12_000;
const LIMIT = 4;
const WINDOW_SECONDS = 15 * 60;
const GLOBAL_LIMIT = 60;
const GLOBAL_RATE_LIMIT_IDENTITY = "9f1d9f00-9e00-4c9f-9d00-000000000001";
const EXPECTED_CAPTCHA_HOSTNAME = "luskam-travel-v2.vercel.app";
const EXPECTED_CAPTCHA_ACTION = "flight_quote_request";
const DEFAULT_ORIGINS = [
  "https://luskam-travel-v2.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];
const encoder = new TextEncoder();
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function corsOrigins(configured: string[] = []) {
  const valid = (value: string) => {
    try {
      const url = new URL(value);
      return url.origin === value && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
    } catch { return false; }
  };
  return new Set([...DEFAULT_ORIGINS, ...configured.map((value) => value.trim()).filter(valid)]);
}

function headersFor(origin: string | null, origins: Set<string>) {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-idempotency-key",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  });
  if (origin && origins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function response(body: unknown, status: number, headers: Headers, retryAfter?: number) {
  headers.set("Content-Type", "application/json");
  if (retryAfter !== undefined) headers.set("Retry-After", String(retryAfter));
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(headers: Headers, requestId: string, status: number, code: string, message: string, retryAfter?: number) {
  return response({ error: { code, message, requestId } }, status, headers, retryAfter);
}

async function readBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return null; }
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function cleanText(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const cleaned = stripControlCharacters(value.normalize("NFKC")).trim();
  return cleaned.length > 0 && cleaned.length <= max ? cleaned : null;
}

function stripControlCharacters(value: string) {
  return Array.from(value).filter((character) => {
    const code = character.codePointAt(0) ?? 0;
    return !(code < 32 || (code >= 127 && code <= 159));
  }).join("");
}

export function validateFlightQuoteRequest(value: unknown, today: string): { request?: FlightQuoteRequest; idempotencyKey?: string } {
  if (!isObject(value) || Object.keys(value).some((key) => !["search", "contact", "specialRequests", "idempotencyKey", "turnstileToken"].includes(key))) return {};
  const idempotencyKey = value.idempotencyKey;
  if (typeof idempotencyKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) return {};
  if (!isObject(value.search) || Object.keys(value.search).some((key) => !["origin", "destination", "departureDate", "returnDate", "tripType", "passengers", "cabinClass"].includes(key))) return {};
  const input = value.search;
  const origin = typeof input.origin === "string" ? input.origin.trim().toUpperCase() : "";
  const destination = typeof input.destination === "string" ? input.destination.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || origin === destination) return {};
  if (!isCalendarDate(input.departureDate) || input.departureDate < today) return {};
  const departureDate = input.departureDate;
  let returnDate: string | null = null;
  if (input.returnDate !== null && input.returnDate !== "") {
    if (!isCalendarDate(input.returnDate) || input.returnDate < departureDate) return {};
    returnDate = input.returnDate;
  }
  if (input.tripType !== (returnDate ? "return" : "oneway")) return {};
  if (!isObject(input.passengers) || Object.keys(input.passengers).some((key) => !["adults", "children", "infants"].includes(key))) return {};
  const { adults, children, infants } = input.passengers;
  if (!Number.isInteger(adults) || (adults as number) < 1 || (adults as number) > 9
    || !Number.isInteger(children) || (children as number) < 0 || (children as number) > 8
    || !Number.isInteger(infants) || (infants as number) < 0 || (infants as number) > 8
    || (adults as number) + (children as number) + (infants as number) > 17 || (infants as number) > (adults as number)) return {};
  const cabinClass = typeof input.cabinClass === "string" ? input.cabinClass.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  if (!["economy", "premium_economy", "business", "first"].includes(cabinClass)) return {};
  if (!isObject(value.contact) || Object.keys(value.contact).some((key) => !["fullName", "email", "phone"].includes(key))) return {};
  const fullName = cleanText(value.contact.fullName, 120);
  const email = cleanText(value.contact.email, 254)?.toLowerCase() ?? null;
  const phone = cleanText(value.contact.phone, 32);
  const specialRequests = value.specialRequests === undefined
    ? ""
    : typeof value.specialRequests === "string"
      ? stripControlCharacters(value.specialRequests.normalize("NFKC")).trim()
      : null;
  if (!fullName || fullName.length < 2 || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !phone || !/^[+()\d.\s-]{7,32}$/.test(phone) || !phone.replace(/\D/g, "").length
    || specialRequests === null || specialRequests.length > 1000) return {};
  return {
    request: {
      search: { origin, destination, departureDate, returnDate, tripType: returnDate ? "return" : "oneway", passengers: { adults: adults as number, children: children as number, infants: infants as number }, cabinClass: cabinClass as FlightQuoteRequest["search"]["cabinClass"] },
      contact: { fullName, email, phone }, specialRequests,
    },
    idempotencyKey,
  };
}

async function requestHash(request: FlightQuoteRequest) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(request))));
  return btoa(String.fromCharCode(...digest)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function duplicateFingerprint(hash: string) {
  // Hash covers the canonical, allowlisted request including contact fields.
  // No contact value is persisted in logs or used as an unhashed key.
  return Promise.resolve(hash);
}

export function createFlightQuoteHandler(deps: FlightQuoteDependencies) {
  const origins = corsOrigins(deps.allowedOrigins);
  const now = deps.now ?? (() => new Date());
  const expectedCaptchaHostname = deps.expectedCaptchaHostname ?? EXPECTED_CAPTCHA_HOSTNAME;
  const expectedCaptchaAction = deps.expectedCaptchaAction ?? EXPECTED_CAPTCHA_ACTION;
  return async (request: Request) => {
    const requestId = crypto.randomUUID();
    const origin = request.headers.get("origin");
    const headers = headersFor(origin, origins);
    if (request.method === "OPTIONS") return new Response(null, { status: origin && !origins.has(origin) ? 403 : 204, headers });
    if (request.method !== "POST") return errorResponse(headers, requestId, 405, "METHOD_NOT_ALLOWED", "Use POST to send a flight quotation request.");
    if (origin && !origins.has(origin)) return errorResponse(headers, requestId, 403, "ORIGIN_NOT_ALLOWED", "This website origin is not allowed.");
    const mediaType = (request.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
    if (mediaType !== "application/json") return errorResponse(headers, requestId, 415, "UNSUPPORTED_MEDIA_TYPE", "Send a JSON request.");
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) return errorResponse(headers, requestId, 413, "REQUEST_TOO_LARGE", "The request is too large.");

    let parsed: unknown;
    try {
      const raw = await readBody(request);
      if (raw === null) return errorResponse(headers, requestId, 413, "REQUEST_TOO_LARGE", "The request is too large.");
      parsed = JSON.parse(raw);
    } catch { return errorResponse(headers, requestId, 400, "INVALID_REQUEST", "Check the request details and try again."); }
    const validated = validateFlightQuoteRequest(parsed, now().toISOString().slice(0, 10));
    if (!validated.request || !validated.idempotencyKey) return errorResponse(headers, requestId, 400, "INVALID_REQUEST", "Check your travel and contact details and try again.");

    const suppliedToken = isObject(parsed) ? parsed.turnstileToken : undefined;
    if (typeof suppliedToken !== "string" || suppliedToken.trim().length === 0 || suppliedToken.length > 2048) {
      return errorResponse(headers, requestId, 400, "CAPTCHA_REQUIRED", "Complete the verification and try again.");
    }

    try {
      const captcha = await deps.verifyCaptcha(suppliedToken);
      if (!captcha.success || captcha.hostname !== expectedCaptchaHostname || captcha.action !== expectedCaptchaAction) {
        return errorResponse(headers, requestId, 403, "CAPTCHA_FAILED", "Verification could not be completed. Please try again.");
      }
    } catch {
      console.error(JSON.stringify({ event: "flight_quote_captcha_unavailable", requestId }));
      return errorResponse(headers, requestId, 503, "REQUEST_UNAVAILABLE", "We couldn't process your request. Please try again later.");
    }

    // CAPTCHA is checked before either persistent limiter RPC. The address-derived
    // identity is supplementary abuse control, not an authenticated caller identity.
    try {
      const identity = await deps.rateLimitIdentity(request);
      const addressLimit = await deps.rateLimit(identity, LIMIT, WINDOW_SECONDS);
      if (!addressLimit.allowed) return errorResponse(headers, requestId, 429, "RATE_LIMITED", "Too many requests. Please try again later.", addressLimit.retryAfterSeconds);

      // This is a second, independent RPC/transaction. Its identity is shared by
      // all submissions; PostgreSQL serializes each call for this identity.
      const globalLimit = await deps.rateLimit(GLOBAL_RATE_LIMIT_IDENTITY, GLOBAL_LIMIT, WINDOW_SECONDS);
      if (!globalLimit.allowed) return errorResponse(headers, requestId, 429, "GLOBAL_RATE_LIMITED", "Quotation requests are temporarily busy. Please try again later.", globalLimit.retryAfterSeconds);
    } catch {
      console.error(JSON.stringify({ event: "flight_quote_rate_limit_unavailable", requestId }));
      return errorResponse(headers, requestId, 503, "REQUEST_UNAVAILABLE", "We couldn't process your request. Please try again later.");
    }

    try {
      const hash = deps.hashRequest
        ? await deps.hashRequest(validated.request)
        : await requestHash(validated.request);
      const timestamp = now();
      const dedupeKey = await duplicateFingerprint(hash);
      const reference = `LTA-${timestamp.toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
      const result = await deps.saveRequest(validated.request, validated.idempotencyKey, hash, dedupeKey, reference);
      if (result.outcome === "conflict") return errorResponse(headers, requestId, 409, "REQUEST_CONFLICT", "This submission key was already used for different request details. Start a new request.");
      if ((result.outcome === "created" || result.outcome === "duplicate") && result.reference) {
        return response({ reference: result.reference, duplicate: result.outcome === "duplicate" }, 200, headers);
      }
      console.error(JSON.stringify({ event: "flight_quote_save_failed", requestId }));
      return errorResponse(headers, requestId, 503, "REQUEST_UNAVAILABLE", "We couldn't process your request. Please try again later.");
    } catch {
      console.error(JSON.stringify({ event: "flight_quote_save_failed", requestId }));
      return errorResponse(headers, requestId, 503, "REQUEST_UNAVAILABLE", "We couldn't process your request. Please try again later.");
    }
  };
}
