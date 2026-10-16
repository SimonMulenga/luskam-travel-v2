import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Clock3, Info, Plane, Radio, RotateCcw, SlidersHorizontal, Users } from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { airportLabel } from "@/data/flights";
import { getAirport } from "@/data/airports";
import { supabase } from "@/integrations/supabase/client";
import { storeOffer, type SelectedOffer } from "@/lib/flightOffer";
import { Skeleton } from "@/components/ui/skeleton";

interface ServerOffer extends SelectedOffer {
  live?: boolean;
  baggage?: string | null;
  stopCount?: number;
}

type SortOption = "price" | "duration" | "depart";
type StopFilter = "all" | "direct" | "one" | "twoPlus";

const dateLabel = (value: string) => {
  const date = parseISO(value);
  return isValid(date) ? format(date, "EEE, dd MMM yyyy") : "Date unavailable";
};

const stopCount = (offer: ServerOffer) => {
  if (typeof offer.stopCount === "number") return offer.stopCount;
  if (/\bdirect\b|\bnonstop\b/i.test(offer.stops)) return 0;
  const count = offer.stops.match(/(\d+)\s+stops?/i);
  return count ? Number(count[1]) : null;
};

const durationMinutes = (duration: string) => {
  const match = duration.match(/(?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(\d+)m)?/i);
  if (!match || !match[0].trim()) return Number.POSITIVE_INFINITY;
  return Number(match[1] ?? 0) * 1440 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
};

const formatMoney = (amount: number, currency?: string | null) => {
  if (!currency) return amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
};

const airportCity = (code: string) => getAirport(code)?.city ?? airportLabel(code);
const airlineLabel = (airline: string) => airline && airline !== "Scheduled carrier" ? airline : "Airline information unavailable";

const FlightSkeleton = () => (
  <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-6" aria-hidden="true">
    <div className="flex items-center gap-3">
      <Skeleton className="h-12 w-12 rounded-2xl" />
      <div className="flex-1 space-y-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-24" /></div>
      <Skeleton className="h-8 w-24" />
    </div>
    <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div className="space-y-2"><Skeleton className="h-6 w-16" /><Skeleton className="h-3 w-24" /></div>
      <Skeleton className="h-1 w-24 rounded-full" />
      <div className="space-y-2 justify-self-end"><Skeleton className="h-6 w-16" /><Skeleton className="h-3 w-24" /></div>
    </div>
  </div>
);

const FlightsPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const from = params.get("from") || "LUN";
  const to = params.get("to") || "JNB";
  const depart = params.get("depart") || format(new Date(), "yyyy-MM-dd");
  const ret = params.get("ret") || "";
  const cabin = params.get("cabin") || "Economy";
  const adults = parseInt(params.get("adults") || "1", 10);
  const children = parseInt(params.get("children") || "0", 10);
  const infants = parseInt(params.get("infants") || "0", 10);
  const trip = params.get("trip") || "return";
  const totalPax = adults + children + infants;

  const [offers, setOffers] = useState<ServerOffer[]>([]);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOption>("price");
  const [stopFilter, setStopFilter] = useState<StopFilter>("all");
  const [retryCount, setRetryCount] = useState(0);
  const [selected, setSelected] = useState<ServerOffer | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotice(null);
    setServiceError(null);
    setOffers([]);
    setSelected(null);

    supabase.functions
      .invoke("flight-search", {
        body: { from, to, depart, ret: ret || null, cabin, adults, children, infants },
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setServiceError("We couldn’t connect to flight search. Check your connection and try again.");
          return;
        }
        const result = data as { flights?: ServerOffer[]; warning?: string; source?: string };
        setOffers(result?.flights ?? []);
        setSource(result?.source ?? "");
        if (result?.warning) setNotice(result.warning);
      })
      .catch(() => {
        if (!cancelled) setServiceError("We couldn’t connect to flight search. Check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [from, to, depart, ret, cabin, adults, children, infants, retryCount]);

  const filtered = useMemo(() => offers
    .filter((offer) => {
      const stops = stopCount(offer);
      if (stopFilter === "all") return true;
      if (stopFilter === "direct") return stops === 0;
      if (stopFilter === "one") return stops === 1;
      return stops !== null && stops >= 2;
    })
    .sort((a, b) => {
      if (sort === "price") return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
      if (sort === "depart") return a.depart.localeCompare(b.depart);
      return durationMinutes(a.duration) - durationMinutes(b.duration);
    }), [offers, sort, stopFilter]);

  const pricedCount = filtered.filter((offer) => offer.priced && offer.price != null).length;

  const continueToCheckout = () => {
    if (!selected) return;
    storeOffer(selected);
    const searchParams = new URLSearchParams(params);
    searchParams.set("offer", selected.id);
    navigate(`/checkout?${searchParams.toString()}`);
  };

  const renderOffer = (offer: ServerOffer) => {
    const stops = stopCount(offer);
    const stopLabel = stops === 0 ? "Nonstop" : stops === null ? offer.stops : `${stops} ${stops === 1 ? "stop" : "stops"}`;
    const totalPrice = offer.priced && offer.price != null ? offer.price * totalPax : null;
    const isSelected = selected?.id === offer.id;

    return (
      <article key={offer.id} className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-200 ${isSelected ? "border-accent ring-2 ring-accent/20" : "border-border/80 hover:border-primary/20 hover:shadow-md"}`}>
        <div className="p-4 sm:p-5 lg:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/5 text-primary" aria-hidden="true"><Plane className="h-5 w-5" /></span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-primary sm:text-base">{airlineLabel(offer.airline)}</h2>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{offer.code || "Flight details"} · {offer.fareType || cabin}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {offer.live && offer.priced && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800"><Radio className="h-3 w-3" /> Current indicative fare</span>}
              {isSelected && <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-primary"><Check className="h-3 w-3" /> Selected</span>}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
            <div className="min-w-0">
              <p className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{offer.depart || "—"}</p>
              <p className="mt-1 text-sm font-semibold text-primary">{offer.from}</p>
              <p className="truncate text-xs text-muted-foreground">{airportCity(offer.from)}</p>
            </div>
            <div className="flex min-w-[92px] flex-col items-center px-1 sm:min-w-[130px]">
              <span className="mb-2 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground"><Clock3 className="h-3 w-3" />{offer.duration || "Duration n/a"}</span>
              <span className="relative h-px w-full bg-border"><Plane className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-90 bg-card px-0.5 text-accent" /></span>
              <span className="mt-2 text-[11px] font-semibold text-muted-foreground">{stopLabel}</span>
            </div>
            <div className="min-w-0 text-right">
              <p className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{offer.arrive || "—"}</p>
              <p className="mt-1 text-sm font-semibold text-primary">{offer.to}</p>
              <p className="truncate text-xs text-muted-foreground">{airportCity(offer.to)}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/70 pt-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{totalPax} {totalPax === 1 ? "traveler" : "travelers"} · {cabin}</span>
            {stops !== null && stops > 0 && offer.stops.includes("·") && <span>Via {offer.stops.split("·").slice(1).join("·").trim()}</span>}
            {offer.baggage && <span>{offer.baggage}</span>}
            {offer.status && <span>{offer.status}</span>}
          </div>

          <div className="mt-5 flex flex-col gap-4 border-t border-border/70 pt-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              {totalPrice != null ? (
                <>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Indicative total for {totalPax}</p>
                  <p className="mt-0.5 text-2xl font-semibold tracking-tight text-primary">{formatMoney(totalPrice, offer.currency)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatMoney(offer.price as number, offer.currency)} per traveler</p>
                </>
              ) : (
                <><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Fare</p><p className="mt-1 text-base font-semibold text-primary">Price on request</p></>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelected(offer)}
              aria-pressed={isSelected}
              className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto ${isSelected ? "border border-accent bg-white text-primary hover:bg-accent/5" : "bg-primary text-white hover:bg-[hsl(var(--primary-hover))]"}`}
            >
              {isSelected ? <><Check className="h-4 w-4" /> Selected</> : offer.priced ? "Select flight" : "Request this flight"}
            </button>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-surface/60">
      <Header />
      <main className="container max-w-7xl py-6 sm:py-9">
        <div className="mb-6 rounded-2xl border border-border/70 bg-white p-4 shadow-sm sm:p-6">
          <button type="button" onClick={() => navigate("/#search")} className="text-sm font-semibold text-primary transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">← Modify search</button>
          <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-accent">Compare flights</p>
              <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-2xl font-medium text-primary sm:text-3xl">
                <span>{airportCity(from)} <span className="font-sans text-lg font-semibold">({from})</span></span>
                <ArrowRight className="h-5 w-5 text-accent" aria-hidden="true" />
                <span>{airportCity(to)} <span className="font-sans text-lg font-semibold">({to})</span></span>
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {dateLabel(depart)}{ret && ` · Return ${dateLabel(ret)}`} · {totalPax} {totalPax === 1 ? "traveler" : "travelers"} · {cabin} · {trip === "return" ? "Round trip" : "One way"}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground" aria-live="polite">
                {loading ? <><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" /> Searching available flights</> : source === "live_fares" ? <><Radio className="h-4 w-4 text-emerald-700" /> Current fare indications</> : source === "flight_information" ? <><Info className="h-4 w-4" /> Schedule information</> : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6">
          <aside className="self-start rounded-2xl border border-border/70 bg-white p-4 shadow-sm sm:p-5 lg:sticky lg:top-24" aria-label="Flight filters and sorting">
            <div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-accent" /><h2 className="text-sm font-semibold text-primary">Filter & sort</h2></div>
            <fieldset className="mt-5">
              <legend className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Number of stops</legend>
              <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
                {([["all", "Any stops"], ["direct", "Nonstop"], ["one", "1 stop"], ["twoPlus", "2+ stops"]] as const).map(([value, label]) => (
                  <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3 text-sm transition-colors ${stopFilter === value ? "border-primary/20 bg-primary/5 font-semibold text-primary" : "border-transparent text-foreground hover:bg-surface"}`}>
                    <input type="radio" name="stops" value={value} checked={stopFilter === value} onChange={() => setStopFilter(value)} className="h-4 w-4 accent-primary focus-visible:ring-2 focus-visible:ring-ring" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-5 border-t border-border/70 pt-5">
              <label htmlFor="flight-sort" className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">Sort flights</label>
              <select id="flight-sort" value={sort} onChange={(event) => setSort(event.target.value as SortOption)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40">
                <option value="price">Lowest price</option>
                <option value="duration">Shortest duration</option>
                <option value="depart">Earliest departure</option>
              </select>
            </div>
            {!loading && <p className="mt-4 text-xs text-muted-foreground" aria-live="polite">{filtered.length} {filtered.length === 1 ? "option" : "options"} shown</p>}
          </aside>

          <section className="min-w-0 space-y-3" aria-label="Available flights" aria-busy={loading}>
            {!loading && <div className="flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950"><Info className="mt-0.5 h-4 w-4 shrink-0" /> <p>{notice ? `${notice} ` : "Prices and schedules may change."}Prices are subject to availability and Luskam confirmation. A request does not reserve a seat or confirm an airline booking. Ticketing is handled manually after supplier and payment verification.</p></div>}

            {serviceError && !loading && (
              <div className="rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm sm:p-9" role="alert">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-700"><Info className="h-5 w-5" /></span>
                <h2 className="mt-4 text-lg font-semibold text-primary">Flight search is temporarily unavailable</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{serviceError}</p>
                <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><RotateCcw className="h-4 w-4" /> Try again</button>
              </div>
            )}

            {loading && <div className="space-y-3" role="status" aria-live="polite"><span className="sr-only">Searching for flights</span><FlightSkeleton /><FlightSkeleton /><FlightSkeleton /></div>}

            {!loading && !serviceError && filtered.length === 0 && (
              <div className="rounded-2xl border border-border/70 bg-white px-5 py-10 text-center shadow-sm sm:py-14">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/5 text-primary"><Plane className="h-5 w-5" /></span>
                <h2 className="mt-4 text-lg font-semibold text-primary">{offers.length ? "No flights match these filters" : "No flights available for this search"}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{offers.length ? "Try another stop option or show all flights." : "Try different dates or contact our travel desk to ask about this route."}</p>
                {offers.length ? <button type="button" onClick={() => setStopFilter("all")} className="mt-4 text-sm font-semibold text-primary underline-offset-4 hover:underline">Show all flights</button> : <button type="button" onClick={() => navigate("/#search")} className="mt-4 text-sm font-semibold text-primary underline-offset-4 hover:underline">Change search</button>}
              </div>
            )}

            {!loading && !serviceError && filtered.map(renderOffer)}

            {selected && !loading && !serviceError && (
              <section className="sticky bottom-3 z-20 rounded-2xl border border-primary/15 bg-white/95 p-4 shadow-[0_18px_50px_-20px_rgba(4,24,50,.4)] backdrop-blur-xl sm:bottom-5 sm:p-5" aria-label="Selected flight summary" aria-live="polite">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-accent">Your selection</p>
                    <p className="mt-1 truncate text-sm font-semibold text-primary">{airlineLabel(selected.airline)} · {selected.code || "Flight"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{selected.from} {selected.depart} → {selected.to} {selected.arrive} · {selected.duration} · {selected.stops}</p>
                    {selected.baggage && <p className="mt-1 text-xs text-muted-foreground">{selected.baggage}</p>}
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <div className="text-left sm:text-right">
                      {selected.priced && selected.price != null ? <><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Indicative total · {totalPax} travelers</p><p className="text-xl font-semibold text-primary">{formatMoney(selected.price * totalPax, selected.currency)}</p></> : <><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Fare</p><p className="text-base font-semibold text-primary">Price on request</p></>}
                    </div>
                    <button type="button" onClick={continueToCheckout} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[hsl(var(--accent-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Continue <ArrowRight className="h-4 w-4" /></button>
                  </div>
                </div>
              </section>
            )}

            {!loading && pricedCount > 0 && <p className="px-1 pt-1 text-xs leading-5 text-muted-foreground">Indicative prices are shown in the currency returned for each fare, subject to availability and confirmation. A request does not reserve a seat. Fare on request means no price was returned.</p>}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default FlightsPage;
