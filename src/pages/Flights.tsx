import { FormEvent, useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, Plane, ShieldCheck } from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { airportLabel } from "@/data/flights";
import { getAirport } from "@/data/airports";
import { supabase } from "@/integrations/supabase/client";
import { TurnstileWidget } from "@/components/TurnstileWidget";

const dateLabel = (value: string) => {
  const date = parseISO(value);
  return isValid(date) ? format(date, "EEE, dd MMM yyyy") : "Date unavailable";
};
const airportCity = (code: string) => getAirport(code)?.city ?? airportLabel(code);

export const FlightsPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const from = (params.get("from") || "LUN").toUpperCase();
  const to = (params.get("to") || "JNB").toUpperCase();
  const depart = params.get("depart") || "";
  const ret = params.get("ret") || "";
  const cabin = params.get("cabin") || "Economy";
  const adults = Number(params.get("adults") || 1);
  const children = Number(params.get("children") || 0);
  const infants = Number(params.get("infants") || 0);
  const trip = params.get("trip") || "return";
  const totalPax = adults + children + infants;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const handleTurnstileToken = useCallback((token: string | null) => setTurnstileToken(token), []);

  const search = useMemo(() => ({
    origin: from,
    destination: to,
    departureDate: depart,
    returnDate: ret || null,
    tripType: trip === "oneway" || !ret ? "oneway" : "return",
    passengers: { adults, children, infants },
    cabinClass: cabin.toLowerCase().replaceAll(" ", "_"),
  }), [from, to, depart, ret, trip, adults, children, infants, cabin]);

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    if (!turnstileToken) {
      setError("Complete the verification before sending your request.");
      setSubmitting(false);
      return;
    }
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("request-flight-quote", {
        body: { search, contact: { fullName, email, phone }, specialRequests, idempotencyKey, turnstileToken },
      });
      if (invokeError || !data || typeof data.reference !== "string") throw new Error("request_failed");
      setReference(data.reference);
    } catch {
      setError("We couldn't submit your request just now. Please try again in a moment or contact our travel team.");
      setTurnstileToken(null);
      setTurnstileResetKey((key) => key + 1);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface/60">
      <Header />
      <main className="container max-w-7xl py-6 sm:py-9">
        <div className="mb-6 rounded-2xl border border-border/70 bg-white p-4 shadow-sm sm:p-6">
          <button type="button" onClick={() => navigate("/#search")} className="text-sm font-semibold text-primary transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">← Modify search</button>
          <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-accent">Personal quotation service</p>
              <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-2xl font-medium text-primary sm:text-3xl">
                <span>{airportCity(from)} <span className="font-sans text-lg font-semibold">({from})</span></span>
                <ArrowRight className="h-5 w-5 text-accent" aria-hidden="true" />
                <span>{airportCity(to)} <span className="font-sans text-lg font-semibold">({to})</span></span>
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">{depart ? dateLabel(depart) : "Departure date not selected"}{ret && ` · Return ${dateLabel(ret)}`} · {totalPax} {totalPax === 1 ? "traveler" : "travelers"} · {cabin} · {trip === "return" ? "Round trip" : "One way"}</p>
            </div>
            <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"><ShieldCheck className="h-4 w-4 text-accent" /> Manual quotation</span>
          </div>
        </div>

        {reference ? (
          <section className="mx-auto max-w-3xl rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-sm sm:p-10" role="status" aria-live="polite">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-700" aria-hidden="true" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[.16em] text-emerald-800">Request received</p>
            <h2 className="mt-2 font-display text-2xl font-medium text-primary sm:text-3xl">Your quotation request is with our travel team</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">We’ll check availability and prepare a quotation. This request does not reserve a seat or confirm an airline booking. Please wait for Luskam to verify the quotation and send payment instructions before paying.</p>
            <p className="mt-5 text-sm text-muted-foreground">Your reference</p>
            <p className="mt-1 font-mono text-xl font-bold tracking-wide text-primary" data-testid="quote-reference">{reference}</p>
            <button type="button" onClick={() => navigate("/")} className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white">Return home</button>
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.8fr)] lg:gap-6">
            <section className="min-w-0 rounded-2xl border border-border/70 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="quote-request-heading">
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-accent">No live search or instant fares</p>
              <h2 id="quote-request-heading" className="mt-2 font-display text-2xl font-medium text-primary sm:text-3xl">Request your flight quotation</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Share your travel details and Luskam staff will confirm current availability and prepare a quotation manually.</p>
              {error && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
              <form className="mt-6 space-y-4" onSubmit={(event) => void submitRequest(event)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label htmlFor="quote-full-name" className="text-sm font-semibold text-primary">Full name</label><input id="quote-full-name" required maxLength={120} autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                  <div><label htmlFor="quote-email" className="text-sm font-semibold text-primary">Email</label><input id="quote-email" type="email" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                </div>
                <div><label htmlFor="quote-phone" className="text-sm font-semibold text-primary">Telephone or WhatsApp number</label><input id="quote-phone" type="tel" required maxLength={32} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Include country code" className="mt-1.5 min-h-11 w-full rounded-xl border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <div><label htmlFor="quote-special-requests" className="text-sm font-semibold text-primary">Special requests <span className="font-normal text-muted-foreground">(optional)</span></label><textarea id="quote-special-requests" rows={4} maxLength={1000} value={specialRequests} onChange={(event) => setSpecialRequests(event.target.value)} placeholder="Any flexibility or preferences for your trip?" className="mt-1.5 w-full resize-y rounded-xl border border-border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>
                <p className="text-xs leading-5 text-muted-foreground">Please don’t include passport, payment-card or other highly sensitive information.</p>
                <TurnstileWidget onToken={handleTurnstileToken} resetKey={turnstileResetKey} />
                <button type="submit" disabled={submitting || !turnstileToken} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[hsl(var(--accent-hover))] disabled:cursor-wait disabled:opacity-70 sm:w-auto">
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending request</> : <>Request flight quote <ArrowRight className="h-4 w-4" /></>}
                </button>
              </form>
            </section>
            <aside className="self-start rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sky-950 sm:p-6">
              <div className="flex items-center gap-2"><Plane className="h-5 w-5 text-accent" /><h2 className="font-semibold">Your trip details</h2></div>
              <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-white p-4">
                <div className="min-w-0"><p className="text-xs text-muted-foreground">From</p><p className="mt-1 truncate text-lg font-bold text-primary">{from}</p><p className="truncate text-xs text-muted-foreground">{airportCity(from)}</p></div>
                <ArrowRight className="h-4 w-4 text-accent" aria-hidden="true" />
                <div className="min-w-0 text-right"><p className="text-xs text-muted-foreground">To</p><p className="mt-1 truncate text-lg font-bold text-primary">{to}</p><p className="truncate text-xs text-muted-foreground">{airportCity(to)}</p></div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div><dt className="text-xs text-sky-800">Departure</dt><dd className="mt-1 font-semibold">{depart ? dateLabel(depart) : "Not selected"}</dd></div>
                <div><dt className="text-xs text-sky-800">Return</dt><dd className="mt-1 font-semibold">{ret ? dateLabel(ret) : "One way"}</dd></div>
                <div><dt className="text-xs text-sky-800">Travelers</dt><dd className="mt-1 font-semibold">{adults} adults · {children} children · {infants} infants</dd></div>
                <div><dt className="text-xs text-sky-800">Cabin</dt><dd className="mt-1 font-semibold">{cabin}</dd></div>
              </dl>
              <div className="mt-5 border-t border-sky-200 pt-4 text-sm leading-6"><p className="font-semibold">What happens next</p><p className="mt-1">Our team checks availability and sends you a quotation to review. Submitting a request does not reserve a seat.</p><p className="mt-2">Only pay after receiving verified payment instructions for a quotation approved by Luskam staff. Ticketing is handled manually after supplier and payment verification.</p></div>
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default FlightsPage;
