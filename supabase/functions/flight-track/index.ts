// Flight tracking (FlightAPI). Aviation data only — never a booking surface.
import { corsHeaders, json } from "../_shared/cors.ts";
import { getPricingProvider } from "../_shared/flight/registry.ts";
import { ProviderError } from "../_shared/flight/types.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { airlineCode, flightNumber, date } = await req.json();
    if (!airlineCode || !flightNumber) {
      return json({ error: "airlineCode and flightNumber are required" }, 400);
    }
    const data = await getPricingProvider().trackFlight(String(airlineCode), String(flightNumber), date);
    const flights = (data as { flights?: unknown[] })?.flights ?? [];
    if (!Array.isArray(flights) || flights.length === 0) {
      return json({ flights: [], message: "No tracking information available for that flight." });
    }
    return json({ flights });
  } catch (e) {
    const err = e as ProviderError;
    return json({ error: err.message ?? "Tracking unavailable", code: err.code ?? "ERROR" }, err.status ?? 502);
  }
});
