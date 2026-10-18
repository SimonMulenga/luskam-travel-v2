import { describe, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "../../supabase/functions/request-flight-quote/turnstile";

const token = "synthetic-turnstile-token";
const secret = "synthetic-server-secret";
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("Turnstile Siteverify adapter", () => {
  it("posts the token and secret only to Cloudflare and returns verified hostname/action", async () => {
    const fetcher = vi.fn(async () => ok({ success: true, hostname: "luskam-travel-v2.vercel.app", action: "flight_quote_request" }));
    await expect(verifyTurnstileToken(token, secret, fetcher)).resolves.toEqual({
      success: true, hostname: "luskam-travel-v2.vercel.app", action: "flight_quote_request",
    });
    expect(fetcher).toHaveBeenCalledWith("https://challenges.cloudflare.com/turnstile/v0/siteverify", expect.objectContaining({
      method: "POST", body: JSON.stringify({ secret, response: token }),
    }));
  });

  it.each([
    ["invalid", { success: false }],
    ["expired", { success: false, "error-codes": ["timeout-or-duplicate"] }],
    ["replayed", { success: false, "error-codes": ["timeout-or-duplicate"] }],
  ])("treats %s tokens as an unsuccessful verification", async (_name, body) => {
    await expect(verifyTurnstileToken(token, secret, async () => ok(body))).resolves.toEqual({ success: false });
  });

  it("fails closed for missing token or secret", async () => {
    const fetcher = vi.fn();
    await expect(verifyTurnstileToken("", secret, fetcher)).rejects.toThrow("turnstile_unavailable");
    await expect(verifyTurnstileToken(token, undefined, fetcher)).rejects.toThrow("turnstile_unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects malformed response shapes, malformed JSON and provider HTTP errors", async () => {
    await expect(verifyTurnstileToken(token, secret, async () => ok({ success: "yes" }))).rejects.toThrow("turnstile_unavailable");
    await expect(verifyTurnstileToken(token, secret, async () => new Response("not-json"))).rejects.toThrow("turnstile_unavailable");
    await expect(verifyTurnstileToken(token, secret, async () => ok({}, 502))).rejects.toThrow("turnstile_unavailable");
    await expect(verifyTurnstileToken(token, secret, async () => ok({ success: false, "error-codes": ["invalid-input-secret"] })))
      .rejects.toThrow("turnstile_unavailable");
  });

  it("fails safely on network errors and timeout aborts", async () => {
    await expect(verifyTurnstileToken(token, secret, async () => { throw new Error("sensitive transport detail"); }))
      .rejects.toThrow("turnstile_unavailable");
    const timedOutFetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    await expect(verifyTurnstileToken(token, secret, timedOutFetch, 1)).rejects.toThrow("turnstile_unavailable");
  });
});
