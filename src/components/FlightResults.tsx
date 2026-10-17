import { ArrowRight, Plane } from "lucide-react";

/** Safe replacement for the former hardcoded sample results component. */
export const FlightResults = () => (
  <section id="flights" className="bg-background py-16">
    <div className="container rounded-3xl border border-border/70 bg-card p-6 shadow-sm sm:p-9">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/5 text-primary"><Plane className="h-5 w-5" aria-hidden="true" /></span>
      <h2 className="mt-4 font-display text-2xl font-medium text-primary sm:text-3xl">Flight quotations on request</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">We do not display live flight schedules, availability or prices here. Send Luskam your travel details and our team will verify availability and prepare a quotation manually.</p>
      <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary">A request does not reserve a seat or confirm an airline booking <ArrowRight className="h-4 w-4 text-accent" aria-hidden="true" /></p>
    </div>
  </section>
);
