const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Verify a presented user access token with Supabase Auth. Never log the token or response. */
export async function verifyCustomerAccessToken(
  supabaseUrl: string,
  apiKey: string,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  if (!apiKey || !accessToken || accessToken.length > 8192) return null;

  let endpoint: URL;
  try {
    endpoint = new URL("/auth/v1/user", supabaseUrl);
  } catch {
    throw new Error("auth verification configuration unavailable");
  }
  if (endpoint.protocol !== "https:") throw new Error("auth verification configuration unavailable");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetcher(endpoint, {
      method: "GET",
      headers: { apikey: apiKey, Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if ([400, 401, 403].includes(response.status)) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("auth verification unavailable");
    }

    let user: unknown;
    try {
      user = await response.json();
    } catch {
      throw new Error("auth verification response unavailable");
    }
    if (!user || typeof user !== "object" || !("id" in user)
      || typeof user.id !== "string" || !UUID_PATTERN.test(user.id)) return null;
    return user.id.toLowerCase();
  } finally {
    clearTimeout(timeout);
  }
}
