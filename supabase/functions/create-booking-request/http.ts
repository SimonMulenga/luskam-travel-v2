declare const Deno: { env: { get(name: string): string | undefined } };

function parseAllowedOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    const isSecure = parsed.protocol === "https:";
    const isLocal = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if ((!isSecure && !isLocal) || parsed.origin !== value || parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function allowedBookingOrigins(configured = (typeof Deno === "undefined" ? "" : Deno.env.get("BOOKING_ALLOWED_ORIGINS")) ?? "") {
  return new Set(configured.split(",").map((origin) => parseAllowedOrigin(origin.trim())).filter((origin): origin is string => origin !== null));
}

export function bookingCorsHeaders(req: Request, configured?: string): HeadersInit {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origin && allowedBookingOrigins(configured).has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function isAllowedBookingOrigin(req: Request, configured?: string) {
  const origin = req.headers.get("Origin");
  return !origin || allowedBookingOrigins(configured).has(origin);
}

export function bookingJson(req: Request, body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...bookingCorsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store", ...extraHeaders },
  });
}
