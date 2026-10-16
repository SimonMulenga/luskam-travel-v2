import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { DuffelError, duffelFetch, normalizeCabin, shapeOffer, type DuffelOffer } from "../_shared/duffel.ts";
import { loadRules, priceOffer } from "../_shared/pricing.ts";

interface SearchBody {
  from?: string;
  to?: string;
  depart?: string;
  ret?: string;
  cabin?: string;
  adults?: number;
  children?: number;
  infants?: number;
  maxResults?: number;
}

const iata = (v?: string) => (v ?? "").toUpperCase().trim().slice(0, 3);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const b = (await req.json()) as SearchBody;
    const from = iata(b.from);
    const to = iata(b.to);
    const depart = (b.depart ?? "").slice(0, 10);
    if (from.length !== 3 || to.length !== 3 || !/^\d{4}-\d{2}-\d{2}$/.test(depart)) {
      return json({ error: "origin, destination and departure date are required", offers: [] }, 400);
    }
    const adults = Math.min(9, Math.max(1, Number(b.adults ?? 1)));
    const children = Math.min(8, Math.max(0, Number(b.children ?? 0)));
    const infants = Math.min(adults, Math.max(0, Number(b.infants ?? 0)));
    const cabin = normalizeCabin(b.cabin);

    const passengers: Record<string, unknown>[] = [
      ...Array.from({ length: adults }, () => ({ type: "adult" })),
      ...Array.from({ length: children }, () => ({ age: 10 })),
      ...Array.from({ length: infants }, () => ({ age: 1 })),
    ];

    const slices: Record<string, string>[] = [{ origin: from, destination: to, departure_date: depart }];
    const ret = (b.ret ?? "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ret)) slices.push({ origin: to, destination: from, departure_date: ret });

    const result = await duffelFetch<{ offers?: DuffelOffer[] }>("/air/offer_requests?return_offers=true&supplier_timeout=20000", {
      method: "POST",
      body: { slices, passengers, cabin_class: cabin },
    });

    const rules = await loadRules();
    const limit = Math.min(50, Math.max(1, Number(b.maxResults ?? 30)));

    const rawOffers = (result.offers ?? []).slice(0, limit);
    const paxCount = adults + children + infants;

    const offers = rawOffers.map((o) => {
      const shaped = shapeOffer(o);
      const originCountry = o.slices?.[0]?.origin?.iata_country_code;
      const destCountry = o.slices?.[0]?.destination?.iata_country_code;
      const priced = priceOffer(rules, {
        supplierPrice: shaped.supplierTotal,
        airlineCode: shaped.airlineCode,
        origin: shaped.from,
        destination: shaped.to,
        cabin,
        isDomestic: !!originCountry && originCountry === destCountry,
      });
      const { supplierTotal: _hidden, ...pub } = shaped;
      return {
        ...pub,
        passengerCount: paxCount,
        price: priced.customer_price,
        pricePerPax: Math.round((priced.customer_price / Math.max(1, paxCount)) * 100) / 100,
      };
    }).sort((a, b2) => a.price - b2.price);

    return json({ offers, count: offers.length });
  } catch (e) {
    const err = e as DuffelError;
    return json({ error: err.message ?? "Flight search failed", offers: [] }, err.status ?? 500);
  }
});
