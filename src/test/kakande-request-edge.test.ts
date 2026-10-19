import { describe, expect, it, vi } from "vitest";
import {
  createKakandeTripHandler,
  KAKANDE_GLOBAL_LIMIT_IDENTITY,
  type SaveResult,
  type KakandeDependencies,
} from "../../supabase/functions/request-kakande-trip/handler";
import { validateKakandeRequest } from "../../supabase/functions/request-kakande-trip/validation";

const reference = "KMR-20261018-0123456789ABCDEF";
const tripSnapshot = {
  known: true,
  available: true,
  tripId: "jun-2026",
  optionId: "12121212-1212-4121-8121-121212121212",
  month: "June 2027",
  mode: "flight" as const,
  travelDate: "2027-06-10",
  pricePerTravellerZmw: 5000,
  currency: "ZMW" as const,
  tripUpdatedAt: "2026-10-18T10:00:00.000Z",
  optionUpdatedAt: "2026-10-18T10:00:00.000Z",
};
const savedSnapshot = {
  tripId: tripSnapshot.tripId,
  optionId: tripSnapshot.optionId,
  month: tripSnapshot.month,
  mode: tripSnapshot.mode,
  travelDate: tripSnapshot.travelDate,
  pricePerTravellerZmw: tripSnapshot.pricePerTravellerZmw,
  travellerCount: 2,
  totalQuotedAmountZmw: 10000,
  currency: "ZMW" as const,
};
const requestBody = (patch: Record<string, unknown> = {}) => ({
  tripId: "jun-2026",
  mode: "flight",
  travellers: 2,
  fullName: "Synthetic Kakande Customer",
  email: "kakande-test@example.test",
  phone: "+260 977 000 111",
  notes: "Synthetic request only",
  idempotencyKey: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a",
  turnstileToken: "synthetic-single-use-token",
  ...patch,
});
const post = (body: unknown, authorization?: string) => new Request("https://functions.example/request-kakande-trip", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://luskam-travel-v2.vercel.app", "cf-connecting-ip": "198.51.100.44", ...(authorization ? { authorization } : {}) },
  body: JSON.stringify(body),
});

function dependencies(overrides: Partial<KakandeDependencies> = {}) {
  const order: string[] = [];
  const deps: KakandeDependencies = {
    verifyCaptcha: vi.fn(async () => { order.push("captcha"); return { success: true, hostname: "luskam-travel-v2.vercel.app", action: "kakande_trip_request" }; }),
    resolveTrip: vi.fn(async () => { order.push("trip"); return tripSnapshot; }),
    rateLimitIdentity: vi.fn(async () => { order.push("address-identity"); return "11111111-1111-4111-8111-111111111111"; }),
    rateLimit: vi.fn(async () => { order.push("rate"); return { allowed: true, retryAfterSeconds: 30 }; }),
    hashRequest: vi.fn(async () => { order.push("hash"); return "a".repeat(43); }),
    saveRequest: vi.fn(async (): Promise<SaveResult> => { order.push("persist"); return { outcome: "created", reference, snapshot: savedSnapshot }; }),
    now: () => new Date("2026-10-18T12:00:00.000Z"),
    ...overrides,
  };
  return { deps, order };
}

describe("request-kakande-trip handler", () => {
  it.each([
    ["single-line", "First line", "First line"],
    ["LF multiline", "First line\nSecond line", "First line\nSecond line"],
    ["CRLF multiline", "First line\r\nSecond line", "First line\nSecond line"],
    ["CR multiline", "First line\rSecond line", "First line\nSecond line"],
  ])("accepts and normalizes %s notes", (label, notes, expected) => {
    const validated = validateKakandeRequest(requestBody({ notes }));
    expect(validated.request?.notes, label).toBe(expected);
  });

  it("defaults absent optional notes to an empty string", () => {
    const body = requestBody();
    delete (body as Record<string, unknown>).notes;
    expect(validateKakandeRequest(body).request?.notes).toBe("");
    expect(validateKakandeRequest(requestBody({ notes: "" })).request?.notes).toBe("");
  });

  it("accepts the 400-character notes limit and rejects longer or unsafe control content", () => {
    expect(validateKakandeRequest(requestBody({ notes: "x".repeat(400) })).request?.notes).toHaveLength(400);
    expect(validateKakandeRequest(requestBody({ notes: "x".repeat(401) })).request).toBeNull();
    expect(validateKakandeRequest(requestBody({ notes: "unsafe\u0001note" })).request).toBeNull();
    expect(validateKakandeRequest(requestBody({ notes: "unsafe\ttab" })).request).toBeNull();
    expect(validateKakandeRequest(requestBody({ notes: "\tunsafe at boundary" })).request).toBeNull();
  });

  it("passes normalized notes to persistence so accepted line endings cannot fail RPC validation", async () => {
    const { deps } = dependencies();
    const handler = createKakandeTripHandler(deps);
    const response = await handler(post(requestBody({ notes: "First line\r\nSecond line" })));
    expect(response.status).toBe(200);
    expect(deps.saveRequest).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "First line\nSecond line" }),
      tripSnapshot,
      expect.any(String),
      expect.any(String),
      expect.any(String),
      null,
    );
  });

  it("rejects client-supplied passport or price fields instead of collecting/trusting them", () => {
    expect(validateKakandeRequest(requestBody({ passport: "SYNTHETIC-PASSPORT" })).request).toBeNull();
    expect(validateKakandeRequest(requestBody({ pricePerTravellerZmw: 1, totalQuotedAmountZmw: 2 })).request).toBeNull();
    expect(validateKakandeRequest(requestBody({ user_id: "2e33f3a7-61e6-4971-8c2e-4dc817df7937" })).request).toBeNull();
  });

  it("rejects invalid customer data before CAPTCHA, quota, or persistence", async () => {
    expect(validateKakandeRequest(requestBody({ phone: "123" })).request).toBeNull();
    const { deps } = dependencies();
    const handler = createKakandeTripHandler(deps);
    const response = await handler(post(requestBody({ phone: "123" })));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    expect(deps.verifyCaptcha).not.toHaveBeenCalled();
    expect(deps.rateLimit).not.toHaveBeenCalled();
    expect(deps.saveRequest).not.toHaveBeenCalled();
  });

  it("rejects a missing Turnstile token before either limiter or persistence", async () => {
    const { deps } = dependencies();
    const handler = createKakandeTripHandler(deps);
    const body = requestBody();
    delete (body as Record<string, unknown>).turnstileToken;
    const response = await handler(post(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("CAPTCHA_REQUIRED");
    expect(deps.verifyCaptcha).not.toHaveBeenCalled();
    expect(deps.rateLimit).not.toHaveBeenCalled();
    expect(deps.saveRequest).not.toHaveBeenCalled();
  });

  it("rejects invalid CAPTCHA hostname/action before rate limits or persistence", async () => {
    const { deps } = dependencies({ verifyCaptcha: vi.fn(async () => ({ success: true, hostname: "attacker.example", action: "wrong" })) });
    const response = await createKakandeTripHandler(deps)(post(requestBody()));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("CAPTCHA_FAILED");
    expect(deps.rateLimit).not.toHaveBeenCalled();
    expect(deps.saveRequest).not.toHaveBeenCalled();
  });

  it("verifies CAPTCHA before separate address and global limits, then persists", async () => {
    const { deps, order } = dependencies();
    const response = await createKakandeTripHandler(deps)(post(requestBody()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reference, duplicate: false, snapshot: savedSnapshot });
    expect(deps.rateLimit).toHaveBeenNthCalledWith(1, "11111111-1111-4111-8111-111111111111", 4, 900);
    expect(deps.rateLimit).toHaveBeenNthCalledWith(2, KAKANDE_GLOBAL_LIMIT_IDENTITY, 60, 900);
    expect(order.indexOf("captcha")).toBeLessThan(order.indexOf("rate"));
    expect(order.indexOf("rate")).toBeLessThan(order.indexOf("persist"));
    expect(deps.hashRequest).toHaveBeenCalledWith(expect.objectContaining({ travellers: 2 }));
    expect(deps.saveRequest).toHaveBeenCalledWith(expect.any(Object), tripSnapshot, expect.any(String), "a".repeat(43), expect.any(String), null);
  });

  it("persists only the UID returned by Supabase Auth verification", async () => {
    const userId = "2e33f3a7-61e6-4971-8c2e-4dc817df7937";
    const { deps } = dependencies({ verifyAccessToken: vi.fn(async () => userId) });
    const response = await createKakandeTripHandler(deps)(post(requestBody(), "Bearer synthetic-access-token"));
    expect(response.status).toBe(200);
    expect(deps.verifyAccessToken).toHaveBeenCalledWith("synthetic-access-token");
    expect(deps.saveRequest).toHaveBeenCalledWith(expect.any(Object), tripSnapshot, expect.any(String), "a".repeat(43), expect.any(String), userId);
  });

  it.each([
    ["expired token", vi.fn(async () => null), 401, "INVALID_AUTH_TOKEN"],
    ["unavailable Auth verification", vi.fn(async () => { throw new Error("synthetic auth outage"); }), 503, "AUTH_VERIFICATION_UNAVAILABLE"],
  ])("rejects %s without downgrading to anonymous", async (_label, verifyAccessToken, status, code) => {
    const { deps } = dependencies({ verifyAccessToken });
    const response = await createKakandeTripHandler(deps)(post(requestBody(), "Bearer synthetic-token"));
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(deps.verifyCaptcha).not.toHaveBeenCalled();
    expect(deps.saveRequest).not.toHaveBeenCalled();
  });

  it("returns the original reference for a same-key duplicate retry", async () => {
    const saveRequest = vi.fn<KakandeDependencies["saveRequest"]>()
      .mockResolvedValueOnce({ outcome: "created", reference, snapshot: savedSnapshot })
      .mockResolvedValueOnce({ outcome: "duplicate", reference, snapshot: savedSnapshot });
    const { deps } = dependencies({
      saveRequest,
    });
    const handler = createKakandeTripHandler(deps);
    const first = await handler(post(requestBody()));
    const retry = await handler(post(requestBody()));
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ reference, duplicate: true, snapshot: savedSnapshot });
    expect(saveRequest).toHaveBeenCalledTimes(2);
    expect(saveRequest.mock.calls[0][2]).toBe(saveRequest.mock.calls[1][2]);
    expect(saveRequest.mock.calls[0][3]).toBe(saveRequest.mock.calls[1][3]);
  });

  it("returns a duplicate for an identical request with a different idempotency key", async () => {
    const saveRequest = vi.fn<KakandeDependencies["saveRequest"]>().mockResolvedValue({ outcome: "duplicate", reference, snapshot: savedSnapshot });
    const { deps } = dependencies({ saveRequest });
    const handler = createKakandeTripHandler(deps);
    const firstKey = requestBody();
    const secondKey = requestBody({ idempotencyKey: "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b" });
    const first = await handler(post(firstKey));
    const second = await handler(post(secondKey));
    expect(first.status).toBe(200);
    expect((await second.json())).toEqual({ reference, duplicate: true, snapshot: savedSnapshot });
    expect(saveRequest.mock.calls[0][2]).not.toBe(saveRequest.mock.calls[1][2]);
    expect(saveRequest.mock.calls[0][3]).toBe(saveRequest.mock.calls[1][3]);
  });

  it("rejects reuse of an idempotency key when the request content hash changes", async () => {
    const { deps } = dependencies({
      hashRequest: vi.fn(async (request) => request.notes === "Changed request" ? "x".repeat(43) : "a".repeat(43)),
      saveRequest: vi.fn(async (): Promise<SaveResult> => ({ outcome: "conflict" })),
    });
    const response = await createKakandeTripHandler(deps)(post(requestBody({ notes: "Changed request" })));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("REQUEST_CONFLICT");
  });

  it("rejects a stale trip option and never claims persistence without a database snapshot", async () => {
    const changed = dependencies({ saveRequest: vi.fn(async (): Promise<SaveResult> => ({ outcome: "trip_changed" })) });
    const changedResponse = await createKakandeTripHandler(changed.deps)(post(requestBody()));
    expect(changedResponse.status).toBe(409);
    expect((await changedResponse.json()).error.code).toBe("TRIP_CHANGED");

    const missingSnapshot = dependencies({ saveRequest: vi.fn(async (): Promise<SaveResult> => ({ outcome: "created", reference })) });
    const missingResponse = await createKakandeTripHandler(missingSnapshot.deps)(post(requestBody()));
    expect(missingResponse.status).toBe(503);
    expect((await missingResponse.json()).error.code).toBe("REQUEST_UNAVAILABLE");
  });

  it("returns 429 and does not persist when either quota is exhausted", async () => {
    for (const deniedCall of [1, 2]) {
      let calls = 0;
      const { deps } = dependencies({ rateLimit: vi.fn(async () => {
        calls += 1;
        return { allowed: calls !== deniedCall, retryAfterSeconds: 42 };
      }) });
      const response = await createKakandeTripHandler(deps)(post(requestBody()));
      expect(response.status).toBe(429);
      expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(deps.saveRequest).not.toHaveBeenCalled();
    }
  });

  it("fails closed on limiter storage errors and failed persistence", async () => {
    const rateFailure = dependencies({ rateLimit: vi.fn(async () => { throw new Error("synthetic storage failure"); }) });
    const rateResponse = await createKakandeTripHandler(rateFailure.deps)(post(requestBody()));
    expect(rateResponse.status).toBe(503);
    expect(rateFailure.deps.saveRequest).not.toHaveBeenCalled();

    const persistenceFailure = dependencies({ saveRequest: vi.fn(async (): Promise<SaveResult> => ({ outcome: "failed" })) });
    const persistResponse = await createKakandeTripHandler(persistenceFailure.deps)(post(requestBody()));
    expect(persistResponse.status).toBe(503);
    expect(await persistResponse.json()).toEqual({ error: { code: "REQUEST_UNAVAILABLE", message: "We couldn't confirm that the request was saved. Try again later." } });
  });

  it("fails closed when rate-limit identity metadata is unavailable", async () => {
    const { deps } = dependencies({ rateLimitIdentity: vi.fn(async () => { throw new Error("synthetic missing gateway identity"); }) });
    const response = await createKakandeTripHandler(deps)(post(requestBody()));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("RATE_LIMIT_UNAVAILABLE");
    expect(deps.rateLimit).not.toHaveBeenCalled();
    expect(deps.saveRequest).not.toHaveBeenCalled();
  });

  it("allows a closed trip's idempotent replay but rejects a new request", async () => {
    const saveRequest = vi.fn<KakandeDependencies["saveRequest"]>()
      .mockResolvedValueOnce({ outcome: "duplicate", reference, snapshot: savedSnapshot })
      .mockResolvedValueOnce({ outcome: "trip_unavailable" });
    const { deps } = dependencies({
      resolveTrip: vi.fn(async () => ({ ...tripSnapshot, available: false, travelDate: "2026-06-10" })),
      saveRequest,
    });
    const handler = createKakandeTripHandler(deps);
    const replay = await handler(post(requestBody()));
    expect(replay.status).toBe(200);
    expect((await replay.json()).reference).toBe(reference);
    const unavailable = await handler(post(requestBody({ idempotencyKey: "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b" })));
    expect(unavailable.status).toBe(409);
    expect((await unavailable.json()).error.code).toBe("TRIP_UNAVAILABLE");
  });

  it.each(["unpublished", "closed", "fully booked", "expired"]) (
    "consumes both quotas before the final database rejection (%s option)",
    async (availabilityState) => {
      const rateLimit = vi.fn<KakandeDependencies["rateLimit"]>(async () => ({ allowed: true, retryAfterSeconds: 30 }));
      const saveRequest = vi.fn<KakandeDependencies["saveRequest"]>(async () => ({ outcome: "trip_unavailable" }));
      const { deps } = dependencies({
        // The authoritative lookup marks the option unavailable. The database
        // RPC remains the final gate after quota checks and idempotency replay.
        resolveTrip: vi.fn(async () => ({ ...tripSnapshot, available: false })),
        rateLimit,
        saveRequest,
      });

      const response = await createKakandeTripHandler(deps)(post(requestBody()));

      expect(response.status, availabilityState).toBe(409);
      expect((await response.json()).error.code).toBe("TRIP_UNAVAILABLE");
      expect(rateLimit).toHaveBeenNthCalledWith(1, "11111111-1111-4111-8111-111111111111", 4, 900);
      expect(rateLimit).toHaveBeenNthCalledWith(2, KAKANDE_GLOBAL_LIMIT_IDENTITY, 60, 900);
      expect(saveRequest).toHaveBeenCalledTimes(1);
      expect(rateLimit.mock.invocationCallOrder[1])
        .toBeLessThan(saveRequest.mock.invocationCallOrder[0]);
    },
  );
});
