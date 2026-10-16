import { ArrowUpRight, MapPin, Phone } from "lucide-react";
import team from "@/assets/photo-team.jpg";
import group from "@/assets/photo-group.jpg";
import { useSiteContent } from "@/hooks/useSiteContent";

export const AboutSection = () => {
  const { get } = useSiteContent();
  return (
    <section id="about" className="scroll-mt-20 border-t border-border/70 bg-white py-16 sm:py-20 lg:py-24">
      <div className="container grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="relative mx-auto w-full max-w-xl">
          <div className="grid grid-cols-[1.08fr_.92fr] items-center gap-3 sm:gap-4">
            <img
              src={get("about_image_1", team)}
              alt="Luskam Travel Agents staff at the office"
              loading="lazy"
              decoding="async"
              className="aspect-[4/5] w-full rounded-[1.5rem] object-cover shadow-lg sm:rounded-[2rem]"
            />
            <img
              src={get("about_image_2", group)}
              alt="Group of travellers at sunset"
              loading="lazy"
              decoding="async"
              className="mt-12 aspect-[4/5] w-full rounded-[1.5rem] object-cover shadow-lg sm:mt-16 sm:rounded-[2rem]"
            />
          </div>
          <div className="absolute -bottom-4 left-3 rounded-2xl border border-border/70 bg-white px-4 py-3 shadow-lg sm:bottom-4 sm:left-5 sm:px-5 sm:py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-muted-foreground">Proudly based in</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-primary"><MapPin className="h-4 w-4 text-accent" /> Lusaka, Zambia</p>
          </div>
        </div>
        <div className="flex flex-col justify-center pt-5 sm:pt-8 lg:pt-0">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-accent">Your travel partner</p>
          <h2 className="mt-2 max-w-xl font-display text-3xl font-medium leading-tight text-primary sm:text-4xl lg:text-[2.8rem]">{get("about_title", "Travel feels better with someone in your corner.")}</h2>
          <p className="mt-5 text-base leading-7 text-muted-foreground">{get("about_p1", "Luskam Travel Agents is a Zambian travel company based in Lusaka, helping individuals, families and corporate clients book flights, accommodation, ground transport and visa services across Africa and beyond.")}</p>
          <p className="mt-4 text-base leading-7 text-muted-foreground">{get("about_p2", "Our team works directly with airlines, hotels and embassies to confirm reservations, process documentation and support travellers through every stage of their journey.")}</p>
          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <a href={`tel:${get("about_phone", "+260 773 918 145").replace(/\s/g, "")}`} className="group flex min-h-[72px] items-center gap-3 rounded-2xl border border-border/80 bg-surface/70 px-4 transition-colors hover:border-accent/40 hover:bg-white">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary group-hover:bg-primary group-hover:text-white"><Phone className="h-4 w-4" /></span>
              <span className="min-w-0"><span className="block text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Call our team</span><span className="mt-1 block truncate text-sm font-semibold text-primary">{get("about_phone", "+260 773 918 145")}</span></span>
              <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
            </a>
            <div className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-border/80 bg-surface/70 px-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary"><MapPin className="h-4 w-4" /></span>
              <span className="min-w-0"><span className="block text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Based in</span><span className="mt-1 block truncate text-sm font-semibold text-primary">{get("about_location", "Lusaka, Zambia")}</span></span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
