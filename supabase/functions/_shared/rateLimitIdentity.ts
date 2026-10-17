const encoder = new TextEncoder();

/** Produce a stable pseudonymous UUID from a trusted gateway address and server secret. */
export async function rateLimitIdentityFromAddress(
  address: string,
  secret: string,
  namespace = "luskam-flight-search-v1",
): Promise<string> {
  if (!secret || !namespace) throw new Error("Rate limit identity configuration is unavailable");
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(`${namespace}:${address}`)));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
