import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFlightQuoteHandler, gatewayReportedClientAddress, type FlightQuoteDependencies, type FlightQuoteRequest } from "../../supabase/functions/request-flight-quote/handler";

const allowedOrigin = "https://luskam-travel-v2.vercel.app";
const idempotencyKey = "d38a4c60-93b2-4fe1-9a12-1da4be533a55";
const payload = () => ({
  search: {
    origin: "LUN", destination: "JNB", departureDate: "2026-11-10", returnDate: null,
    tripType: "oneway", passengers: { adults: 2, children: 0, infants: 0 }, cabinClass: "economy",
  },
  contact: { fullName: "Synthetic Customer", email: "synthetic@example.test", phone: "+260 977 000 000" },
  specialRequests: "Window seat preference", idempotencyKey,
  turnstileToken: "synthetic-turnstile-token",
});
const post = (body: unknown, origin = allowedOrigin, authorization?: string) => new Request("https://functions.example/request-flight-quote", {
  method: "POST", headers: { "content-type": "application/json", origin, ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body),
});

function dependencies(overrides: Partial<FlightQuoteDependencies> = {}) {
  const calls = { rate: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 30 })), save: vi.fn(async (_request: FlightQuoteRequest) => ({ outcome: "created" as const, reference: "LTA-20261110-AB12CD34" })) };
  const deps: FlightQuoteDependencies = {
    verifyCaptcha: vi.fn(async () => ({ success: true, hostname: "luskam-travel-v2.vercel.app", action: "flight_quote_request" })),
    rateLimitIdentity: vi.fn(async () => "c2d3d310-bfc1-46b3-8761-eabc43f701f8"),
    rateLimit: calls.rate,
    saveRequest: calls.save,
    now: () => new Date("2026-10-16T12:00:00.000Z"),
    ...overrides,
  };
  return { deps, calls };
}

describe("request-flight-quote Edge Function handler", () => {
  beforeEach(() => vi.restoreAllMocks());

  it.each([
    ["missing", null],
    ["malformed IPv4", "999.1.2.3"],
    ["multiple spoofed values", "198.51.100.2, 203.0.113.4"],
    ["whitespace", "198.51.100. 2"],
    ["invalid IPv6", "2001:::1"],
  ])("rejects %s gateway client-IP metadata", (_label, value) => {
    const headers = new Headers();
    if (value !== null) headers.set("cf-connecting-ip", value);
    headers.set("x-forwarded-for", "203.0.113.99");
    expect(gatewayReportedClientAddress(new Request("https://functions.example", { headers }))).toBeNull();
  });

  it("uses only the gateway-reported IP and ignores caller X-Forwarded-For", () => {
    const request = new Request("https://functions.example", { headers: {
      "cf-connecting-ip": "198.51.100.8", "x-forwarded-for": "203.0.113.99",
    } });
    expect(gatewayReportedClientAddress(request)).toBe("198.51.100.8");
  });

  it("fails closed when gateway identity metadata is missing or malformed", async () => {
    for (const value of [null, "999.0.0.1"]) {
      const { deps, calls } = dependencies({ rateLimitIdentity: vi.fn(async (request) => {
        const headers = new Headers(request.headers);
        if (value === null) headers.delete("cf-connecting-ip");
        else headers.set("cf-connecting-ip", value);
        const address = gatewayReportedClientAddress(new Request(request.url, { headers }));
        if (!address) throw new Error("identity unavailable");
        return address;
      }) });
      const response = await createFlightQuoteHandler(deps)(post(payload()));
      expect(response.status).toBe(503);
      expect(calls.save).not.toHaveBeenCalled();
    }
  });

  it("validates, rate-limits, sanitizes and saves a manual quote inquiry", async () => {
    const { deps, calls } = dependencies();
    const response = await createFlightQuoteHandler(deps)(post(payload()));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ reference: "LTA-20261110-AB12CD34", duplicate: false });
    expect(calls.rate).toHaveBeenNthCalledWith(1, expect.any(String), 4, 900);
    expect(calls.rate).toHaveBeenNthCalledWith(2, "9f1d9f00-9e00-4c9f-9d00-000000000001", 60, 900);
    expect(calls.save).toHaveBeenCalledWith(expect.objectContaining({
      search: expect.objectContaining({ origin: "LUN", destination: "JNB", tripType: "oneway" }),
      contact: expect.objectContaining({ fullName: "Synthetic Customer", email: "synthetic@example.test" }),
    }), idempotencyKey, expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), expect.stringMatching(/^LTA-20261016-[A-F0-9]{16}$/), null);
    expect(JSON.stringify(calls.save.mock.calls)).not.toContain("synthetic-turnstile-token");
  });

  it("verifies CAPTCHA before address/global limit calls and persistence", async () => {
    const events: string[] = [];
    const deps = dependencies({
      verifyCaptcha: vi.fn(async (token) => { events.push(`captcha:${token}`); return { success: true, hostname: allowedOrigin.slice("https://".length), action: "flight_quote_request" }; }),
      rateLimitIdentity: vi.fn(async () => { events.push("address_identity"); return "synthetic-address-identity"; }),
      rateLimit: vi.fn(async (identity) => { events.push(identity === "synthetic-address-identity" ? "address_limit" : "global_limit"); return { allowed: true, retryAfterSeconds: 900 }; }),
      saveRequest: vi.fn(async () => { events.push("persist"); return { outcome: "created" as const, reference: "LTA-20261016-AB12CD34" }; }),
    }).deps;
    const response = await createFlightQuoteHandler(deps)(post(payload()));
    expect(response.status).toBe(200);
    expect(events).toEqual(["captcha:synthetic-turnstile-token", "address_identity", "address_limit", "global_limit", "persist"]);
  });

  it("persists only the UID returned by Auth token verification", async () => {
    const userId = "2e33f3a7-61e6-4971-8c2e-4dc817df7937";
    const { deps, calls } = dependencies({ verifyAccessToken: vi.fn(async () => userId) });
    const response = await createFlightQuoteHandler(deps)(post(payload(), allowedOrigin, "Bearer synthetic-access-token"));
    expect(response.status).toBe(200);
    expect(deps.verifyAccessToken).toHaveBeenCalledWith("synthetic-access-token");
    expect(calls.save).toHaveBeenCalledWith(expect.any(Object), idempotencyKey, expect.any(String), expect.any(String), expect.any(String), userId);
  });

  it.each([
    ["expired token", vi.fn(async () => null), 401, "INVALID_AUTH_TOKEN"],
    ["unavailable Auth verification", vi.fn(async () => { throw new Error("synthetic auth outage"); }), 503, "AUTH_VERIFICATION_UNAVAILABLE"],
  ])("rejects %s without downgrading to anonymous", async (_label, verifyAccessToken, status, code) => {
    const { deps, calls } = dependencies({ verifyAccessToken });
    const response = await createFlightQuoteHandler(deps)(post(payload(), allowedOrigin, "Bearer synthetic-token"));
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(deps.verifyCaptcha).not.toHaveBeenCalled();
    expect(calls.save).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed IATA code", { search: { ...payload().search, origin: "Lusaka" } }],
    ["same origin and destination", { search: { ...payload().search, destination: "LUN" } }],
    ["invalid calendar date", { search: { ...payload().search, departureDate: "2026-02-30" } }],
    ["past date", { search: { ...payload().search, departureDate: "2026-10-15" } }],
    ["return before departure", { search: { ...payload().search, returnDate: "2026-11-09", tripType: "return" } }],
    ["invalid passenger counts", { search: { ...payload().search, passengers: { adults: 0, children: 0, infants: 1 } } }],
    ["unsupported cabin", { search: { ...payload().search, cabinClass: "spaceship" } }],
    ["invalid email", { contact: { ...payload().contact, email: "no" } }],
    ["malformed idempotency key", { idempotencyKey: "client-controlled-not-uuid" }],
    ["authoritative client fields", { price: 1, status: "confirmed", user_id: "forged" }],
    ["authoritative fields nested in trip data", { search: { ...payload().search, status: "confirmed" } }],
    ["provider and ticket fields", { providerReference: "x", pnr: "x", ticketNumber: "x", paymentStatus: "paid" }],
  ])("rejects %s", async (_label, change) => {
    const { deps, calls } = dependencies();
    const request = { ...payload(), ...change };
    const response = await createFlightQuoteHandler(deps)(post(request));
    expect(response.status).toBe(400);
    expect(calls.save).not.toHaveBeenCalled();
  });

  it("rejects an oversized body before persistence", async () => {
    const { deps, calls } = dependencies();
    const response = await createFlightQuoteHandler(deps)(new Request("https://functions.example/request-flight-quote", {
      method: "POST", headers: { origin: allowedOrigin, "content-type": "application/json", "content-length": "12001" }, body: "{}",
    }));
    expect(response.status).toBe(413);
    expect(calls.save).not.toHaveBeenCalled();
  });

  it("returns persistent rate-limit 429 with Retry-After and skips persistence", async () => {
    const { deps, calls } = dependencies({ rateLimit: vi.fn(async () => ({ allowed: false, retryAfterSeconds: 48 })) });
    const response = await createFlightQuoteHandler(deps)(post(payload()));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("48");
    expect(calls.save).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid", { success: false }],
    ["expired", { success: false }],
    ["replayed", { success: false }],
    ["wrong hostname", { success: true, hostname: "attacker.example", action: "flight_quote_request" }],
    ["wrong action", { success: true, hostname: "luskam-travel-v2.vercel.app", action: "other_action" }],
  ])("rejects %s Turnstile verification before any database RPC", async (_label, result) => {
    const { deps, calls } = dependencies({ verifyCaptcha: vi.fn(async () => result) });
    const response = await createFlightQuoteHandler(deps)(post(payload()));
    expect(response.status).toBe(403);
    expect(calls.rate).not.toHaveBeenCalled();
    expect(calls.save).not.toHaveBeenCalled();
  });

  it("rejects missing CAPTCHA token before Siteverify, rate limits, or persistence", async () => {
    const { deps, calls } = dependencies();
    const body = payload();
    delete (body as Partial<typeof body>).turnstileToken;
    const response = await createFlightQuoteHandler(deps)(post(body));
    expect(response.status).toBe(400);
    expect(deps.verifyCaptcha).not.toHaveBeenCalled();
    expect(calls.rate).not.toHaveBeenCalled();
    expect(calls.save).not.toHaveBeenCalled();
  });

  it("fails safely when CAPTCHA provider returns malformed data or is unavailable", async () => {
    for (const verifyCaptcha of [vi.fn(async () => { throw new Error("provider response with sensitive details"); })]) {
      const { deps, calls } = dependencies({ verifyCaptcha });
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const response = await createFlightQuoteHandler(deps)(post(payload()));
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("sensitive details");
      expect(calls.rate).not.toHaveBeenCalled();
      expect(calls.save).not.toHaveBeenCalled();
      log.mockRestore();
    }

    const { deps, calls } = dependencies({ verifyCaptcha: vi.fn(async () => ({ success: true })) });
    const malformed = await createFlightQuoteHandler(deps)(post(payload()));
    expect(malformed.status).toBe(403);
    expect(calls.rate).not.toHaveBeenCalled();
    expect(calls.save).not.toHaveBeenCalled();
  });

  it("returns global quota 429 with Retry-After without creating a quotation", async () => {
    const rateLimit = vi.fn()
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 900 })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 73 });
    const { deps, calls } = dependencies({ rateLimit });
    const response = await createFlightQuoteHandler(deps)(post(payload()));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("73");
    expect(rateLimit).toHaveBeenCalledTimes(2);
    expect(calls.save).not.toHaveBeenCalled();
  });

  it("fails closed when global limiter storage fails after the address slot is consumed", async () => {
    const rateLimit = vi.fn()
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 900 })
      .mockRejectedValueOnce(new Error("private storage detail"));
    const { deps, calls } = dependencies({ rateLimit });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await createFlightQuoteHandler(deps)(post(payload()));
    expect(response.status).toBe(503);
    expect(rateLimit).toHaveBeenCalledTimes(2);
    expect(calls.save).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("private storage detail");
    log.mockRestore();
  });

  it("atomically limits concurrent submissions against the shared global identity", async () => {
    let globalCount = 0;
    const rateLimit = vi.fn(async (identity: string) => {
      if (identity !== "9f1d9f00-9e00-4c9f-9d00-000000000001") return { allowed: true, retryAfterSeconds: 900 };
      // Models the serialization and limit decision made by the database RPC.
      if (globalCount >= 60) return { allowed: false, retryAfterSeconds: 900 };
      globalCount += 1;
      return { allowed: true, retryAfterSeconds: 900 };
    });
    const { deps, calls } = dependencies({ rateLimit });
    const handler = createFlightQuoteHandler(deps);
    const responses = await Promise.all(Array.from({ length: 61 }, (_, index) => {
      const req = post({ ...payload(), idempotencyKey: `d38a4c60-93b2-4fe1-9a12-${String(index).padStart(12, "0")}` });
      req.headers.set("cf-connecting-ip", `198.51.100.${(index % 254) + 1}`);
      return handler(req);
    }));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(60);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(1);
    expect(calls.save).toHaveBeenCalledTimes(60);
  });

  it("fails closed when persistent rate-limit storage is unavailable", async () => {
    const { deps, calls } = dependencies({ rateLimit: vi.fn(async () => { throw new Error("private database details"); }) });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await createFlightQuoteHandler(deps)(post(payload()));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database details");
    expect(calls.save).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("returns the same reference for idempotent retries and rejects key reuse with changed data", async () => {
    const saveRequest = vi.fn()
      .mockResolvedValueOnce({ outcome: "created", reference: "LTA-20261016-AB12CD34" })
      .mockResolvedValueOnce({ outcome: "duplicate", reference: "LTA-20261016-AB12CD34" })
      .mockResolvedValueOnce({ outcome: "duplicate", reference: "LTA-20261016-AB12CD34" })
      .mockResolvedValueOnce({ outcome: "conflict" });
    const handler = createFlightQuoteHandler(dependencies({ saveRequest }).deps);
    const first = await handler(post(payload()));
    const retry = await handler(post(payload()));
    const replayWithAnotherKey = await handler(post({ ...payload(), idempotencyKey: "d8430e95-ff3f-4d0b-9c09-6c38fb958072" }));
    const changed = await handler(post({ ...payload(), specialRequests: "different request" }));
    expect(first.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ reference: "LTA-20261016-AB12CD34", duplicate: true });
    await expect(replayWithAnotherKey.json()).resolves.toMatchObject({ reference: "LTA-20261016-AB12CD34", duplicate: true });
    expect(changed.status).toBe(409);
  });

  it("keeps the duplicate fingerprint stable across a fixed-window boundary", async () => {
    const saveRequest = vi.fn()
      .mockResolvedValueOnce({ outcome: "created", reference: "LTA-20261016-AB12CD34" })
      .mockResolvedValueOnce({ outcome: "duplicate", reference: "LTA-20261016-AB12CD34" });
    const times = [
      new Date("2026-10-16T12:14:59.999Z"), new Date("2026-10-16T12:14:59.999Z"),
      new Date("2026-10-16T12:15:00.001Z"), new Date("2026-10-16T12:15:00.001Z"),
    ];
    const handler = createFlightQuoteHandler(dependencies({ saveRequest, now: () => times.shift() ?? new Date("2026-10-16T12:15:00.001Z") }).deps);
    await handler(post(payload()));
    const second = await handler(post({ ...payload(), idempotencyKey: "d8430e95-ff3f-4d0b-9c09-6c38fb958072" }));
    expect(second.status).toBe(200);
    expect(saveRequest.mock.calls[0][3]).toBe(saveRequest.mock.calls[1][3]);
  });

  it("sends simultaneous identical submissions to the same atomic database fingerprint", async () => {
    const references = new Map<string, string>();
    const saveRequest = vi.fn(async (_request: FlightQuoteRequest, _key: string, _hash: string, fingerprint: string, reference: string) => {
      await Promise.resolve();
      const existing = references.get(fingerprint);
      if (existing) return { outcome: "duplicate" as const, reference: existing };
      references.set(fingerprint, reference);
      return { outcome: "created" as const, reference };
    });
    const handler = createFlightQuoteHandler(dependencies({ saveRequest }).deps);
    const [first, second] = await Promise.all([
      handler(post(payload())),
      handler(post({ ...payload(), idempotencyKey: "d8430e95-ff3f-4d0b-9c09-6c38fb958072" })),
    ]);
    const bodies = await Promise.all([first.json(), second.json()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(bodies[0].reference).toBe(bodies[1].reference);
    expect(saveRequest.mock.calls[0][3]).toBe(saveRequest.mock.calls[1][3]);
    // This unit test verifies request-key stability; database atomicity is covered by the SQL RPC design/test plan.
  });

  it("handles preflight and denies origins outside the allowlist", async () => {
    const { deps } = dependencies({ allowedOrigins: ["http://localhost:8080"] });
    const handler = createFlightQuoteHandler(deps);
    const options = await handler(new Request("https://functions.example/request-flight-quote", { method: "OPTIONS", headers: { origin: "http://localhost:8080" } }));
    expect(options.status).toBe(204);
    expect(options.headers.get("access-control-allow-origin")).toBe("http://localhost:8080");
    const denied = await handler(post(payload(), "https://attacker.example"));
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("keeps internal storage, rate, and database errors out of customer responses", async () => {
    const { deps } = dependencies({ saveRequest: vi.fn(async () => { throw new Error("secret database error"); }) });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await createFlightQuoteHandler(deps)(post(payload()));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("requestId");
    expect(body).not.toContain("secret database error");
    expect(body).not.toContain("service_role");
    error.mockRestore();
  });

  it("does not depend on a flight provider or make provider calls", async () => {
    const { deps } = dependencies();
    expect(deps).not.toHaveProperty("provider");
    expect(deps).not.toHaveProperty("flightApi");
    await createFlightQuoteHandler(deps)(post(payload()));
    expect(deps.saveRequest).toHaveBeenCalledTimes(1);
  });
});
