import director from "@/assets/director-annie.jpg";

export const DirectorSpotlight = () => {
  return (
    <section className="border-t border-border/70 bg-surface py-16 sm:py-20 lg:py-24">
      <div className="container grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-5">
          <div className="overflow-hidden rounded-[1.5rem] shadow-lg sm:rounded-[2rem]">
            <img
              src={director}
              alt="Annie Mutashi, Director of Luskam Travel Agents"
              loading="lazy"
              className="aspect-[4/5] w-full object-cover transition-transform duration-700 hover:scale-[1.02]"
            />
          </div>
        </div>
        <div className="lg:col-span-7">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-accent">
            A message from the Director
          </p>
          <h2 className="mt-2 font-display text-3xl font-medium text-primary sm:text-4xl">Annie Mutashi</h2>
          <p className="mt-2 text-sm font-medium text-muted-foreground">Director, Luskam Travel Agents</p>
          <blockquote className="mt-7 border-l-2 border-accent pl-5 font-display text-xl leading-relaxed text-primary sm:text-2xl">
            “At Luskam Travel Agents we don’t just sell tickets. We coordinate every detail of your
            journey, from visas and flights to lodging and ground transport, so you arrive ready
            for what really matters.”
          </blockquote>
          <p className="mt-5 text-base leading-7 text-muted-foreground">
            Annie leads the agency from our Lusaka office, working directly with airlines, hotels
            and embassy partners across Africa, the Middle East and Europe. She also oversees the
            Kakande Ministries travel programme, which arranges monthly group trips for pilgrims.
          </p>
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div className="rounded-2xl border border-border/80 bg-white p-4">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Direct line</dt>
              <dd className="mt-1 font-semibold text-foreground">+260 773 918 145</dd>
            </div>
            <div className="rounded-2xl border border-border/80 bg-white p-4">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Office</dt>
              <dd className="mt-1 font-semibold text-foreground">Lusaka, Zambia</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
};
