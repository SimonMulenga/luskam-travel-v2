import { describe, expect, it, vi } from "vitest";
import { verifyKakandeTurnstile } from "../../supabase/functions/request-kakande-trip/turnstile";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Kakande Turnstile Siteverify", () => {
  it("accepts only a valid single-use token response from the provider", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({ success: true, hostname: "luskam-travel-v2.vercel.app", action: "kakande_trip_request" }));
    await expect(verifyKakandeTurnstile("synthetic-token", "synthetic-secret", fetcher)).resolves.toEqual({
      success: true, hostname: "luskam-travel-v2.vercel.app", action: "kakande_trip_request",
    });
    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(String(init?.body)).toContain("synthetic-token");
  });

  it("fails closed for missing secret, expired/replayed tokens, HTTP failure and malformed JSON", async () => {
    await expect(verifyKakandeTurnstile("synthetic-token", undefined, vi.fn())).rejects.toThrow();
    const rejectedToken = vi.fn(async () => response({ success: false, "error-codes": ["timeout-or-duplicate"] }));
    await expect(verifyKakandeTurnstile("synthetic-token", "synthetic-secret", rejectedToken)).resolves.toEqual({ success: false });
    await expect(verifyKakandeTurnstile("synthetic-token", "synthetic-secret", vi.fn(async () => response({}, 503)))).rejects.toThrow();
    const malformed = vi.fn(async () => new Response("not-json", { status: 200 }));
    await expect(verifyKakandeTurnstile("synthetic-token", "synthetic-secret", malformed)).rejects.toThrow();
  });
});
