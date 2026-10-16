// Airport departure/arrival schedule (FlightAPI). Aviation data only.
import { corsHeaders, json } from "../_shared/cors.ts";
import { getPricingProvider } from "../_shared/flight/registry.ts";
import { ProviderError } from "../_shared/flight/types.ts";

interface ScheduleFlight {
  flight?: {
    identification?: { number?: { default?: string } };
    airline?: { name?: string; code?: { iata?: string } };
    airport?: {
      origin?: { name?: string; code?: { iata?: string } };
      destination?: { name?: string; code?: { iata?: string } };
    };
    status?: { text?: string };
    time?: { scheduled?: { departure?: number; arrival?: number } };
  };
}

interface ProviderSchedulePayload {
  airport?: {
    pluginData?: {
      details?: {
        name?: string;
        code?: { iata?: string };
        timezone?: { name?: string };
      };
      schedule?: Partial<Record<"departures" | "arrivals", { data?: ScheduleFlight[] }>>;
    };
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { iata, mode, day } = await req.json();
    if (!iata) return json({ error: "iata is required" }, 400);
    const direction: "departures" | "arrivals" = mode === "arrivals" ? "arrivals" : "departures";

    const raw = await getPricingProvider().airportSchedule(
      String(iata).toUpperCase().slice(0, 3),
      direction,
      Number(day) || 1,
    );

    const details = (raw as ProviderSchedulePayload | null)?.airport?.pluginData ?? {};
    const airport = details?.details ?? {};
    const list: ScheduleFlight[] = details?.schedule?.[direction]?.data ?? [];

    const flights = list.map((row) => {
      const f = row.flight ?? {};
      const epoch = direction === "departures"
        ? f.time?.scheduled?.departure
        : f.time?.scheduled?.arrival;
      return {
        flightNumber: f.identification?.number?.default ?? null,
        airline: f.airline?.name ?? null,
        airlineCode: f.airline?.code?.iata ?? null,
        originCode: f.airport?.origin?.code?.iata ?? null,
        origin: f.airport?.origin?.name ?? null,
        destinationCode: f.airport?.destination?.code?.iata ?? null,
        destination: f.airport?.destination?.name ?? null,
        scheduledTime: epoch ? new Date(epoch * 1000).toISOString() : null,
        status: f.status?.text ?? null,
      };
    });

    return json({
      airport: {
        name: airport?.name ?? null,
        iata: airport?.code?.iata ?? null,
        timezone: airport?.timezone?.name ?? null,
      },
      direction,
      flights,
    });
  } catch (e) {
    const err = e as ProviderError;
    return json({ error: err.message ?? "Schedule unavailable", code: err.code ?? "ERROR" }, err.status ?? 502);
  }
});
