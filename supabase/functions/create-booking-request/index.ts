import { createClient } from "npm:@supabase/supabase-js@2";
import { getPricingProvider } from "../_shared/flight/registry.ts";
import { normalizeCabin, type CabinClass, type FlightSearchQuery } from "../_shared/flight/types.ts";
import { loadRules, priceOffer } from "../_shared/pricing.ts";
import { bookingCorsHeaders, bookingJson, isAllowedBookingOrigin } from "./http.ts";
import { hasClientControlledFields, isStrictCalendarDate, isUuid, passengerTypesMatch, quoteMatchesCurrent, sanitizeInquiryDetails, unpricedBookingDefaults } from "./validation.ts";

type Obj = Record<string, unknown>;
type QuoteClaims = {
  uid: string;
  exp: number;
  nonce: string;
  query: FlightSearchQuery;
  providerReference: string;
  pricing: { supplier_price: number; markup_amount: number; customer_price: number; pricing_rule_id: string; pricing_rule_name: string };
  currency: string;
  flight: Record<string, unknown>;
};
const isObj = (value: unknown): value is Obj => !!value && typeof value === "object" && !Array.isArray(value);
const MAX_BODY_BYTES = 32 * 1024;
const bad = (req: Request, message: string, status = 400, requestId = crypto.randomUUID(), headers: Record<string, string> = {}) =>
  bookingJson(req, { error: message, requestId }, status, headers);

function validDate(value: unknown): value is string { return isStrictCalendarDate(value); }

async function readLimitedText(req: Request, maxBytes: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function validatePassengers(value: unknown, counts: FlightSearchQuery["passengers"]) {
  if (!Array.isArray(value) || value.length !== counts.adults + counts.children + counts.infants || value.length < 1 || value.length > 17) throw new Error("invalid_passengers");
  const types = ["adult", "child", "infant"];
  return value.map((entry) => {
    if (!isObj(entry) || !types.includes(String(entry.type).toLowerCase()) || typeof entry.firstName !== "string" || typeof entry.lastName !== "string") throw new Error("invalid_passengers");
    const firstName = entry.firstName.trim(); const lastName = entry.lastName.trim();
    if (!firstName || firstName.length > 80 || !lastName || lastName.length > 80) throw new Error("invalid_passengers");
    return { type: String(entry.type).toLowerCase(), title: typeof entry.title === "string" ? entry.title.slice(0, 12) : "", firstName, lastName };
  });
}

function queryFrom(body: Obj): FlightSearchQuery {
  const search = body.search;
  if (!isObj(search)) throw new Error("invalid_search");
  const origin = String(search.origin ?? "").toUpperCase(); const destination = String(search.destination ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || origin === destination) throw new Error("invalid_search");
  const departureDate = search.departureDate;
  if (!validDate(departureDate) || departureDate < new Date().toISOString().slice(0, 10)) throw new Error("invalid_search");
  const returnInput = search.returnDate;
  let returnDate: string | null = null;
  if (returnInput != null && returnInput !== "") {
    if (!validDate(returnInput) || returnInput < departureDate) throw new Error("invalid_search");
    returnDate = returnInput;
  }
  const counts = search.passengers;
  if (!isObj(counts)) throw new Error("invalid_search");
  const adults = Number(counts.adults); const children = Number(counts.children); const infants = Number(counts.infants);
  if (!Number.isInteger(adults) || adults < 1 || adults > 9 || !Number.isInteger(children) || children < 0 || children > 8 || !Number.isInteger(infants) || infants < 0 || infants > 8 || adults + children + infants > 17 || infants > adults) throw new Error("invalid_search");
  const cabinInput = String(search.cabin ?? "economy").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!new Set(["economy", "premium_economy", "business", "first"]).has(cabinInput)) throw new Error("invalid_search");
  const cabinClass = normalizeCabin(cabinInput) as CabinClass;
  return { origin, destination, departureDate, returnDate, tripType: returnDate ? "return" : "oneway", cabinClass, passengers: { adults, children, infants } };
}

async function sign(payload: string, key: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(signature))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function encode(value: unknown) { return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }

async function makeQuote(query: FlightSearchQuery, providerReference: string, userId: string, secret: string, nonce = crypto.randomUUID()): Promise<{ token: string; claims: QuoteClaims }> {
  const results = await getPricingProvider().searchFlights(query);
  const offer = results.find((item) => item.providerReference === providerReference && item.kind === "offer" && item.supplierPrice !== null && item.currency === "USD" && item.originCode === query.origin && item.destinationCode === query.destination && item.cabinClass === query.cabinClass && item.departureDateTime?.slice(0, 10) === query.departureDate);
  if (!offer || !offer.supplierPrice || offer.supplierPrice <= 0) throw new Error("fare_unavailable");
  const rules = await loadRules();
  const pricing = priceOffer(rules, { supplierPrice: offer.supplierPrice, airlineCode: offer.airlineCode ?? undefined, origin: offer.originCode ?? query.origin, destination: offer.destinationCode ?? query.destination, cabin: query.cabinClass, isDomestic: (offer.originCode ?? query.origin).slice(0, 2) === (offer.destinationCode ?? query.destination).slice(0, 2) });
  const claims: QuoteClaims = { uid: userId, exp: Date.now() + 5 * 60_000, nonce, query, providerReference, pricing, currency: offer.currency, flight: { providerReference: offer.providerReference, airline: offer.airline, airlineCode: offer.airlineCode, flightNumber: offer.flightNumber, origin: offer.originCode, destination: offer.destinationCode, departureDateTime: offer.departureDateTime, arrivalDateTime: offer.arrivalDateTime, durationMinutes: offer.durationMinutes, stops: offer.stops } };
  const payload = encode(claims);
  return { token: `${payload}.${await sign(payload, secret)}`, claims };
}

async function readQuoteToken(token: unknown, userId: string, secret: string, allowExpired = false): Promise<QuoteClaims | null> {
  if (typeof token !== "string" || token.length > 8_000) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || await sign(payload, secret) !== signature) return null;
  try {
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
    const claims = JSON.parse(atob(base64 + "=".repeat((4 - base64.length % 4) % 4))) as QuoteClaims;
    if (!claims || claims.uid !== userId || !Number.isFinite(claims.exp) || (!allowExpired && claims.exp < Date.now()) || !isUuid(claims.nonce)
      || typeof claims.providerReference !== "string" || !isObj(claims.query) || !isObj(claims.pricing)
      || typeof claims.pricing.customer_price !== "number" || typeof claims.currency !== "string") return null;
    return claims;
  } catch { return null; }
}

async function consumeLimit(admin: ReturnType<typeof createClient>, userId: string, scope: string, max: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("consume_booking_edge_rate_limit", {
    p_user_id: userId, p_scope: scope, p_max_requests: max, p_window_seconds: windowSeconds,
  });
  if (error || !isObj(data) || typeof data.allowed !== "boolean") throw new Error("rate_limit_unavailable");
  return { allowed: data.allowed, retryAfter: Math.max(1, Number(data.retry_after_seconds) || windowSeconds) };
}

function logFailure(requestId: string, operation: string, error: unknown) {
  const errorName = error instanceof Error ? error.name : "UnknownError";
  const code = isObj(error) && typeof error.code === "string" && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : undefined;
  console.error(JSON.stringify({ event: "booking_request_failed", requestId, operation, errorName, code }));
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  if (!isAllowedBookingOrigin(req)) return bad(req, "This website origin is not allowed.", 403, requestId);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: bookingCorsHeaders(req) });
  if (req.method !== "POST") return bad(req, "Method not allowed.", 405, requestId, { Allow: "POST, OPTIONS" });

  const length = Number(req.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return bad(req, "Request is too large.", 413, requestId);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return bad(req, "Authentication required.", 401, requestId);

  let body: unknown;
  try {
    const raw = await readLimitedText(req, MAX_BODY_BYTES);
    if (raw === null) return bad(req, "Request is too large.", 413, requestId);
    body = JSON.parse(raw);
  } catch { return bad(req, "Request body must be valid JSON.", 400, requestId); }
  if (!isObj(body)) return bad(req, "Request body is invalid.", 400, requestId);
  if (hasClientControlledFields(body)) return bad(req, "Some submitted fields are not accepted.", 400, requestId);
  const operation = typeof body.operation === "string" ? body.operation : "unknown";
  if (operation !== "quote" && operation !== "submit_flight"
    && ("providerReference" in body || "providerOfferReference" in body || "providerBookingReference" in body || "offerId" in body)) {
    return bad(req, "Provider references are not accepted for this inquiry.", 400, requestId);
  }

  const url = Deno.env.get("SUPABASE_URL"); const anonKey = Deno.env.get("SUPABASE_ANON_KEY"); const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    logFailure(requestId, String(body.operation ?? "unknown"), new Error("missing_runtime_configuration"));
    return bad(req, "The request could not be processed. Contact the travel team if this continues.", 503, requestId);
  }
  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  let authUser: { id: string } | null = null;
  try {
    const { data, error } = await authClient.auth.getUser();
    if (!error) authUser = data.user;
  }
  catch (error) {
    logFailure(requestId, "authentication", error);
    return bad(req, "Authentication could not be verified. Please try again.", 503, requestId);
  }
  if (!authUser) return bad(req, "Authentication required.", 401, requestId);
  const user = authUser;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  if (operation === "quote" || operation === "submit_flight") {
    let query: FlightSearchQuery;
    let passengers: ReturnType<typeof validatePassengers> | null = null;
    try {
      query = queryFrom(body);
      if (operation === "submit_flight") passengers = validatePassengers(body.passengers, query.passengers);
    } catch { return bad(req, "Flight request details are invalid.", 400, requestId); }
    if (operation === "submit_flight" && !passengerTypesMatch(passengers, query.passengers)) return bad(req, "Traveler details do not match the selected passenger counts.", 400, requestId);
    const providerReference = body.providerReference;
    if (typeof providerReference !== "string" || providerReference.length < 1 || providerReference.length > 200) return bad(req, "Selected fare is invalid.", 400, requestId);

    let oldQuote: QuoteClaims | null = null;
    let idempotencyKey: string | null = null;
    let contactDetails: { email: string; phone: string } | null = null;
    if (operation === "submit_flight") {
      oldQuote = await readQuoteToken(body.quoteToken, user.id, serviceKey, true);
      if (!oldQuote) return bad(req, "Fare review is invalid or expired. Request a current quotation.", 409, requestId);
      if (oldQuote.providerReference !== providerReference || JSON.stringify(oldQuote.query) !== JSON.stringify(query)) return bad(req, "Fare review does not match this search. Request a current quotation.", 409, requestId);
      if (!isUuid(body.idempotencyKey)) return bad(req, "Submission identifier is invalid.", 400, requestId);
      idempotencyKey = body.idempotencyKey.toLowerCase();
      const contact = body.contact;
      if (!isObj(contact) || typeof contact.email !== "string" || contact.email.length > 254 || !/^\S+@\S+\.\S+$/.test(contact.email.trim()) || typeof contact.phone !== "string" || contact.phone.trim().length < 5 || contact.phone.length > 30) return bad(req, "Contact details are invalid.", 400, requestId);
      contactDetails = { email: contact.email.trim(), phone: contact.phone.trim() };
    }

    const scope = operation === "quote" ? "quote" : "submit_flight";
    const limit = operation === "quote" ? { max: 10, seconds: 60 } : { max: 5, seconds: 600 };
    try {
      const rate = await consumeLimit(admin, user.id, scope, limit.max, limit.seconds);
      if (!rate.allowed) return bad(req, "Too many requests. Please try again later.", 429, requestId, { "Retry-After": String(rate.retryAfter) });
    } catch (error) {
      logFailure(requestId, operation, error);
      return bad(req, "The request could not be processed. Please try again shortly.", 503, requestId);
    }

    try {
      if (operation === "submit_flight" && oldQuote && idempotencyKey && passengers && contactDetails) {
        const requestHash = await sign(JSON.stringify({ uid: user.id, nonce: oldQuote.nonce, idempotencyKey, query, providerReference, passengers, contact: contactDetails }), serviceKey);
        const { data: prior, error: priorError } = await admin.rpc("resolve_flight_booking_request_replay", {
          p_user_id: user.id, p_quote_nonce: oldQuote.nonce, p_idempotency_key: idempotencyKey, p_request_hash: requestHash,
        });
        if (priorError || !isObj(prior)) throw new Error("replay_lookup_failed");
        if (prior.outcome === "conflict") return bad(req, "This fare review has already been used for a different request.", 409, requestId);
        if (prior.outcome === "replay" && isObj(prior.booking)) return bookingJson(req, { booking: prior.booking, duplicate: true, requestId });
        if (oldQuote.exp < Date.now()) return bad(req, "Fare review expired. Request a current quotation.", 409, requestId);
      }
      const fresh = await makeQuote(query, providerReference, user.id, serviceKey, oldQuote?.nonce);
      if (operation === "quote") return bookingJson(req, { quoteToken: fresh.token, amount: fresh.claims.pricing.customer_price, currency: fresh.claims.currency, expiresAt: new Date(fresh.claims.exp).toISOString(), requestId });
      if (!oldQuote || !idempotencyKey || !passengers || !contactDetails || !quoteMatchesCurrent(oldQuote, fresh.claims)) return bad(req, "The fare changed or the review expired. Request a current quotation.", 409, requestId);

      const referenceHash = await sign(JSON.stringify({ uid: user.id, nonce: oldQuote.nonce, key: idempotencyKey, query, providerReference, pricing: fresh.claims.pricing, currency: fresh.claims.currency, passengers, contact: contactDetails }), serviceKey);
      const reference = `LK${referenceHash.replace(/[^a-zA-Z0-9]/g, "").slice(0, 22).toUpperCase()}`;
      const details = {
        airline: fresh.claims.flight.airline, code: fresh.claims.flight.flightNumber,
        from: query.origin, to: query.destination, depart: fresh.claims.flight.departureDateTime,
        cabin: query.cabinClass, fareType: "Current fare · travel desk request only",
        adults: query.passengers.adults, children: query.passengers.children, infants: query.passengers.infants,
        providerReference, pax: passengers, contact: contactDetails, flight: fresh.claims.flight, search: query,
        fare: { supplierPrice: fresh.claims.pricing.supplier_price, markup: fresh.claims.pricing.markup_amount, price: fresh.claims.pricing.customer_price, currency: fresh.claims.currency, rule: fresh.claims.pricing.pricing_rule_name, ruleId: fresh.claims.pricing.pricing_rule_id },
        requestOnly: true,
      };
      const requestHash = await sign(JSON.stringify({ uid: user.id, nonce: oldQuote.nonce, idempotencyKey, query, providerReference, passengers, contact: contactDetails }), serviceKey);
      const { data, error } = await admin.rpc("create_flight_booking_request_once", {
        p_user_id: user.id,
        p_quote_nonce: oldQuote.nonce,
        p_idempotency_key: idempotencyKey,
        p_request_hash: requestHash,
        p_quote_expires_at: new Date(oldQuote.exp).toISOString(),
        p_reference: reference,
        p_total_amount: fresh.claims.pricing.customer_price,
        p_currency: fresh.claims.currency,
        p_travel_date: query.departureDate,
        p_details: details,
      });
      if (error || !isObj(data)) throw new Error("booking_write_failed");
      if (data.outcome === "conflict") return bad(req, "This fare review has already been used. Request a new quotation.", 409, requestId);
      if (!isObj(data.booking)) throw new Error("booking_response_invalid");
      return bookingJson(req, { booking: data.booking, duplicate: data.outcome === "replay", requestId }, data.outcome === "replay" ? 200 : 201);
    } catch (error) {
      logFailure(requestId, operation, error);
      return bad(req, "A current quotation could not be prepared or saved. Please try again or contact the travel team.", 503, requestId);
    }
  }

  if (operation === "schedule_inquiry" || operation === "service_inquiry") {
    const type = operation === "schedule_inquiry" ? "flight" : body.type;
    const permitted = ["flight", "hotel", "car", "visa", "kakande", "package", "transfer", "insurance"];
    if (typeof type !== "string" || !permitted.includes(type) || !isUuid(body.idempotencyKey)) return bad(req, "Inquiry details are invalid.", 400, requestId);
    if (operation === "service_inquiry" && !isObj(body.details)) return bad(req, "Inquiry details are invalid.", 400, requestId);
    if (body.travelDate != null && body.travelDate !== "" && !validDate(body.travelDate)) return bad(req, "Inquiry travel date is invalid.", 400, requestId);
    const dateFields = ["travelDate", "checkIn", "checkOut", "pdate", "ddate", "dob", "passportExpiry", "departureDate", "returnDate"];
    const dateSource = operation === "schedule_inquiry" ? body.search : body.details;
    if (isObj(dateSource) && dateFields.some((key) => dateSource[key] != null && dateSource[key] !== "" && !validDate(dateSource[key]))) return bad(req, "Inquiry date details are invalid.", 400, requestId);
    const search = operation === "schedule_inquiry" ? sanitizeInquiryDetails(body.search, "flight") : null;
    const inputDetails = operation === "schedule_inquiry" ? { inquiry: "schedule_only_unpriced", search } : sanitizeInquiryDetails(body.details, type);
    const details = { ...inputDetails, ...(operation === "service_inquiry" ? { requestType: "service_followup_unpriced" } : {}) };
    const travelDate = validDate(body.travelDate) ? body.travelDate : null;
    try {
      const rate = await consumeLimit(admin, user.id, "inquiry", 10, 3600);
      if (!rate.allowed) return bad(req, "Too many requests. Please try again later.", 429, requestId, { "Retry-After": String(rate.retryAfter) });
      const key = body.idempotencyKey.toLowerCase();
      const referenceDigest = await sign(JSON.stringify({ uid: user.id, key, operation, type, travelDate, details }), serviceKey);
      const reference = `LQ${referenceDigest.replace(/[^a-zA-Z0-9]/g, "").slice(0, 22).toUpperCase()}`;
      const selection = "id,reference,total_amount,currency,status,payment_status,type,travel_date,details,created_at";
      const { data: prior } = await admin.from("bookings").select(selection).eq("user_id", user.id).eq("reference", reference).maybeSingle();
      if (prior) return bookingJson(req, { booking: prior, duplicate: true, requestId });
      const { data: booking, error } = await admin.from("bookings").insert({ user_id: user.id, reference, type, ...unpricedBookingDefaults(type), travel_date: travelDate, details }).select(selection).single();
      if (error?.code === "23505") {
        const { data: duplicate } = await admin.from("bookings").select(selection).eq("user_id", user.id).eq("reference", reference).maybeSingle();
        if (duplicate) return bookingJson(req, { booking: duplicate, duplicate: true, requestId });
      }
      if (error) throw new Error("inquiry_write_failed");
      return bookingJson(req, { booking, duplicate: false, requestId }, 201);
    } catch (error) {
      logFailure(requestId, operation, error);
      return bad(req, "The inquiry could not be saved. Please try again or contact the travel team.", 503, requestId);
    }
  }
  return bad(req, "Unsupported request operation.", 400, requestId);
});
