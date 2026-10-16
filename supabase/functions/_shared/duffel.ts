// Thin, supplier-agnostic wrapper around the Duffel Flights API.
// Swapping supplier later = replace this file + the mappers in pricing.ts consumers.

const DUFFEL_BASE = "https://api.duffel.com";
const DUFFEL_VERSION = "v2";

export class DuffelError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export function duffelKey(): string {
  const key = Deno.env.get("DUFFEL_API_KEY");
  if (!key) throw new DuffelError("Flight supplier is not configured", 503);
  return key;
}

export async function duffelFetch<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 25000);
  try {
    const resp = await fetch(`${DUFFEL_BASE}${path}`, {
      method: init.method ?? "GET",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${duffelKey()}`,
        "Duffel-Version": DUFFEL_VERSION,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: init.body ? JSON.stringify({ data: init.body }) : undefined,
    });
    const text = await resp.text();
    const json = text ? JSON.parse(text) : {};
    if (!resp.ok) {
      const first = json?.errors?.[0];
      throw new DuffelError(
        first?.message ?? first?.title ?? `Supplier request failed (${resp.status})`,
        resp.status === 404 ? 404 : resp.status === 422 ? 422 : 502,
      );
    }
    return json.data as T;
  } catch (e) {
    if (e instanceof DuffelError) throw e;
    if ((e as Error).name === "AbortError") throw new DuffelError("Supplier timed out", 504);
    throw new DuffelError((e as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

export type CabinClass = "economy" | "premium_economy" | "business" | "first";

export function normalizeCabin(input?: string): CabinClass {
  const c = (input ?? "economy").toLowerCase().replace(/[\s-]+/g, "_");
  if (c.startsWith("premium")) return "premium_economy";
  if (c.startsWith("business")) return "business";
  if (c.startsWith("first")) return "first";
  return "economy";
}

export function cabinLabel(c: CabinClass): string {
  return { economy: "Economy", premium_economy: "Premium Economy", business: "Business", first: "First" }[c];
}

// ---- Offer shaping (what the frontend consumes) ----

export interface Segment {
  from: string;
  to: string;
  depart: string; // ISO
  arrive: string; // ISO
  airline: string;
  airlineCode: string;
  flightNumber: string;
  duration: string;
  aircraft?: string;
}

export interface ShapedOffer {
  id: string;
  airline: string;
  airlineCode: string;
  code: string;
  from: string;
  to: string;
  depart: string; // HH:mm
  arrive: string; // HH:mm
  departIso: string;
  arriveIso: string;
  duration: string;
  stops: string;
  stopCount: number;
  cabin: string;
  fareType: string;
  baggage: string;
  currency: string;
  price: number; // customer-facing total (all passengers)
  pricePerPax: number;
  passengerCount: number;
  expiresAt?: string;
  segments: Segment[];
  slices: { from: string; to: string; segments: Segment[] }[];
  live: true;
}

export interface DuffelOffer {
  id: string;
  owner?: DuffelCarrier;
  slices?: DuffelSlice[];
  passengers?: { id: string; type?: string; age?: number }[];
  expires_at?: string;
  total_amount?: string;
  total_currency?: string;
}

export interface DuffelCarrier {
  name?: string;
  iata_code?: string;
}

interface DuffelSlice {
  origin?: { iata_code?: string; iata_country_code?: string };
  destination?: { iata_code?: string; iata_country_code?: string };
  duration?: string;
  segments?: DuffelSegment[];
}

interface DuffelSegment {
  origin?: { iata_code?: string };
  destination?: { iata_code?: string };
  departing_at: string;
  arriving_at: string;
  marketing_carrier?: DuffelCarrier;
  marketing_carrier_flight_number?: string;
  duration?: string;
  aircraft?: { name?: string };
  passengers?: {
    cabin_class?: string;
    cabin_class_marketing_name?: string;
    baggages?: { type: string; quantity?: number }[];
  }[];
}

function hhmm(iso: string): string {
  const d = iso.length <= 19 ? new Date(iso + "Z") : new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function isoDurationToText(d?: string): string {
  if (!d) return "";
  const m = d.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return "";
  const days = Number(m[1] ?? 0), h = Number(m[2] ?? 0), min = Number(m[3] ?? 0);
  return `${days * 24 + h}h ${min}m`;
}

export function shapeOffer(offer: DuffelOffer): Omit<ShapedOffer, "price" | "pricePerPax"> & { supplierTotal: number } {
  const slices = (offer.slices ?? []).map((s) => ({
    from: s.origin?.iata_code ?? "",
    to: s.destination?.iata_code ?? "",
    segments: (s.segments ?? []).map((seg): Segment => ({
      from: seg.origin?.iata_code ?? "",
      to: seg.destination?.iata_code ?? "",
      depart: seg.departing_at,
      arrive: seg.arriving_at,
      airline: seg.marketing_carrier?.name ?? offer.owner?.name ?? "Airline",
      airlineCode: seg.marketing_carrier?.iata_code ?? offer.owner?.iata_code ?? "",
      flightNumber: `${seg.marketing_carrier?.iata_code ?? ""} ${seg.marketing_carrier_flight_number ?? ""}`.trim(),
      duration: isoDurationToText(seg.duration),
      aircraft: seg.aircraft?.name,
    })),
  }));

  const first = slices[0];
  const segs: Segment[] = first?.segments ?? [];
  const firstSeg = segs[0];
  const lastSeg = segs[segs.length - 1];
  const stopCount = Math.max(0, segs.length - 1);

  const bagQty = offer.slices?.[0]?.segments?.[0]?.passengers?.[0]?.baggages
    ?.find((b) => b.type === "checked")?.quantity ?? 0;

  return {
    id: offer.id,
    airline: offer.owner?.name ?? firstSeg?.airline ?? "Airline",
    airlineCode: offer.owner?.iata_code ?? firstSeg?.airlineCode ?? "",
    code: firstSeg?.flightNumber ?? "",
    from: first?.from ?? "",
    to: first?.to ?? "",
    depart: firstSeg ? hhmm(firstSeg.depart) : "",
    arrive: lastSeg ? hhmm(lastSeg.arrive) : "",
    departIso: firstSeg?.depart ?? "",
    arriveIso: lastSeg?.arrive ?? "",
    duration: isoDurationToText(offer.slices?.[0]?.duration),
    stops: stopCount === 0 ? "Direct" : `${stopCount} stop${stopCount > 1 ? "s" : ""} · ${segs.slice(0, -1).map((s) => s.to).join(", ")}`,
    stopCount,
    cabin: cabinLabel(normalizeCabin(offer.slices?.[0]?.segments?.[0]?.passengers?.[0]?.cabin_class ?? "economy")),
    fareType: offer.slices?.[0]?.segments?.[0]?.passengers?.[0]?.cabin_class_marketing_name ?? "Standard fare",
    baggage: bagQty > 0 ? `${bagQty} checked bag${bagQty > 1 ? "s" : ""}` : "Cabin bag only",
    currency: offer.total_currency ?? "USD",
    expiresAt: offer.expires_at,
    segments: segs,
    slices,
    live: true as const,
    passengerCount: (offer.passengers ?? []).length || 1,
    supplierTotal: Number(offer.total_amount ?? 0),
  };
}
