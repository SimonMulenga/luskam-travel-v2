// FlightAPI.io = live FARE PRICING + flight tracking + airport schedules.
// It supplies real market fares (supplier price). It is NOT a ticketing
// provider, so results stay bookable:false until a real booking provider is
// connected; the price it returns is genuine supplier data, never invented.
import {
  BaseFlightProvider,
  type CabinClass,
  type FlightSearchQuery,
  type FlightSearchResult,
  type ProviderCapabilities,
  ProviderError,
} from "./types.ts";
import { logProviderCall } from "./logging.ts";

const BASE = "https://api.flightapi.io";
const TIMEOUT_MS = 45000;

const CABIN_PARAM: Record<CabinClass, string> = {
  economy: "Economy",
  premium_economy: "Premium_Economy",
  business: "Business",
  first: "First",
};

interface Place { id: number; name?: string; display_code?: string; type?: string }
interface Carrier { id: number; name?: string; display_code?: string }
interface Segment {
  id: string;
  origin_place_id: number;
  destination_place_id: number;
  departure: string;
  arrival: string;
  duration: number;
  marketing_flight_number?: string;
  marketing_carrier_id?: number;
}
interface Leg {
  id: string;
  origin_place_id: number;
  destination_place_id: number;
  departure: string;
  arrival: string;
  duration: number;
  stop_count: number;
  segment_ids: string[];
  marketing_carrier_ids?: number[];
}
interface Itinerary {
  id: string;
  leg_ids: string[];
  pricing_options?: Array<{ id: string; price?: { amount?: number }; agent_ids?: string[] }>;
}
interface SearchBody {
  itineraries?: Itinerary[];
  legs?: Leg[];
  segments?: Segment[];
  places?: Place[];
  carriers?: Carrier[];
  message?: string;
  error?: string;
}

function apiKey(): string {
  const key = Deno.env.get("FLIGHTAPI_KEY");
  if (!key) throw new ProviderError("Flight pricing is not configured.", "PROVIDER_NOT_CONFIGURED", 503);
  return key;
}

async function call<T>(path: string, action: string, meta: Record<string, unknown>): Promise<T> {
  const requestAt = Date.now();
  const url = `${BASE}${path}`;
  const endpoint = url.replace(apiKey(), "***");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    const body = await resp.json().catch(() => null);
    if (resp.status === 429) {
      await logProviderCall({ provider: "flightapi", action, endpoint, requestAt, success: false, httpStatus: 429, errorCode: "RATE_LIMIT", errorMessage: "Rate limit reached", meta });
      throw new ProviderError("Flight pricing rate limit reached. Please try again shortly.", "RATE_LIMIT", 429);
    }
    if (!resp.ok) {
      const message = (body as { message?: string })?.message ?? `HTTP ${resp.status}`;
      await logProviderCall({ provider: "flightapi", action, endpoint, requestAt, success: false, httpStatus: resp.status, errorCode: "HTTP_ERROR", errorMessage: message, meta });
      throw new ProviderError(`Flight pricing provider error: ${message}`, "HTTP_ERROR", 502);
    }
    await logProviderCall({ provider: "flightapi", action, endpoint, requestAt, success: true, httpStatus: resp.status, meta });
    return body as T;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    const aborted = (e as Error).name === "AbortError";
    await logProviderCall({ provider: "flightapi", action, endpoint, requestAt, success: false, errorCode: aborted ? "TIMEOUT" : "NETWORK_ERROR", errorMessage: (e as Error).message, meta });
    throw new ProviderError(
      aborted ? "Flight pricing provider timed out." : "Could not reach the flight pricing provider.",
      aborted ? "TIMEOUT" : "NETWORK_ERROR",
      504,
    );
  } finally {
    clearTimeout(timer);
  }
}

export class FlightApiProvider extends BaseFlightProvider {
  readonly name = "flightapi";
  readonly capabilities: ProviderCapabilities = {
    aviationData: true,
    liveInventory: true,
    livePricing: true,
    revalidation: false,
    booking: false,
    ticketing: false,
    cancellation: false,
    refunds: false,
    seatSelection: false,
    ancillaries: false,
  };

  async searchFlights(q: FlightSearchQuery): Promise<FlightSearchResult[]> {
    const key = apiKey();
    const cabin = CABIN_PARAM[q.cabinClass] ?? "Economy";
    const { adults, children, infants } = q.passengers;
    const base = `/${q.origin}/${q.destination}/${q.departureDate}`;
    const tail = `/${adults}/${children}/${infants}/${cabin}/USD`;
    const path = q.returnDate
      ? `/roundtrip/${key}${base}/${q.returnDate}${tail}`
      : `/onewaytrip/${key}${base}${tail}`;

    const body = await call<SearchBody>(path, "searchFlights", {
      origin: q.origin,
      destination: q.destination,
      departureDate: q.departureDate,
      returnDate: q.returnDate ?? null,
      cabin: q.cabinClass,
    });
    const msg = (body as { message?: string }).message;
    if (msg && !body.itineraries) {
      throw new ProviderError("Live fares are temporarily unavailable (pricing quota reached). Please contact our travel desk.", /quota|limit/i.test(msg) ? "RATE_LIMIT" : "PROVIDER_ERROR", 429);
    }

    const places = new Map((body.places ?? []).map((p) => [p.id, p]));
    const carriers = new Map((body.carriers ?? []).map((c) => [c.id, c]));
    const legs = new Map((body.legs ?? []).map((l) => [l.id, l]));
    const segments = new Map((body.segments ?? []).map((s) => [s.id, s]));

    const code = (id?: number) => places.get(id ?? -1)?.display_code ?? null;
    const placeName = (id?: number) => places.get(id ?? -1)?.name ?? null;

    const results: FlightSearchResult[] = [];
    for (const itin of body.itineraries ?? []) {
      const outboundId = itin.leg_ids?.[0];
      const leg = outboundId ? legs.get(outboundId) : undefined;
      if (!leg) continue;
      const fare = (itin.pricing_options ?? [])
        .map((option) => ({ option, amount: Number(option.price?.amount) }))
        .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0)
        .sort((a, b) => a.amount - b.amount)[0];
      if (!fare) continue;
      const total = fare.amount;

      const segs = (leg.segment_ids ?? []).map((id) => segments.get(id)).filter(Boolean) as Segment[];
      const carrier = carriers.get(leg.marketing_carrier_ids?.[0] ?? segs[0]?.marketing_carrier_id ?? -1);
      const flightNumber = segs[0]?.marketing_flight_number
        ? `${carrier?.display_code ?? ""}${segs[0].marketing_flight_number}`
        : null;

      results.push({
        id: `fa-${itin.id}`,
        provider: this.name,
        providerReference: fare.option.id,
        flightNumber,
        airline: carrier?.name ?? null,
        airlineCode: carrier?.display_code ?? null,
        aircraft: null,
        origin: placeName(leg.origin_place_id),
        originCode: code(leg.origin_place_id) ?? q.origin,
        destination: placeName(leg.destination_place_id),
        destinationCode: code(leg.destination_place_id) ?? q.destination,
        departureDateTime: leg.departure ?? null,
        arrivalDateTime: leg.arrival ?? null,
        durationMinutes: leg.duration ?? null,
        stops: leg.stop_count ?? 0,
        status: null,
        cabinClass: q.cabinClass,
        supplierPrice: Math.round(total * 100) / 100,
        markupAmount: null, // applied by the pricing engine, server-side
        customerPrice: null,
        currency: "USD",
        bookable: false, // real ticketing provider not connected yet
        kind: "offer",
      });
    }
    return results;
  }

  /** Flight tracking by flight number, e.g. name=ET, num=863. */
  async trackFlight(airlineCode: string, flightNumber: string, date?: string) {
    const key = apiKey();
    const num = flightNumber.replace(/[^0-9]/g, "");
    const day = date ?? new Date().toISOString().slice(0, 10);
    const path = `/airline/${key}?num=${encodeURIComponent(num)}&name=${encodeURIComponent(airlineCode.toUpperCase())}&date=${day}`;
    return await call<unknown>(path, "trackFlight", { airlineCode, flightNumber: num, date: day });
  }

  /** Airport schedule: mode = departures | arrivals, day 1 = today. */
  async airportSchedule(iata: string, mode: "departures" | "arrivals" = "departures", day = 1) {
    const key = apiKey();
    const path = `/schedule/${key}?mode=${mode}&iata=${encodeURIComponent(iata)}&day=${day}`;
    return await call<unknown>(path, "airportSchedule", { iata, mode, day });
  }
}
