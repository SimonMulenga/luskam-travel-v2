import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { generateHotels } from "@/data/hotels";
import { BedDouble, Info, MapPin } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createBooking } from "@/lib/bookings";

const HotelsPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const dest = params.get("dest") || "Lusaka, Zambia";
  const checkIn = params.get("in") || format(new Date(), "yyyy-MM-dd");
  const checkOut = params.get("out") || format(new Date(), "yyyy-MM-dd");
  const adults = parseInt(params.get("adults") || "2");
  const rooms = parseInt(params.get("rooms") || "1");

  const nights = Math.max(1, differenceInDays(parseISO(checkOut), parseISO(checkIn)));
  const hotels = useMemo(() => generateHotels(dest), [dest]);

  const book = async (id: string, name: string, city: string) => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      toast.info("Please sign in to send a stay request");
      navigate(`/auth?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    try {
      const booking = await createBooking({
        type: "hotel",
        travel_date: checkIn,
        details: { hotelId: id, name, city, nights, rooms, adults, checkIn, checkOut },
      });
      toast.success(`Stay request saved · ${booking.reference}`);
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
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.17em] text-accent">Stay inquiry</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">Accommodation ideas in {dest}</h1><p className="mt-2 text-sm text-muted-foreground">{format(parseISO(checkIn), "dd MMM")} – {format(parseISO(checkOut), "dd MMM yyyy")} · {nights} {nights === 1 ? "night" : "nights"}</p></div><div className="flex flex-wrap gap-2 text-xs font-medium text-primary"><span className="rounded-full bg-white px-3 py-2 ring-1 ring-border">{adults} guests</span><span className="rounded-full bg-white px-3 py-2 ring-1 ring-border">{rooms} {rooms === 1 ? "room" : "rooms"}</span></div></div>
        <div role="note" className="mt-5 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950"><Info className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Illustrative examples, not live inventory.</strong> These locally generated stays and prices are guides only. Availability, property details and final pricing must be confirmed with the travel team. Sending a request does not reserve a room.</p></div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {hotels.map((h) => (
            <article key={h.id} className="group overflow-hidden rounded-3xl border border-border/70 bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-xl">
              <img src={h.image} alt={`Illustrative accommodation for ${h.city}`} className="aspect-[16/9] w-full object-cover transition duration-500 group-hover:scale-[1.02]" loading="lazy" decoding="async" />
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Example stay · verify property</span><span className="text-xs font-semibold text-primary">{h.area}</span></div>
                <h2 className="mt-3 text-lg font-semibold text-primary">{h.name}</h2>
                <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> {h.area}, {h.city}
                </div>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {h.amenities.map((amenity) => <li key={amenity} className="rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">{amenity}</li>)}
                </ul>
                <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-border/70 pt-4">
                  <div><p className="text-xs text-muted-foreground">Example price · {nights} {nights === 1 ? "night" : "nights"} · {rooms} {rooms === 1 ? "room" : "rooms"}</p><p className="mt-1 text-xl font-semibold text-primary">${h.pricePerNight * nights * rooms}<span className="ml-1 text-xs font-normal text-muted-foreground">estimated total</span></p><p className="mt-1 text-xs text-muted-foreground">${h.pricePerNight} example price per night</p></div>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><BedDouble className="h-3.5 w-3.5" /> Availability on request</span>
                </div>
                <button
                  onClick={() => book(h.id, h.name, h.city)}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-white transition hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Ask about this stay
                </button>
              </div>
            </article>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default HotelsPage;
