// Aviationstack = AVIATION DATA provider only.
// It returns airlines, airports, flight numbers, schedules and live status.
// It does NOT sell tickets, so every result it produces is marked
// bookable: false / kind: "flight_information" and carries no price.
import {
  BaseFlightProvider,
  type FlightSearchQuery,
  type FlightSearchResult,
  type ProviderCapabilities,
  ProviderError,
} from "./types.ts";
import { logProviderCall } from "./logging.ts";

const BASE = "https://api.aviationstack.com/v1";
const TIMEOUT_MS = 9000;

interface StackFlight {
  flight_date?: string;
  flight_status?: string;
  departure?: { airport?: string; iata?: string; scheduled?: string; estimated?: string; terminal?: string };
  arrival?: { airport?: string; iata?: string; scheduled?: string; estimated?: string; terminal?: string };
  airline?: { name?: string; iata?: string };
  flight?: { number?: string; iata?: string; icao?: string };
  aircraft?: { registration?: string; iata?: string; model?: string } | null;
}

async function fetchJson(url: URL, action: string, meta: Record<string, unknown>) {
  const requestAt = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const endpoint = `${url.origin}${url.pathname}`;
  try {
    const resp = await fetch(url.toString(), { signal: ctrl.signal });
    const body = await resp.json().catch(() => null);

    if (resp.status === 429) {
      await logProviderCall({ provider: "aviationstack", action, endpoint, requestAt, success: false, httpStatus: 429, errorCode: "RATE_LIMIT", errorMessage: "Rate limit reached", meta });
      throw new ProviderError("Aviation data rate limit reached. Please try again shortly.", "RATE_LIMIT", 429);
    }
    const apiError = body?.error;
    if (apiError) {
      await logProviderCall({ provider: "aviationstack", action, endpoint, requestAt, success: false, httpStatus: resp.status, errorCode: apiError.code ?? "PROVIDER_ERROR", errorMessage: apiError.message ?? apiError.info, meta });
      throw new ProviderError(apiError.message ?? apiError.info ?? "Aviation data provider error", String(apiError.code ?? "PROVIDER_ERROR"), 502);
    }
    if (!resp.ok) {
      await logProviderCall({ provider: "aviationstack", action, endpoint, requestAt, success: false, httpStatus: resp.status, errorCode: "HTTP_ERROR", errorMessage: `HTTP ${resp.status}`, meta });
      throw new ProviderError(`Aviation data provider returned HTTP ${resp.status}`, "HTTP_ERROR", 502);
    }

    await logProviderCall({ provider: "aviationstack", action, endpoint, requestAt, success: true, httpStatus: resp.status, meta: { ...meta, count: body?.data?.length ?? 0 } });
    return body;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    const aborted = (e as Error).name === "AbortError";
    await logProviderCall({
      provider: "aviationstack", action, endpoint, requestAt, success: false,
      errorCode: aborted ? "TIMEOUT" : "NETWORK_ERROR", errorMessage: (e as Error).message, meta,
    });
    throw new ProviderError(
      aborted ? "Aviation data provider timed out." : "Could not reach the aviation data provider.",
      aborted ? "TIMEOUT" : "NETWORK_ERROR",
      504,
    );
  } finally {
    clearTimeout(timer);
  }
}

const minutesBetween = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 60000;
  return Number.isFinite(d) && d > 0 && d < 60 * 30 ? Math.round(d) : null;
};

export class AviationstackProvider extends BaseFlightProvider {
  readonly name = "aviationstack";
  readonly capabilities: ProviderCapabilities = {
    aviationData: true,
    liveInventory: false,
    livePricing: false,
    revalidation: false,
    booking: false,
    ticketing: false,
    cancellation: false,
    refunds: false,
    seatSelection: false,
    ancillaries: false,
  };

  private key(): string {
    const k = Deno.env.get("AVIATIONSTACK_API_KEY");
    if (!k) throw new ProviderError("Aviation data is not configured.", "PROVIDER_NOT_CONFIGURED", 503);
    return k;
  }

  async searchFlights(query: FlightSearchQuery): Promise<FlightSearchResult[]> {
    const url = new URL(`${BASE}/flights`);
    url.searchParams.set("access_key", this.key());
    url.searchParams.set("dep_iata", query.origin.toUpperCase());
    url.searchParams.set("arr_iata", query.destination.toUpperCase());
    url.searchParams.set("limit", "40");
    if (query.departureDate) url.searchParams.set("flight_date", query.departureDate);

    const body = await fetchJson(url, "searchFlights", {
      origin: query.origin, destination: query.destination, date: query.departureDate,
    });

    const rows = (body?.data ?? []) as StackFlight[];
    const seen = new Set<string>();
    const results: FlightSearchResult[] = [];

    for (const f of rows) {
      const depIso = f.departure?.scheduled ?? f.departure?.estimated ?? null;
      const arrIso = f.arrival?.scheduled ?? f.arrival?.estimated ?? null;
      const number = f.flight?.iata ?? f.flight?.icao ?? (f.flight?.number ? `${f.airline?.iata ?? ""}${f.flight.number}` : null);
      if (!number) continue;
      const dedupe = `${number}-${depIso ?? ""}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      results.push({
        id: `aviationstack:${dedupe}`,
        provider: this.name,
        providerReference: number,
        flightNumber: number,
        airline: f.airline?.name ?? null,
        airlineCode: f.airline?.iata ?? null,
        aircraft: f.aircraft?.model ?? f.aircraft?.iata ?? null,
        origin: f.departure?.airport ?? null,
        originCode: f.departure?.iata ?? query.origin.toUpperCase(),
        destination: f.arrival?.airport ?? null,
        destinationCode: f.arrival?.iata ?? query.destination.toUpperCase(),
        departureDateTime: depIso,
        arrivalDateTime: arrIso,
        durationMinutes: minutesBetween(depIso, arrIso),
        stops: 0,
        status: f.flight_status ?? null,
        cabinClass: query.cabinClass,
        // No fare data exists here — never fabricate one.
        supplierPrice: null,
        markupAmount: null,
        customerPrice: null,
        currency: null,
        bookable: false,
        kind: "flight_information",
      });
    }

    results.sort((a, b) => (a.departureDateTime ?? "").localeCompare(b.departureDateTime ?? ""));
    return results;
  }

  /** Airline lookup (aviation data only). */
  async getAirline(iata: string) {
    const url = new URL(`${BASE}/airlines`);
    url.searchParams.set("access_key", this.key());
    url.searchParams.set("iata_code", iata.toUpperCase());
    url.searchParams.set("limit", "1");
    const body = await fetchJson(url, "getAirline", { iata });
    return body?.data?.[0] ?? null;
  }

  /** Airport lookup (aviation data only). */
  async getAirport(iata: string) {
    const url = new URL(`${BASE}/airports`);
    url.searchParams.set("access_key", this.key());
    url.searchParams.set("iata_code", iata.toUpperCase());
    url.searchParams.set("limit", "1");
    const body = await fetchJson(url, "getAirport", { iata });
    return body?.data?.[0] ?? null;
  }

  /** Live status for a single flight number. */
  async getFlightStatus(flightNumber: string, date?: string) {
    const url = new URL(`${BASE}/flights`);
    url.searchParams.set("access_key", this.key());
    url.searchParams.set("flight_iata", flightNumber.replace(/\s+/g, "").toUpperCase());
    if (date) url.searchParams.set("flight_date", date);
    url.searchParams.set("limit", "1");
    const body = await fetchJson(url, "getFlightStatus", { flightNumber, date });
    return body?.data?.[0] ?? null;
  }
}
