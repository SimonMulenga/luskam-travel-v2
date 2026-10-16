import { ArrowRight } from "lucide-react";
import dubai from "@/assets/dest-dubai.jpg";
import coast from "@/assets/dest-coast.jpg";
import vicFalls from "@/assets/dest-victoria-falls.jpg";
import fallsGorge from "@/assets/dest-falls-gorge.jpg";
import desert from "@/assets/dest-desert.jpg";
import mfuwe from "@/assets/dest-mfuwe.jpg";

const items = [
  { img: vicFalls, place: "Victoria Falls", country: "Zambia", note: "Guided walks at Knife Edge Bridge" },
  { img: dubai, place: "Dubai", country: "United Arab Emirates", note: "Museum of the Future & city tours" },
  { img: mfuwe, place: "Mfuwe Lodge", country: "South Luangwa, Zambia", note: "Safari lodge & game drives" },
  { img: desert, place: "Sahara Desert", country: "Morocco", note: "Sunset camel caravan experience" },
  { img: fallsGorge, place: "Batoka Gorge", country: "Zambia / Zimbabwe", note: "Falls base hike & photography" },
  { img: coast, place: "Mediterranean Coast", country: "Europe", note: "Cliff stairways and snorkelling" },
];

export const Destinations = () => {
  return (
    <section id="destinations" className="border-t border-border/70 bg-background py-16 sm:py-20 lg:py-24">
      <div className="container">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-accent">A world of possibility</p>
            <h2 className="mt-2 font-display text-3xl font-medium text-primary sm:text-4xl">Find your somewhere</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Explore places that inspire unforgettable journeys, from the landscapes of Zambia to cities around the world.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {items.map((d, index) => (
            <article key={d.place} className="group overflow-hidden rounded-2xl border border-border/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
              <div className="relative aspect-[4/3] w-full overflow-hidden">
                <img
                  src={d.img}
                  alt={`${d.place}, ${d.country}`}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.045]"
                />
                <span className="absolute left-4 top-4 rounded-full border border-white/35 bg-slate-950/30 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-white backdrop-blur-md">{index < 3 ? "Explore Zambia & beyond" : "Plan your escape"}</span>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-primary">{d.place}</h3>
                    <span className="mt-1 block text-xs text-muted-foreground">{d.country}</span>
                  </div>
                  <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-primary transition-all duration-200 group-hover:bg-primary group-hover:text-white" aria-hidden="true"><ArrowRight className="h-4 w-4" /></span>
                </div>
                <p className="mt-4 border-t border-border/70 pt-3 text-sm text-muted-foreground">{d.note}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
