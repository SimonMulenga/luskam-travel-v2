export type FlightQueryShape = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  cabinClass: string;
  passengers: { adults: number; children: number; infants: number };
};

const CONTROLLED = new Set([
  "user_id", "userid", "owner_id", "ownerid", "role", "is_admin", "is_staff",
  "total_amount", "amount", "price", "supplier_price", "markup", "markup_amount",
  "currency", "status", "booking_status", "payment_status", "ticket_status",
  "ticket_number", "ticket_details", "pnr", "reference", "provider_offer_id",
  "provider_booking_reference", "provider_reference", "payment_reference",
]);

export function hasClientControlledFields(body: Record<string, unknown>) {
  return Object.keys(body).some((key) => CONTROLLED.has(key.toLowerCase()));
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isStrictCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function quoteMatchesCurrent(
  old: { uid: string; exp: number; nonce: string; providerReference: string; query: unknown; pricing: { customer_price: number }; currency: string },
  current: { uid: string; exp: number; nonce: string; providerReference: string; query: unknown; pricing: { customer_price: number }; currency: string },
  now = Date.now(),
) {
  return old.uid === current.uid && old.exp >= now && old.nonce === current.nonce
    && old.providerReference === current.providerReference
    && JSON.stringify(old.query) === JSON.stringify(current.query)
    && old.pricing.customer_price === current.pricing.customer_price
    && old.currency === current.currency;
}

export function passengerTypesMatch(value: unknown, counts: FlightQueryShape["passengers"]) {
  if (!Array.isArray(value)) return false;
  return value.filter((person) => person && typeof person === "object" && "type" in person && String(person.type).toLowerCase() === "adult").length === counts.adults
    && value.filter((person) => person && typeof person === "object" && "type" in person && String(person.type).toLowerCase() === "child").length === counts.children
    && value.filter((person) => person && typeof person === "object" && "type" in person && String(person.type).toLowerCase() === "infant").length === counts.infants;
}

export function unpricedBookingDefaults(type: string) {
  return { total_amount: 0, currency: type === "kakande" ? "ZMW" : "USD", status: "pending", payment_status: "pending" } as const;
}

const INQUIRY_FIELDS: Record<string, ReadonlySet<string>> = {
  flight: new Set(["route", "origin", "destination", "departureDate", "returnDate", "cabin", "passengers"]),
  hotel: new Set(["hotelId", "name", "city", "nights", "rooms", "adults", "checkIn", "checkOut"]),
  car: new Set(["carId", "brand", "model", "pickup", "dropoff", "pdate", "ddate", "ptime", "dtime", "days"]),
  visa: new Set(["country", "visaType", "travelDate", "duration", "firstName", "lastName", "dob", "nationality", "passport", "passportExpiry", "email", "phone", "address", "notes"]),
  kakande: new Set(["trip", "tripId", "mode", "travellers", "fullName", "phone", "email", "passport", "notes"]),
};

function safeInquiryValue(value: unknown, depth: number): unknown {
  if (depth > 4) return undefined;
  if (typeof value === "string") return value.slice(0, 1000);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeInquiryValue(item, depth + 1)).filter((item) => item !== undefined);
  return undefined;
}

/** Keep only fields needed by the current inquiry forms; authority fields never persist. */
export function sanitizeInquiryDetails(value: unknown, type: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = INQUIRY_FIELDS[type] ?? new Set(["name", "email", "phone", "travelDate", "destination", "notes"]);
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value).slice(0, 30)) {
    if (!allowed.has(key)) continue;
    const safe = safeInquiryValue(entry, 0);
    if (safe !== undefined) result[key] = safe;
  }
  return result;
}
