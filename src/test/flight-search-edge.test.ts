import { describe, expect, it, vi } from "vitest";
import type { FlightProvider, FlightSearchQuery, FlightSearchResult } from "../../supabase/functions/_shared/flight/types";
import type { PricingRule } from "../../supabase/functions/_shared/pricingTypes";
import { createFlightSearchHandler, type FlightSearchDependencies } from "../../supabase/functions/flight-search/handler";
import { rateLimitIdentityFromAddress } from "../../supabase/functions/flight-search/rateLimitIdentity";

const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const validBody = {
  from: "LUN", to: "JNB", depart: futureDate, ret: null,
  cabin: "Economy", adults: 1, children: 0, infants: 0,
};
const rule: PricingRule = {
  id: "rule-id", name: "Synthetic test rule", rule_type: "default", priority: 1,
  markup_type: "fixed", markup_amount: 25, currency: "USD", airline_code: null,
  origin_airport: null, destination_airport: null, cabin_class: null, is_domestic: null,
  min_ticket_price: null, max_ticket_price: null, valid_from: null, valid_until: null, is_active: true,
};
const offer: FlightSearchResult = {
  id: "synthetic-offer", provider: "flightapi", providerReference: "synthetic-reference",
  flightNumber: "TEST 1", airline: "Synthetic Air", airlineCode: "SA", aircraft: null,
  origin: "Lusaka", originCode: "LUN", destination: "Johannesburg", destinationCode: "JNB",
  departureDateTime: `${futureDate}T09:00:00Z`, arrivalDateTime: `${futureDate}T11:00:00Z`,
  durationMinutes: 120, stops: 0, status: null, cabinClass: "economy", supplierPrice: 200,
  markupAmount: null, customerPrice: null, currency: "USD", bookable: false, kind: "offer",
};

function provider(name: string, searchFlights: (query: FlightSearchQuery) => Promise<FlightSearchResult[]>, aviationData = name !== "flightapi") {
  return {
    name,
    capabilities: { aviationData, liveInventory: false, livePricing: name === "flightapi", revalidation: false, booking: false, ticketing: false, cancellation: false, refunds: false, seatSelection: false, ancillaries: false },
    searchFlights,
  } as unknown as FlightProvider;
}

function setup(overrides: Partial<FlightSearchDependencies> = {}) {
  const searchFlights = vi.fn(async () => [offer]);
  const rateLimit = vi.fn(async () => ({ allowed: true, retryAfterSeconds: 60 }));
  const loadRules = vi.fn(async () => [rule]);
  const deps: FlightSearchDependencies = {
    getRateLimitIdentity: vi.fn(async () => "synthetic-rate-identity"),
    rateLimit,
    loadRules,
    getPricingProvider: () => provider("flightapi", searchFlights),
    getDataProvider: () => provider("aviationstack", vi.fn(async () => [])),
    ...overrides,
  };
  return { handler: createFlightSearchHandler(deps), deps, searchFlights, rateLimit, loadRules };
}

function request(body: unknown = validBody, origin = "https://luskam-travel-v2.vercel.app") {
  return new Request("https://functions.example/flight-search", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("flight-search Edge Function handler", () => {
  it("derives stable pseudonymous limiter identities without persisting the raw address", async () => {
    const first = await rateLimitIdentityFromAddress("203.0.113.7", "synthetic-server-key");
    const same = await rateLimitIdentityFromAddress("203.0.113.7", "synthetic-server-key");
    const other = await rateLimitIdentityFromAddress("203.0.113.8", "synthetic-server-key");
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(first).toBe(same);
    expect(first).not.toBe(other);
    expect(first).not.toContain("203.0.113.7");
  });

  it("retains the customer-facing flight response contract and applies server pricing", async () => {
    const { handler, searchFlights, rateLimit } = setup();
    const response = await handler(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ source: "live_fares", flights: [{ id: "synthetic-offer", price: 225, currency: "USD", priced: true }] });
    expect(searchFlights).toHaveBeenCalledTimes(1);
    expect(rateLimit).toHaveBeenCalledWith("synthetic-rate-identity", 5, 600);
  });

  it.each([
    ["malformed IATA", { ...validBody, from: "LUN extra" }],
    ["same airports", { ...validBody, to: "LUN" }],
    ["impossible calendar date", { ...validBody, depart: "2026-02-30" }],
    ["past departure", { ...validBody, depart: "2020-01-01" }],
    ["return before departure", { ...validBody, ret: "2020-01-01" }],
    ["fractional passenger count", { ...validBody, adults: 1.5 }],
    ["infants exceed adults", { ...validBody, infants: 2 }],
    ["unsupported cabin", { ...validBody, cabin: "space-class" }],
    ["authoritative extra field", { ...validBody, payment_status: "paid" }],
  ])("rejects %s before calling a provider", async (_name, body) => {
    const { handler, searchFlights } = setup();
    const response = await handler(request(body));
    expect(response.status).toBe(400);
    expect((await response.json()).flights).toEqual([]);
    expect(searchFlights).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies before the persistent limiter or provider", async () => {
    const { handler, rateLimit, searchFlights } = setup();
    const response = await handler(new Request("https://functions.example/flight-search", {
      method: "POST",
      headers: { origin: "https://luskam-travel-v2.vercel.app", "content-type": "application/json", "content-length": "9000" },
      body: "{}",
    }));
    expect(response.status).toBe(413);
    expect(rateLimit).not.toHaveBeenCalled();
    expect(searchFlights).not.toHaveBeenCalled();
  });

  it("enforces the streaming body limit when Content-Length is absent", async () => {
    const { handler, rateLimit, searchFlights } = setup();
    const response = await handler(new Request("https://functions.example/flight-search", {
      method: "POST",
      headers: { origin: "https://luskam-travel-v2.vercel.app", "content-type": "application/json" },
      body: JSON.stringify({ ...validBody, extra: "x".repeat(9000) }),
    }));
    expect(response.status).toBe(413);
    expect(rateLimit).toHaveBeenCalledTimes(1);
    expect(searchFlights).not.toHaveBeenCalled();
  });

  it("returns 429 and Retry-After when the persistent limiter denies a request", async () => {
    const { handler, searchFlights } = setup({ rateLimit: async () => ({ allowed: false, retryAfterSeconds: 42 }) });
    const response = await handler(request());
    const body = await response.json();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(body).toMatchObject({ errorCode: "RATE_LIMITED", retryAfterSeconds: 42 });
    expect(searchFlights).not.toHaveBeenCalled();
  });

  it("fails closed when persistent rate-limit storage is unavailable", async () => {
    const { handler, searchFlights } = setup({ rateLimit: async () => { throw new Error("database details"); } });
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect((await response.text()).includes("database details")).toBe(false);
    expect(searchFlights).not.toHaveBeenCalled();
  });

  it("returns pricing unavailable without calling a provider when no active rules exist", async () => {
    const loadRules = vi.fn(async () => []);
    const { handler, searchFlights } = setup({ loadRules });
    const response = await handler(request());
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.errorCode).toBe("PRICING_UNAVAILABLE");
    expect(loadRules).toHaveBeenCalledTimes(1);
    expect(searchFlights).not.toHaveBeenCalled();
  });

  it("fails closed when active rules do not match the returned fare", async () => {
    const { handler, searchFlights } = setup({ loadRules: async () => [{ ...rule, origin_airport: "NBO" }] });
    const response = await handler(request());
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.errorCode).toBe("PRICING_UNAVAILABLE");
    expect(searchFlights).toHaveBeenCalledTimes(1);
  });

  it("does not issue a second FlightAPI request when the configured fallback is also FlightAPI", async () => {
    const primarySearch = vi.fn(async () => { throw new Error("secret=provider-internal"); });
    const fallbackSearch = vi.fn(async () => [offer]);
    const { handler } = setup({
      getPricingProvider: () => provider("flightapi", primarySearch),
      getDataProvider: () => provider("flightapi", fallbackSearch),
    });
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(primarySearch).toHaveBeenCalledTimes(1);
    expect(fallbackSearch).not.toHaveBeenCalled();
  });

  it("does not leak provider exceptions or credentials to the response", async () => {
    const { handler } = setup({ getPricingProvider: () => provider("flightapi", async () => { throw new Error("FLIGHTAPI_KEY=top-secret internal stack"); }) });
    const response = await handler(request());
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(text).not.toContain("top-secret");
    expect(text).not.toContain("internal stack");
    expect(text).toContain("requestId");
    expect(text).toContain("FARES_UNAVAILABLE");
  });

  it("allows the staging origin and handles preflight without calling dependencies", async () => {
    const { handler, rateLimit, searchFlights } = setup();
    const response = await handler(new Request("https://functions.example/flight-search", {
      method: "OPTIONS", headers: { origin: "https://luskam-travel-v2.vercel.app" },
    }));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://luskam-travel-v2.vercel.app");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(rateLimit).not.toHaveBeenCalled();
    expect(searchFlights).not.toHaveBeenCalled();
  });

  it("rejects other browser origins without reflecting them", async () => {
    const { handler, searchFlights } = setup();
    const response = await handler(request(validBody, "https://attacker.example"));
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(searchFlights).not.toHaveBeenCalled();
  });

  it("does not grant CORS access to a disallowed preflight origin", async () => {
    const { handler, rateLimit } = setup();
    const response = await handler(new Request("https://functions.example/flight-search", {
      method: "OPTIONS", headers: { origin: "https://attacker.example" },
    }));
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it("supports explicitly configured exact HTTPS origins", async () => {
    const { handler } = setup({ allowedOrigins: ["https://preview-123.example"] });
    const response = await handler(request(validBody, "https://preview-123.example"));
    expect(response.headers.get("access-control-allow-origin")).toBe("https://preview-123.example");
  });
});
