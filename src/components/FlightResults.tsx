import { Plane } from "lucide-react";

const results = [
  {
    airline: "Emirates",
    code: "EK 714",
    from: "LUN",
    to: "DXB",
    depart: "14:25",
    arrive: "00:55",
    duration: "8h 30m",
    stops: "Direct",
    cabin: "Economy",
    price: 842,
  },
  {
    airline: "Qatar Airways",
    code: "QR 1376",
    from: "LUN",
    to: "DXB",
    depart: "21:10",
    arrive: "11:40",
    duration: "10h 30m",
    stops: "1 stop · DOH",
    cabin: "Economy",
    price: 765,
  },
  {
    airline: "Ethiopian Airlines",
    code: "ET 808",
    from: "LUN",
    to: "DXB",
    depart: "06:45",
    arrive: "20:30",
    duration: "11h 45m",
    stops: "1 stop · ADD",
    cabin: "Economy",
    price: 698,
  },
  {
    airline: "Kenya Airways",
    code: "KQ 765",
    from: "LUN",
    to: "DXB",
    depart: "12:15",
    arrive: "23:55",
    duration: "9h 40m",
    stops: "1 stop · NBO",
    cabin: "Economy",
    price: 712,
  },
];

export const FlightResults = () => {
  return (
    <section id="flights" className="bg-background py-16">
      <div className="container">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Available flights</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Lusaka (LUN) → Dubai (DXB) · 20 May 2026 · 1 Adult</p>
          </div>
          <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <span>Sort by</span>
            <select className="rounded-md border border-border bg-background px-2.5 py-1.5 font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40">
              <option>Price (lowest)</option>
              <option>Duration</option>
              <option>Departure</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-border overflow-hidden rounded-lg bg-card ring-1 ring-border">
          {results.map((r) => (
            <article key={r.code} className="grid grid-cols-12 items-center gap-4 px-5 py-5 transition-colors hover:bg-surface">
              <div className="col-span-12 flex items-center gap-3 sm:col-span-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Plane className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">{r.airline}</div>
                  <div className="text-xs text-muted-foreground">{r.code} · {r.cabin}</div>
                </div>
              </div>

              <div className="col-span-7 flex items-center gap-4 sm:col-span-5">
                <div className="text-left">
                  <div className="text-base font-semibold text-foreground">{r.depart}</div>
                  <div className="text-xs text-muted-foreground">{r.from}</div>
                </div>
                <div className="flex flex-1 flex-col items-center">
                  <div className="text-[11px] text-muted-foreground">{r.duration}</div>
                  <div className="my-1 h-px w-full bg-border" />
                  <div className="text-[11px] text-muted-foreground">{r.stops}</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-semibold text-foreground">{r.arrive}</div>
                  <div className="text-xs text-muted-foreground">{r.to}</div>
                </div>
              </div>

              <div className="col-span-3 text-right sm:col-span-2">
                <div className="text-lg font-semibold text-foreground">${r.price}</div>
                <div className="text-xs text-muted-foreground">per traveler</div>
              </div>

              <div className="col-span-2 flex justify-end">
                <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))]">
                  Select
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
