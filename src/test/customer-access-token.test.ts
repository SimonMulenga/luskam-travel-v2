import { describe, expect, it, vi } from "vitest";
import { verifyCustomerAccessToken } from "../../supabase/functions/_shared/verifyCustomerAccessToken";

const userId = "2e33f3a7-61e6-4971-8c2e-4dc817df7937";

describe("Supabase Auth customer token verification", () => {
  it("derives ownership from the Auth user endpoint response", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe("https://synthetic.supabase.co/auth/v1/user");
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("apikey")).toBe("synthetic-publishable-key");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer synthetic-access-token");
      return Response.json({ id: userId, email: "synthetic@example.test" });
    });
    await expect(verifyCustomerAccessToken("https://synthetic.supabase.co", "synthetic-publishable-key", "synthetic-access-token", fetcher)).resolves.toBe(userId);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 403])("returns no identity for rejected Auth token status %s", async (status) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status }));
    await expect(verifyCustomerAccessToken("https://synthetic.supabase.co", "synthetic-key", "synthetic-token", fetcher)).resolves.toBeNull();
  });

  it("rejects a malformed user response and fails closed on provider errors", async () => {
    const malformed = vi.fn<typeof fetch>(async () => Response.json({ id: "not-a-uuid" }));
    await expect(verifyCustomerAccessToken("https://synthetic.supabase.co", "synthetic-key", "synthetic-token", malformed)).resolves.toBeNull();
    const outage = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }));
    await expect(verifyCustomerAccessToken("https://synthetic.supabase.co", "synthetic-key", "synthetic-token", outage)).rejects.toThrow("auth verification unavailable");
  });

  it("does not make non-HTTPS Auth calls", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(verifyCustomerAccessToken("http://synthetic.supabase.co", "synthetic-key", "synthetic-token", fetcher)).rejects.toThrow("auth verification configuration unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
