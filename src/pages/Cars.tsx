import { useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CARS } from "@/data/cars";
import { Users, Briefcase, Settings, Snowflake } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createBooking } from "@/lib/bookings";

const CarsPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const pickup = params.get("pickup") || "Lusaka";
  const dropoff = params.get("dropoff") || pickup;
  const pdate = params.get("pdate") || format(new Date(), "yyyy-MM-dd");
  const ddate = params.get("ddate") || format(new Date(), "yyyy-MM-dd");
  const ptime = params.get("ptime") || "10:00";
  const dtime = params.get("dtime") || "10:00";

  const days = Math.max(1, differenceInDays(parseISO(ddate), parseISO(pdate)) || 1);

  const book = async (carId: string, brand: string, model: string) => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      toast.info("Please sign in to send a vehicle request");
      navigate(`/auth?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    try {
      const booking = await createBooking({
        type: "car",
        travel_date: pdate,
        details: { carId, brand, model, pickup, dropoff, pdate, ddate, ptime, dtime, days },
      });
      toast.success(`Vehicle request saved · ${booking.reference}`);
      setTimeout(() => navigate("/account"), 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save reservation");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-7xl py-8 sm:py-10">
        <button onClick={() => navigate("/")} className="inline-flex min-h-10 items-center text-sm font-semibold text-muted-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">← Modify search</button>
        <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-[.17em] text-accent">Vehicle inquiry</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">Car hire options</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {pickup} · {format(parseISO(pdate), "dd MMM")} {ptime} → {dropoff} · {format(parseISO(ddate), "dd MMM yyyy")} {dtime} · {days} {days === 1 ? "day" : "days"}
        </p></div>
        <div role="note" className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950"><strong>Availability and supplier assignment are confirmed by the travel team.</strong> Vehicle options and prices shown are the current examples in this directory. Sending a request does not reserve a vehicle.</div>

        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {CARS.map((c) => {
            const total = c.pricePerDay * days;
            return (
              <article key={c.id} className="overflow-hidden rounded-3xl border border-border/70 bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-xl">
                <div className="grid min-w-0 sm:grid-cols-[minmax(0,1fr)_minmax(180px,.8fr)]">
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">{c.category}</span><span className="text-xs text-muted-foreground">Illustrative option</span></div>
                    <h2 className="mt-3 text-lg font-semibold text-primary">{c.brand} {c.model}</h2>
                    <div className="mt-1 text-sm text-muted-foreground">or similar · supplier listed: {c.supplier}</div>
                    <ul className="mt-5 grid grid-cols-2 gap-3 text-sm text-foreground">
                      <li className="flex items-center gap-2"><Users className="h-4 w-4 shrink-0 text-accent" /> {c.seats} seats</li>
                      <li className="flex items-center gap-2"><Briefcase className="h-4 w-4 shrink-0 text-accent" /> {c.bags} bags</li>
                      <li className="flex items-center gap-2"><Settings className="h-4 w-4 shrink-0 text-accent" /> {c.transmission}</li>
                      <li className="flex items-center gap-2"><Snowflake className="h-4 w-4 shrink-0 text-accent" /> {c.airCon ? "Air conditioning" : "No A/C"}</li>
                    </ul>
                  </div>
                  <img src={c.image} alt={`Example vehicle similar to ${c.brand} ${c.model}`} className="aspect-[16/10] h-full min-h-44 w-full object-cover sm:aspect-auto" loading="lazy" decoding="async" />
                </div>
                <div className="flex flex-wrap items-end justify-between gap-4 border-t border-border/70 p-5 sm:p-6">
                  <div>
                    <div className="text-xs text-muted-foreground">Example rate · ${c.pricePerDay} / day</div>
                    <div className="mt-1 text-2xl font-semibold text-primary">${total}<span className="ml-1 text-xs font-normal text-muted-foreground">estimated total</span></div>
                    <div className="mt-1 text-xs text-muted-foreground">{days} {days === 1 ? "day" : "days"} · final availability and pricing on request</div>
                  </div>
                  <button
                    onClick={() => book(c.id, c.brand, c.model)}
                    className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white transition hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    Request this vehicle
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CarsPage;
