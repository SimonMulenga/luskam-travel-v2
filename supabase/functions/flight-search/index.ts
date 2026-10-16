// Flight search: live fares from the pricing provider (FlightAPI), with the
// server-side markup engine applied. Falls back to aviation schedule data
// (no price) when no fares are available. No price is ever invented.
import { corsHeaders, json } from "../_shared/cors.ts";
import { getDataProvider, getPricingProvider } from "../_shared/flight/registry.ts";
import { normalizeCabin, type FlightSearchQuery, type FlightSearchResult } from "../_shared/flight/types.ts";
import { applyRule, loadRules, pickRule } from "../_shared/pricing.ts";

interface Req {
  from?: string;
  to?: string;
  depart?: string;
  ret?: string | null;
  cabin?: string;
  adults?: number;
  children?: number;
  infants?: number;
}

const hhmm = (iso: string | null) => {
  if (!iso) return "--:--";
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? "--:--"
    : `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

const durationLabel = (min: number | null) =>
  min == null ? "—" : `${Math.floor(min / 60)}h ${min % 60}m`;

const stopsLabel = (n: number) => (n === 0 ? "Direct" : n === 1 ? "1 stop" : `${n} stops`);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: Req = {};
  try {
    body = await req.json();
  } catch { /* ignore */ }

  const from = (body.from ?? "").toUpperCase().slice(0, 3);
  const to = (body.to ?? "").toUpperCase().slice(0, 3);
  if (!from || !to) return json({ flights: [], error: "from and to are required" }, 400);

  const adults = Math.min(9, Math.max(1, Number(body.adults) || 1));
  const children = Math.min(8, Math.max(0, Number(body.children) || 0));
  const infants = Math.min(8, Math.max(0, Number(body.infants) || 0));
  const totalPax = Math.max(1, adults + children + infants);
  const cabinClass = normalizeCabin(body.cabin);

  const query: FlightSearchQuery = {
    origin: from,
    destination: to,
    departureDate: body.depart ?? new Date().toISOString().slice(0, 10),
    returnDate: body.ret || null,
    tripType: body.ret ? "return" : "oneway",
    cabinClass,
    passengers: { adults, children, infants },
  };

  const warnings: string[] = [];

  // 1) Live fares (real supplier prices) + server-side markup.
  try {
    const results = await getPricingProvider().searchFlights(query);
    if (results.length) {
      const rules = await loadRules();
      const flights = results
        .map((r: FlightSearchResult) => {
          const priced = applyRule(
            pickRule(rules, {
              supplierPrice: r.supplierPrice ?? 0,
              airlineCode: r.airlineCode ?? undefined,
              origin: r.originCode ?? from,
              destination: r.destinationCode ?? to,
              cabin: cabinClass,
              isDomestic: (r.originCode ?? from).slice(0, 2) === (r.destinationCode ?? to).slice(0, 2),
            }),
            {
              supplierPrice: r.supplierPrice ?? 0,
              airlineCode: r.airlineCode ?? undefined,
              origin: r.originCode ?? from,
              destination: r.destinationCode ?? to,
              cabin: cabinClass,
            },
          );
          return {
            id: r.id,
            airline: r.airline ?? "Airline",
            code: r.flightNumber ?? r.airlineCode ?? "—",
            from: r.originCode ?? from,
            to: r.destinationCode ?? to,
            depart: hhmm(r.departureDateTime),
            arrive: hhmm(r.arrivalDateTime),
            duration: durationLabel(r.durationMinutes),
            stops: stopsLabel(r.stops),
            cabin: body.cabin ?? "Economy",
            // Customer-facing price only. Supplier cost stays server-side.
            price: Math.round(priced.customer_price / totalPax),
            currency: r.currency ?? "USD",
            fareType: "Live fare",
            live: true,
            priced: true,
            providerReference: r.providerReference,
          };
        })
        .sort((a, b) => a.price - b.price)
        .slice(0, 40);

      return json({ flights, source: "live_fares" });
    }
    warnings.push("No live fares for this route and date.");
  } catch (e) {
    warnings.push((e as Error).message);
  }

  // 2) Aviation data fallback — schedules only, never a fabricated price.
  try {
    const schedules = await getDataProvider().searchFlights(query);
    const flights = schedules.slice(0, 30).map((r) => ({
      id: r.id,
      airline: r.airline ?? "Scheduled carrier",
      code: r.flightNumber ?? "—",
      from: r.originCode ?? from,
      to: r.destinationCode ?? to,
      depart: hhmm(r.departureDateTime),
      arrive: hhmm(r.arrivalDateTime),
      duration: durationLabel(r.durationMinutes),
      stops: stopsLabel(r.stops),
      cabin: body.cabin ?? "Economy",
      price: null,
      currency: null,
      fareType: "Flight information",
      live: true,
      priced: false,
      status: r.status,
    }));
    return json({
      flights,
      source: "flight_information",
      warning: warnings[0] ?? "Live fares unavailable — showing schedule information.",
    });
  } catch (e) {
    return json({ flights: [], warning: warnings[0] ?? (e as Error).message, source: "none" });
  }
});
