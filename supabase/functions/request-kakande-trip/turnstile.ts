const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type KakandeTurnstileResult = { success: boolean; hostname?: string; action?: string };

/** Verify one single-use token. Do not log the token or Siteverify response. */
export async function verifyKakandeTurnstile(
  token: string,
  secret: string | undefined,
  fetcher: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<KakandeTurnstileResult> {
  if (!secret || secret.trim().length === 0 || !token || token.length > 2048) {
    throw new Error("turnstile_unavailable");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("turnstile_provider_error");
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)
      || typeof (body as Record<string, unknown>).success !== "boolean") {
      throw new Error("turnstile_invalid_response");
    }
    const result = body as Record<string, unknown>;
    return {
      success: result.success === true,
      ...(typeof result.hostname === "string" ? { hostname: result.hostname } : {}),
      ...(typeof result.action === "string" ? { action: result.action } : {}),
    };
  } catch {
    throw new Error("turnstile_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}
