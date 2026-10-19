export type KakandeTripRequest = {
  tripId: string;
  mode: "flight" | "road";
  travellers: number;
  fullName: string;
  email: string;
  phone: string;
  notes: string;
};

export type ValidatedKakandeRequest = {
  request: KakandeTripRequest | null;
  idempotencyKey: string | null;
  turnstileToken: string | null;
};

const REQUEST_FIELDS = new Set([
  "tripId", "mode", "travellers", "fullName", "email", "phone", "notes",
  "idempotencyKey", "turnstileToken",
]);

const clean = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const result = value.trim();
  // Reject control bytes in single-line customer fields so they cannot reach staff tools/logs.
  // eslint-disable-next-line no-control-regex
  if (result.length > max || /[\u0000-\u001f\u007f]/.test(result)) return null;
  return result;
};

const cleanNotes = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  // Normalize Windows CRLF and legacy CR to LF before hashing and persistence.
  const normalized = value.replace(/\r\n?/g, "\n");
  // LF is the only permitted control character in notes; tabs and all others are rejected.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(normalized)) return null;
  const result = normalized.trim();
  if (result.length > max) return null;
  return result;
};

export function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function validateKakandeRequest(value: unknown): ValidatedKakandeRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { request: null, idempotencyKey: null, turnstileToken: null };
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !REQUEST_FIELDS.has(key))) {
    return { request: null, idempotencyKey: null, turnstileToken: null };
  }

  const tripId = clean(input.tripId, 32);
  const mode = input.mode;
  const travellers = input.travellers;
  const fullName = clean(input.fullName, 80);
  const email = clean(input.email, 120)?.toLowerCase() ?? null;
  const phone = clean(input.phone, 20);
  const notes = input.notes == null ? "" : cleanNotes(input.notes, 400);
  const idempotencyKey = isUuid(input.idempotencyKey) ? input.idempotencyKey.toLowerCase() : null;
  const turnstileToken = typeof input.turnstileToken === "string" ? input.turnstileToken.trim() : null;
  const phoneDigits = phone?.replace(/\D/g, "") ?? "";

  if (!tripId || !/^[a-z0-9-]+$/.test(tripId)
    || (mode !== "flight" && mode !== "road")
    || typeof travellers !== "number" || !Number.isInteger(travellers) || travellers < 1 || travellers > 10
    || !fullName || fullName.length < 2
    || !email || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !phone || !/^\+?[0-9][0-9\s().-]{5,19}$/.test(phone) || phoneDigits.length < 7
    || notes === null || !idempotencyKey
    || (turnstileToken !== null && turnstileToken.length > 2048)) {
    return { request: null, idempotencyKey: null, turnstileToken: null };
  }

  return {
    request: { tripId, mode, travellers, fullName, email, phone, notes },
    idempotencyKey,
    turnstileToken,
  };
}

/** Header input is supplementary rate-limit metadata, never an authenticated identity. */
export function gatewayReportedAddress(request: Request): string | null {
  const raw = request.headers.get("cf-connecting-ip");
  if (!raw || raw !== raw.trim() || raw.length > 45 || raw.includes(",") || /\s/.test(raw)) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) {
    const parts = raw.split(".").map(Number);
    return parts.every((part) => part >= 0 && part <= 255) ? parts.join(".") : null;
  }
  if (!raw.includes(":")) return null;
  try {
    const hostname = new URL(`http://[${raw}]/`).hostname;
    return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1).toLowerCase() : null;
  } catch { return null; }
}
