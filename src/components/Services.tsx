import { Link } from "react-router-dom";
import { ArrowUpRight, Plane, Hotel, Car, FileCheck, Briefcase, LifeBuoy } from "lucide-react";

const services = [
  { icon: Plane, title: "Flight Bookings", desc: "Worldwide ticketing across major airlines and routes.", to: "/flights" },
  { icon: Hotel, title: "Hotel & Holiday Packages", desc: "Curated stays and full holiday packages.", to: "/hotels" },
  { icon: Car, title: "Car Rentals", desc: "Reliable pick-up at airports and major cities.", to: "/cars" },
  { icon: FileCheck, title: "Visa Applications", desc: "Guided processing for tourist and business visas.", to: "/visa" },
  { icon: Briefcase, title: "Corporate Travel", desc: "Managed travel for organisations and teams.", to: "tel:+260773918145" },
  { icon: LifeBuoy, title: "24/7 Support", desc: "Real assistance from booking to return.", to: "https://wa.me/260773918145" },
];

export const Services = () => (
  <section id="services" className="bg-surface py-16 sm:py-20 lg:py-24">
    <div className="container">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-accent">Travel, thoughtfully arranged</p>
          <h2 className="mt-2 font-display text-3xl font-medium text-primary sm:text-4xl">Everything for the journey</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            From the first search to the details that make a trip easier, our Lusaka team is here to help.
          </p>
        </div>
        <a href="tel:+260773918145" className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-primary transition-colors hover:text-accent sm:self-auto">
          Speak with our team <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>
      <div className="mt-9 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        {services.map(({ icon: Icon, title, desc, to }) => {
          const card = (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/5 text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-white">
                <Icon className="h-5 w-5" />
              </span>
              <span className="mt-5 flex items-center justify-between gap-3">
                <span className="text-base font-semibold text-primary">{title}</span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
              </span>
              <span className="mt-2 block text-sm leading-6 text-muted-foreground">{desc}</span>
            </>
          );
          const className = "group block min-h-[190px] rounded-2xl border border-border/70 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-accent/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6";
          return to.startsWith("/") ? (
            <Link key={title} to={to} className={className}>{card}</Link>
          ) : (
            <a key={title} href={to} className={className} target={to.startsWith("https") ? "_blank" : undefined} rel={to.startsWith("https") ? "noreferrer" : undefined}>{card}</a>
          );
        })}
      </div>
    </div>
  </section>
);
