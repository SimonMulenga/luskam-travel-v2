import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, Globe2 } from "lucide-react";
import heroImg from "@/assets/hero-plane.jpg";
import { SearchModule } from "./SearchModule";
import { useSiteContent } from "@/hooks/useSiteContent";

export const Hero = () => {
  const { get } = useSiteContent();

  return (
    <section className="relative isolate pb-16 sm:pb-20">
      <div className="absolute inset-x-0 top-0 -z-10 h-[610px] overflow-hidden bg-primary sm:h-[650px] lg:h-[690px]">
        <img
          src={get("hero_image", heroImg)}
          alt="Passenger aircraft flying above the clouds"
          width={1920}
          height={1280}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover object-center animate-fade-in"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#071a34]/85 via-[#0b2444]/54 to-[#0b2444]/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#071a34]/70 via-transparent to-[#071a34]/10" />
      </div>

      <div className="container relative pt-16 sm:pt-20 lg:pt-24">
        <div className="max-w-3xl animate-rise-in">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-2 text-xs font-semibold tracking-wide text-white backdrop-blur-sm sm:text-sm">
            <Globe2 className="h-4 w-4 text-sky-200" />
            <span>From Lusaka to the world</span>
          </div>
          <h1 className="max-w-3xl font-display text-[2.7rem] leading-[1.06] tracking-tight text-white sm:text-6xl lg:text-[4.5rem]">
            {get("hero_title", "The world is closer than you think.")}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/85 sm:text-lg sm:leading-8">
            {get("hero_subtitle", "Flights, stays and travel support, thoughtfully brought together by Luskam Travel Agents.")}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href="#search" className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 text-sm font-semibold text-accent-foreground shadow-lg shadow-slate-950/15 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[hsl(var(--accent-hover))] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary">
              Explore flights <ArrowDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
            </a>
            <Link to="/visa" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/40 bg-white/5 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              Visa support <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div id="search" className="mt-12 scroll-mt-28 sm:mt-14 lg:mt-16">
          <SearchModule />
        </div>
      </div>
    </section>
  );
};
