const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;

export type TurnstileResult = {
  success: boolean;
  hostname?: string;
  action?: string;
};

/** Server-side, single-use Turnstile validation. Never logs tokens or provider responses. */
export async function verifyTurnstileToken(
  token: string,
  secret: string | undefined,
  fetcher: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<TurnstileResult> {
  if (!secret || secret.trim().length < 1 || !Number.isInteger(timeoutMs) || timeoutMs < 1
    || typeof token !== "string" || token.trim().length === 0 || token.length > MAX_TOKEN_LENGTH) {
    throw new Error("turnstile_unavailable");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("turnstile_provider_error");

    let body: unknown;
    try { body = await response.json(); } catch { throw new Error("turnstile_invalid_response"); }
    if (!body || typeof body !== "object" || Array.isArray(body)
      || typeof (body as Record<string, unknown>).success !== "boolean") {
      throw new Error("turnstile_invalid_response");
    }
    const result = body as Record<string, unknown>;
    if (result.success === false) {
      const errorCodes = result["error-codes"];
      if (errorCodes !== undefined && (!Array.isArray(errorCodes) || errorCodes.some((code) => typeof code !== "string"))) {
        throw new Error("turnstile_invalid_response");
      }
      // Configuration/provider faults are service failures, not customer token failures.
      if (Array.isArray(errorCodes) && errorCodes.some((code) =>
        ["missing-input-secret", "invalid-input-secret", "internal-error"].includes(code as string))) {
        throw new Error("turnstile_provider_error");
      }
      return { success: false };
    }
    if (typeof result.hostname !== "string" || typeof result.action !== "string") {
      throw new Error("turnstile_invalid_response");
    }
    return { success: true, hostname: result.hostname, action: result.action };
  } catch {
    // Collapse network, timeout, provider, and parse errors into a safe internal failure.
    throw new Error("turnstile_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}
