// Retrieve + revalidate a single Duffel offer and re-price it server-side.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { DuffelError, duffelFetch, normalizeCabin, shapeOffer, type DuffelOffer } from "../_shared/duffel.ts";
import { loadRules, priceOffer } from "../_shared/pricing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { offerId, previousPrice } = (await req.json()) as { offerId?: string; previousPrice?: number };
    if (!offerId || typeof offerId !== "string" || offerId.length > 120) {
      return json({ error: "offerId is required" }, 400);
    }

    let offer: DuffelOffer;
    try {
      offer = await duffelFetch<DuffelOffer>(`/air/offers/${encodeURIComponent(offerId)}?return_available_services=false`);
    } catch (e) {
      const err = e as DuffelError;
      if (err.status === 404 || err.status === 422) {
        return json({ available: false, expired: true, error: "This fare is no longer available. Please search again." }, 200);
      }
      throw err;
    }

    const shaped = shapeOffer(offer);
    const originCountry = offer.slices?.[0]?.origin?.iata_country_code;
    const destCountry = offer.slices?.[0]?.destination?.iata_country_code;
    const cabin = normalizeCabin(offer.slices?.[0]?.segments?.[0]?.passengers?.[0]?.cabin_class);

    const priced = priceOffer(await loadRules(), {
      supplierPrice: shaped.supplierTotal,
      airlineCode: shaped.airlineCode,
      origin: shaped.from,
      destination: shaped.to,
      cabin,
      isDomestic: !!originCountry && originCountry === destCountry,
    });

    const expired = offer.expires_at ? new Date(offer.expires_at).getTime() < Date.now() : false;
    const paxCount = (offer.passengers ?? []).length || 1;
    const { supplierTotal: _hidden, ...pub } = shaped;

    const prev = Number(previousPrice ?? 0);
    return json({
      available: !expired,
      expired,
      priceChanged: prev > 0 && Math.abs(prev - priced.customer_price) >= 0.01,
      previousPrice: prev > 0 ? prev : null,
      offer: {
        ...pub,
        passengerCount: paxCount,
        price: priced.customer_price,
        pricePerPax: Math.round((priced.customer_price / paxCount) * 100) / 100,
        // passengers needed by the order step (ids only, no pricing data)
        passengers: (offer.passengers ?? []).map((p: { id: string; type?: string; age?: number }) => ({
          id: p.id,
          type: p.type ?? (p.age !== undefined && p.age < 2 ? "infant_without_seat" : p.age !== undefined ? "child" : "adult"),
          age: p.age ?? null,
        })),
      },
    });
  } catch (e) {
    const err = e as DuffelError;
    return json({ error: err.message ?? "Could not retrieve the offer" }, err.status ?? 500);
  }
});
