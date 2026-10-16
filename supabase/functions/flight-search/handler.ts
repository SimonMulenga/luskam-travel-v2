import type { FlightSearchQuery, FlightSearchResult } from "../_shared/flight/types.ts";
import { normalizeCabin } from "../_shared/flight/types.ts";
import type { PricingRule } from "../_shared/pricingTypes.ts";
import { applyPricingRuleOrThrow, pickPricingRule } from "../_shared/pricingCore.ts";
import type { FlightProvider } from "../_shared/flight/types.ts";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_REQUESTS = 5;
const WINDOW_SECONDS = 10 * 60;
const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";
const DEFAULT_ORIGINS = [
  "https://luskam-travel-v2.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

type RequestBody = {
  from: string;
  to: string;
  depart: string;
  ret: string | null;
  cabin: string;
  adults: number;
  children: number;
  infants: number;
};

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export interface FlightSearchDependencies {
  getRateLimitIdentity: (req: Request) => Promise<string>;
  rateLimit: (identity: string, maxRequests: number, windowSeconds: number) => Promise<RateLimitResult>;
  loadRules: () => Promise<PricingRule[]>;
  getPricingProvider: () => FlightProvider;
  getDataProvider: () => FlightProvider;
  allowedOrigins?: string[];
}

const json = (body: unknown, status: number, headers: HeadersInit = {}) => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
};

function normalizeAllowedOrigins(configured: string[] = []) {
  const valid = (origin: string) => {
    try {
      const parsed = new URL(origin);
      return parsed.origin === origin && (parsed.protocol === "https:" || ["http://localhost", "http://127.0.0.1"].some((local) => origin.startsWith(local + ":") || origin === local));
    } catch {
      return false;
    }
  };
  return new Set([...DEFAULT_ORIGINS, ...configured.map((origin) => origin.trim()).filter(valid)]);
}

function corsHeaders(origin: string | null, origins: Set<string>) {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Vary": "Origin",
  });
  if (origin && origins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
  headers: HeadersInit,
  retryAfterSeconds?: number,
) {
  const responseHeaders = new Headers(headers);
  if (retryAfterSeconds !== undefined) responseHeaders.set("Retry-After", String(retryAfterSeconds));
  return json({
    flights: [],
    source: "none",
    warning: message,
    error: message,
    errorCode: code,
    requestId,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  }, status, responseHeaders);
}

async function readLimitedBody(req: Request): Promise<string | null> {
  const length = Number(req.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateBody(value: unknown): { body?: RequestBody; error?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "INVALID_SEARCH" };
  const input = value as Record<string, unknown>;
  const allowedKeys = new Set(["from", "to", "depart", "ret", "cabin", "adults", "children", "infants"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) return { error: "INVALID_SEARCH" };

  if (typeof input.from !== "string" || !/^[A-Za-z]{3}$/.test(input.from)
    || typeof input.to !== "string" || !/^[A-Za-z]{3}$/.test(input.to)) return { error: "INVALID_AIRPORT" };
  const from = input.from.toUpperCase();
  const to = input.to.toUpperCase();
  if (from === to) return { error: "INVALID_AIRPORT" };

  if (!isCalendarDate(input.depart) || input.depart < new Date().toISOString().slice(0, 10)) return { error: "INVALID_DATE" };
  let ret: string | null = null;
  if (input.ret !== null && input.ret !== "") {
    if (!isCalendarDate(input.ret) || input.ret < input.depart) return { error: "INVALID_DATE" };
    ret = input.ret;
  }

  const adults = input.adults;
  const children = input.children;
  const infants = input.infants;
  if (!Number.isInteger(adults) || (adults as number) < 1 || (adults as number) > 9
    || !Number.isInteger(children) || (children as number) < 0 || (children as number) > 8
    || !Number.isInteger(infants) || (infants as number) < 0 || (infants as number) > 8
    || (adults as number) + (children as number) + (infants as number) > 17
    || (infants as number) > (adults as number)) return { error: "INVALID_PASSENGERS" };

  if (typeof input.cabin !== "string") return { error: "INVALID_CABIN" };
  const cabinKey = input.cabin.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!["economy", "premium_economy", "business", "first"].includes(cabinKey)) return { error: "INVALID_CABIN" };

  return {
    body: {
      from,
      to,
      depart: input.depart,
      ret,
      cabin: normalizeCabin(cabinKey),
      adults: adults as number,
      children: children as number,
      infants: infants as number,
    },
  };
}

const hhmm = (iso: string | null) => {
  if (!iso) return "--:--";
  const match = iso.match(/T(\d{2}):(\d{2})/);
  if (match) return `${match[1]}:${match[2]}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "--:--" : `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
};

const durationLabel = (minutes: number | null) => minutes == null ? "—" : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
const stopsLabel = (stops: number) => stops === 0 ? "Direct" : stops === 1 ? "1 stop" : `${stops} stops`;
const publicErrorMessage = "Flight search is temporarily unavailable. Please try again later or contact our travel desk.";

export function createFlightSearchHandler(deps: FlightSearchDependencies) {
  const origins = normalizeAllowedOrigins(deps.allowedOrigins);

  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin");
    const headers = corsHeaders(origin, origins);
    const requestId = crypto.randomUUID();

    if (req.method === "OPTIONS") {
      if (origin && !origins.has(origin)) return new Response(null, { status: 403, headers });
      return new Response(null, { status: 204, headers });
    }
    if (req.method !== "POST") return errorResponse(405, "METHOD_NOT_ALLOWED", "Use POST to search flights.", requestId, headers);
    if (origin && !origins.has(origin)) return errorResponse(403, "ORIGIN_NOT_ALLOWED", "This website origin is not allowed.", requestId, headers);
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Send a JSON flight search request.", requestId, headers);
    const declaredLength = Number(req.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return errorResponse(413, "REQUEST_TOO_LARGE", "The search request is too large.", requestId, headers);

    let identity: string;
    try {
      identity = await deps.getRateLimitIdentity(req);
      const limit = await deps.rateLimit(identity, MAX_REQUESTS, WINDOW_SECONDS);
      if (!limit.allowed) return errorResponse(429, "RATE_LIMITED", "Too many flight searches. Please try again shortly.", requestId, headers, limit.retryAfterSeconds);
    } catch {
      console.error("flight-search rate-limit unavailable", { requestId });
      return errorResponse(503, "SEARCH_UNAVAILABLE", publicErrorMessage, requestId, headers);
    }

    let raw: string | null;
    try {
      raw = await readLimitedBody(req);
    } catch {
      return errorResponse(400, "INVALID_BODY", "The search request could not be read.", requestId, headers);
    }
    if (raw === null) return errorResponse(413, "REQUEST_TOO_LARGE", "The search request is too large or invalid.", requestId, headers);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return errorResponse(400, "INVALID_JSON", "The search request is not valid JSON.", requestId, headers);
    }
    const validated = validateBody(parsed);
    if (!validated.body) return errorResponse(400, validated.error ?? "INVALID_SEARCH", "Check the airport, dates, passenger counts, and cabin class.", requestId, headers);

    const body = validated.body;
    const query: FlightSearchQuery = {
      origin: body.from,
      destination: body.to,
      departureDate: body.depart,
      returnDate: body.ret,
      tripType: body.ret ? "return" : "oneway",
      cabinClass: normalizeCabin(body.cabin),
      passengers: { adults: body.adults, children: body.children, infants: body.infants },
    };
    const totalPax = body.adults + body.children + body.infants;

    let rules: PricingRule[];
    try {
      rules = await deps.loadRules();
    } catch {
      console.error("flight-search pricing configuration unavailable", { requestId });
      return errorResponse(503, "PRICING_UNAVAILABLE", publicErrorMessage, requestId, headers);
    }
    if (rules.length === 0) {
      return errorResponse(503, "PRICING_UNAVAILABLE", "Flight quotations are temporarily unavailable while approved pricing is configured.", requestId, headers);
    }

    let results: FlightSearchResult[];
    try {
      results = await deps.getPricingProvider().searchFlights(query);
    } catch {
      console.error("flight-search provider request failed", { requestId, provider: "flightapi" });
      return fallbackOrUnavailable(deps, query, body, requestId, headers);
    }

    const validResults = results.filter((result) =>
      result.kind === "offer"
      && typeof result.supplierPrice === "number"
      && Number.isFinite(result.supplierPrice)
      && result.supplierPrice > 0
      && result.currency === "USD"
      && (result.originCode ?? body.from) === body.from
      && (result.destinationCode ?? body.to) === body.to
      && result.departureDateTime?.slice(0, 10) === body.depart
      && result.cabinClass === query.cabinClass
    );
    if (validResults.length === 0) return fallbackOrUnavailable(deps, query, body, requestId, headers);

    try {
      const pricedFlights = validResults.map((result) => {
        const context = {
          supplierPrice: result.supplierPrice ?? 0,
          airlineCode: result.airlineCode ?? undefined,
          origin: result.originCode ?? body.from,
          destination: result.destinationCode ?? body.to,
          cabin: query.cabinClass,
          isDomestic: (result.originCode ?? body.from).slice(0, 2) === (result.destinationCode ?? body.to).slice(0, 2),
        };
        const pricing = applyPricingRuleOrThrow(pickPricingRule(rules, context), context);
        return {
          id: result.id,
          airline: result.airline ?? "Airline",
          code: result.flightNumber ?? result.airlineCode ?? "—",
          from: result.originCode ?? body.from,
          to: result.destinationCode ?? body.to,
          depart: hhmm(result.departureDateTime),
          arrive: hhmm(result.arrivalDateTime),
          duration: durationLabel(result.durationMinutes),
          stops: stopsLabel(result.stops),
          cabin: body.cabin,
          price: Math.round(pricing.customer_price / totalPax),
          currency: result.currency ?? "USD",
          fareType: "Live fare",
          live: true,
          priced: true,
          providerReference: result.providerReference,
        };
      }).sort((a, b) => a.price - b.price).slice(0, 40);
      return json({ flights: pricedFlights, source: "live_fares" }, 200, headers);
    } catch {
      console.error("flight-search no applicable approved pricing rule", { requestId });
      return errorResponse(503, "PRICING_UNAVAILABLE", "No approved pricing rule applies to these fares. Please contact our travel desk.", requestId, headers);
    }
  };
}

async function fallbackOrUnavailable(
  deps: FlightSearchDependencies,
  query: FlightSearchQuery,
  body: RequestBody,
  requestId: string,
  headers: Headers,
) {
  // A misconfigured FLIGHT_PROVIDER=flightapi must never issue a second paid
  // FlightAPI request after the pricing provider has already been called.
  let provider: FlightProvider;
  try {
    provider = deps.getDataProvider();
    if (provider.name === "flightapi" || !provider.capabilities.aviationData) {
      return errorResponse(503, "FARES_UNAVAILABLE", publicErrorMessage, requestId, headers);
    }
    const schedules = await provider.searchFlights(query);
    const flights = schedules.slice(0, 30).map((result) => ({
      id: result.id,
      airline: result.airline ?? "Scheduled carrier",
      code: result.flightNumber ?? "—",
      from: result.originCode ?? body.from,
      to: result.destinationCode ?? body.to,
      depart: hhmm(result.departureDateTime),
      arrive: hhmm(result.arrivalDateTime),
      duration: durationLabel(result.durationMinutes),
      stops: stopsLabel(result.stops),
      cabin: body.cabin,
      price: null,
      currency: null,
      fareType: "Flight information",
      live: true,
      priced: false,
      status: result.status,
    }));
    if (flights.length === 0) return errorResponse(503, "FARES_UNAVAILABLE", publicErrorMessage, requestId, headers);
    return json({ flights, source: "flight_information", warning: "Live fares are unavailable; these schedules are for information only." }, 200, headers);
  } catch {
    return errorResponse(503, "FARES_UNAVAILABLE", publicErrorMessage, requestId, headers);
  }
}
