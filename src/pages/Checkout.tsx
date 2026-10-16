import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleHelp, CreditCard, LockKeyhole, Plane, UserRound } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { airportLabel } from "@/data/flights";
import { readOffer } from "@/lib/flightOffer";
import { supabase } from "@/integrations/supabase/client";
import { quoteFlightRequest, submitFlightRequest } from "@/lib/bookings";

type Passenger = {
  type: string;
  title: string;
  firstName: string;
  lastName: string;
  dob: string;
  passport: string;
  nationality: string;
};
type Contact = { email: string; phone: string };
type Errors = Record<string, string>;

const steps = ["Flight & fare", "Travelers", "Contact", "Review & payment"];
const fieldClass = "min-h-12 w-full rounded-xl border border-border bg-white px-3.5 text-base text-foreground shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";

const Checkout = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const from = params.get("from") || "LUN";
  const to = params.get("to") || "JNB";
  const depart = params.get("depart") || format(new Date(), "yyyy-MM-dd");
  const ret = params.get("ret") || null;
  const cabin = params.get("cabin") || "Economy";
  const adults = Math.max(0, Number.parseInt(params.get("adults") || "1", 10) || 0);
  const children = Math.max(0, Number.parseInt(params.get("children") || "0", 10) || 0);
  const infants = Math.max(0, Number.parseInt(params.get("infants") || "0", 10) || 0);
  const totalPax = adults + children + infants;
  const offerId = params.get("offer") || "";
  const offer = useMemo(() => readOffer(offerId), [offerId]);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [serverQuote, setServerQuote] = useState<{ quoteToken: string; amount: number; currency: string } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [idempotencyKey] = useState(() => {
    const key = `luskam.checkout.idempotency.${offerId}`;
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    sessionStorage.setItem(key, generated);
    return generated;
  });
  const [pax, setPax] = useState<Passenger[]>(() => Array.from({ length: totalPax }, (_, i) => ({
    type: i < adults ? "Adult" : i < adults + children ? "Child" : "Infant",
    title: "Mr", firstName: "", lastName: "", dob: "", passport: "", nationality: "",
  })));
  const [contact, setContact] = useState<Contact>({ email: "", phone: "" });

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && !data.session) {
        toast.info("Please sign in to complete your booking");
        navigate(`/auth?next=${encodeURIComponent(window.location.pathname + window.location.search)}`, { replace: true });
      }
    });
    return () => { active = false; };
  }, [navigate]);

  useEffect(() => {
    if (!offer?.priced) return;
    if (!offer.providerReference) { setQuoteError("This fare cannot be verified. Search again for another option."); return; }
    let active = true;
    setServerQuote(null);
    setQuoteLoading(true);
    setQuoteError(null);
    quoteFlightRequest({
      providerReference: offer.providerReference,
      search: { origin: from, destination: to, departureDate: depart, returnDate: ret, cabin, passengers: { adults, children, infants } },
    }).then((quote) => { if (active) setServerQuote(quote); })
      .catch((error: unknown) => { if (active) setQuoteError(error instanceof Error ? error.message : "The current fare could not be verified."); })
      .finally(() => { if (active) setQuoteLoading(false); });
    return () => { active = false; };
  }, [offer, from, to, depart, ret, cabin, adults, children, infants]);

  if (!offer) {
    return <Shell><main className="container py-16"><div className="mx-auto max-w-xl rounded-3xl border border-border/70 bg-white p-8 text-center shadow-sm"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><CircleHelp /></span><h1 className="mt-4 text-xl font-semibold text-primary">This flight offer is no longer available</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Search again to check current availability and pricing.</p><Link to="/" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white">Search flights</Link></div></main></Shell>;
  }

  const hasFare = offer.priced && serverQuote !== null;
  const total = serverQuote?.amount ?? 0;
  const currency = serverQuote?.currency || "USD";

  const updatePassenger = (index: number, key: "title" | "firstName" | "lastName", value: string) => {
    setPax((current) => current.map((passenger, i) => i === index ? { ...passenger, [key]: value } : passenger));
    setErrors((current) => { const next = { ...current }; delete next[`pax.${index}.${key}`]; return next; });
  };

  const validateStep = (index: number) => {
    const next: Errors = {};
    if (index === 1) pax.forEach((passenger, i) => {
      if (!passenger.firstName.trim()) next[`pax.${i}.firstName`] = "Enter this traveler's first name.";
      if (!passenger.lastName.trim()) next[`pax.${i}.lastName`] = "Enter this traveler's last name.";
    });
    if (index === 2) {
      if (!/^\S+@\S+\.\S+$/.test(contact.email.trim())) next.email = "Enter a valid email address.";
      if (contact.phone.trim().length < 5) next.phone = "Enter a phone number we can reach you on.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (step < 3 && validateStep(step)) {
      setStep((current) => Math.min(current + 1, 3));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const goBack = () => { setErrors({}); setStep((current) => Math.max(current - 1, 0)); };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitErrors: Errors = {};
    pax.forEach((passenger, i) => {
      if (!passenger.firstName.trim()) submitErrors[`pax.${i}.firstName`] = "Enter this traveler's first name.";
      if (!passenger.lastName.trim()) submitErrors[`pax.${i}.lastName`] = "Enter this traveler's last name.";
    });
    if (!/^\S+@\S+\.\S+$/.test(contact.email.trim())) submitErrors.email = "Enter a valid email address.";
    if (contact.phone.trim().length < 5) submitErrors.phone = "Enter a phone number we can reach you on.";
    if (Object.keys(submitErrors).length) {
      setErrors(submitErrors);
      setStep(Object.keys(submitErrors).some((key) => key.startsWith("pax.")) ? 1 : 2);
      return;
    }
    setSubmitting(true);
    try {
      if (offer.priced && !serverQuote) throw new Error(quoteError || "Review the current fare before submitting.");
      const booking = await submitFlightRequest({
        search: { origin: from, destination: to, departureDate: depart, returnDate: ret, cabin, passengers: { adults, children, infants } },
        providerReference: offer.providerReference || "",
        passengers: pax.map((passenger) => ({ type: passenger.type.toLowerCase(), title: passenger.title, firstName: passenger.firstName, lastName: passenger.lastName })),
        contact,
        quoteToken: serverQuote?.quoteToken,
        idempotencyKey,
        scheduleOnly: !offer.priced,
      });
      sessionStorage.removeItem(`luskam.checkout.idempotency.${offerId}`);
      setConfirmed(booking.reference);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit your booking request.");
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmed) return <RequestReceived reference={confirmed} email={contact.email} from={from} to={to} depart={depart} offer={offer} total={total} currency={currency} hasFare={hasFare} totalPax={totalPax} />;

  return (
    <Shell>
      <main className="container max-w-7xl py-8 sm:py-10">
        <button type="button" onClick={() => navigate(-1)} className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="h-4 w-4" /> Back to results</button>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-accent">Secure booking request</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">Review your trip</h1></div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-medium text-muted-foreground ring-1 ring-border/70"><LockKeyhole className="h-3.5 w-3.5 text-emerald-700" /> Your details stay private</div>
        </div>

        <nav aria-label="Checkout progress" className="mt-7 rounded-2xl border border-border/70 bg-white p-4 shadow-sm sm:p-5">
          <ol className="grid grid-cols-4 gap-2">
            {steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className="min-w-0">
              <div className={`mb-2 h-1 rounded-full ${index <= step ? "bg-accent" : "bg-slate-100"}`} />
              <div className="flex items-center gap-1.5 text-[10px] font-semibold sm:gap-2 sm:text-xs"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${index < step ? "bg-primary text-white" : index === step ? "bg-primary text-white" : "bg-slate-100 text-muted-foreground"}`}>{index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}</span><span className={index === step ? "text-primary" : "text-muted-foreground"}>{label}</span></div>
            </li>)}
          </ol>
        </nav>

        <form onSubmit={submit} noValidate className="mt-6 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_350px] lg:gap-6">
          <div className="min-w-0">
            {step === 0 && <section className="rounded-3xl border border-border/70 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="step-heading">
              <StepHeading eyebrow="Step 1 of 4" title="Review your flight and fare" description="Make sure the route, date and fare are right before continuing." />
              <FlightSummary from={from} to={to} depart={depart} cabin={cabin} offer={offer} totalPax={totalPax} total={total} currency={currency} hasFare={hasFare} expanded />
              <p className="mt-5 rounded-2xl bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">Your request will be sent to the Luskam travel desk. A booking request does not mean your ticket is issued or your seat is confirmed.</p>
            </section>}

            {step === 1 && <section className="space-y-4" aria-labelledby="step-heading">
              <StepHeading eyebrow="Step 2 of 4" title="Traveler information" description="Enter each traveler’s name as it appears on their travel document." />
              {pax.map((passenger, index) => <fieldset key={`${passenger.type}-${index}`} className="rounded-3xl border border-border/70 bg-white p-5 shadow-sm sm:p-6"><legend className="sr-only">Traveler {index + 1}, {passenger.type}</legend><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5 text-primary"><UserRound className="h-5 w-5" /></span><div><h2 className="font-semibold text-primary">Traveler {index + 1}</h2><p className="text-xs text-muted-foreground">{passenger.type}</p></div></div>
                <div className="mt-5 grid gap-4 sm:grid-cols-[120px_1fr_1fr]">
                  <Field id={`pax-${index}-title`} label="Title" value={passenger.title} onChange={(value) => updatePassenger(index, "title", value)}><option>Mr</option><option>Mrs</option><option>Ms</option><option>Dr</option></Field>
                  <Field id={`pax-${index}-first`} label="First name" required value={passenger.firstName} error={errors[`pax.${index}.firstName`]} autoComplete="given-name" onChange={(value) => updatePassenger(index, "firstName", value)} />
                  <Field id={`pax-${index}-last`} label="Last name" required value={passenger.lastName} error={errors[`pax.${index}.lastName`]} autoComplete="family-name" onChange={(value) => updatePassenger(index, "lastName", value)} />
                </div>
              </fieldset>)}
            </section>}

            {step === 2 && <section className="rounded-3xl border border-border/70 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="step-heading">
              <StepHeading eyebrow="Step 3 of 4" title="How can we reach you?" description="We’ll use these details to follow up on your request and confirm the fare." />
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Field id="contact-email" label="Email address" type="email" required autoComplete="email" value={contact.email} error={errors.email} onChange={(email) => { setContact((current) => ({ ...current, email })); setErrors((current) => ({ ...current, email: "" })); }} />
                <Field id="contact-phone" label="Phone number" type="tel" required autoComplete="tel" value={contact.phone} error={errors.phone} onChange={(phone) => { setContact((current) => ({ ...current, phone })); setErrors((current) => ({ ...current, phone: "" })); }} />
              </div>
              <p className="mt-5 rounded-2xl bg-surface px-4 py-3 text-sm leading-6 text-muted-foreground">We only collect the contact information needed to respond to this travel request.</p>
            </section>}

            {step === 3 && <section className="rounded-3xl border border-border/70 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="step-heading">
              <StepHeading eyebrow="Step 4 of 4" title="Review and send your request" description="Check your details, then send the request to Luskam for manual quotation review." />
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-border/70 p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-primary">Flight & fare</h2><button type="button" onClick={() => setStep(0)} className="text-sm font-semibold text-accent hover:underline">Edit</button></div><FlightSummary from={from} to={to} depart={depart} cabin={cabin} offer={offer} totalPax={totalPax} total={total} currency={currency} hasFare={hasFare} /></div>
                <div className="rounded-2xl border border-border/70 p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-primary">Travelers</h2><button type="button" onClick={() => setStep(1)} className="text-sm font-semibold text-accent hover:underline">Edit</button></div><ul className="mt-3 space-y-2 text-sm text-foreground">{pax.map((traveler, i) => <li key={i}>{traveler.title} {traveler.firstName} {traveler.lastName} <span className="text-muted-foreground">· {traveler.type}</span></li>)}</ul></div>
                <div className="rounded-2xl border border-border/70 p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-primary">Contact</h2><button type="button" onClick={() => setStep(2)} className="text-sm font-semibold text-accent hover:underline">Edit</button></div><p className="mt-3 text-sm text-foreground">{contact.email}<br />{contact.phone}</p></div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:p-5"><div className="flex items-center gap-2 font-semibold text-sky-950"><CreditCard className="h-4 w-4" /> {hasFare ? "Estimated fare" : "Unpriced inquiry"}</div><p className="mt-2 text-sm leading-6 text-sky-950">{hasFare ? "This fare is subject to supplier availability and Luskam confirmation. It is not an invoice, reservation, or payment request. Do not pay until Luskam verifies the quotation and sends you payment instructions." : "No fare is attached. Luskam will review your inquiry and contact you if a quotation is available. No payment is due for this inquiry."}</p></div>
              </div>
            </section>}

            <div className="mt-4 flex items-center justify-between gap-3"><button type="button" onClick={goBack} disabled={step === 0} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-border bg-white px-5 text-sm font-semibold text-primary transition hover:bg-surface disabled:invisible"><ArrowLeft className="h-4 w-4" /> Back</button>{step < 3 ? <button type="button" onClick={goNext} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[hsl(var(--primary-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Continue <ArrowRight className="h-4 w-4" /></button> : <button type="submit" disabled={submitting || (offer.priced && (!serverQuote || quoteLoading))} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[hsl(var(--accent-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">{submitting ? "Submitting request…" : "Submit booking request"} <ArrowRight className="h-4 w-4" /></button>}</div>
            {step === 3 && <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">Submitting records your request with a pending status. It does not issue a ticket or confirm a seat.</p>}
          </div>

          <aside className="order-first rounded-3xl border border-border/70 bg-white p-5 shadow-sm lg:order-last lg:sticky lg:top-24" aria-label="Order summary">
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-accent">Order summary</p>
            <div className="mt-3 flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary"><Plane className="h-5 w-5" /></span><div className="min-w-0"><h2 className="truncate font-semibold text-primary">{offer.airline || "Flight details unavailable"}</h2><p className="text-sm text-muted-foreground">{from} <span aria-hidden="true">→</span> {to}</p></div></div>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-surface p-3 text-sm"><div><p className="text-xs text-muted-foreground">Departure</p><p className="mt-1 font-medium text-foreground">{safeDate(depart)}</p></div><div><p className="text-xs text-muted-foreground">Travelers</p><p className="mt-1 font-medium text-foreground">{totalPax}</p></div><div><p className="text-xs text-muted-foreground">Cabin</p><p className="mt-1 font-medium text-foreground">{cabin}</p></div><div><p className="text-xs text-muted-foreground">Flight</p><p className="mt-1 font-medium text-foreground">{offer.code || "—"}</p></div></div>
      <div className="mt-4 border-t border-border pt-4">{hasFare ? <><div className="flex justify-between text-sm text-muted-foreground"><span>Indicative fare · {totalPax} travelers</span><span>{formatMoney(total, currency)}</span></div><div className="mt-3 flex justify-between text-base font-semibold text-primary"><span>Estimated total</span><span>{formatMoney(total, currency)}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">Subject to availability and Luskam confirmation; not an invoice or payment request.</p></> : <><p className="text-sm font-semibold text-primary">{offer.priced ? (quoteLoading ? "Checking current fare…" : "Fare unavailable") : "Price on request"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{offer.priced ? (quoteError || "The fare must be verified before you can submit.") : "No fare was returned. This will be an unpriced inquiry; no payment is due."}</p></>}</div>
            <div className="mt-4 flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-900"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /> {offer.priced ? "Indicative fare only; subject to availability and confirmation. This request does not reserve a seat or issue a ticket." : "Unpriced inquiry; there is no amount due. This request does not reserve a seat or issue a ticket."}</div>
          </aside>
        </form>
      </main>
    </Shell>
  );
};

function Field({ id, label, value, onChange, type = "text", required = false, error, autoComplete, children }: { id: string; label: string; value: string; onChange?: (value: string) => void; type?: string; required?: boolean; error?: string; autoComplete?: string; children?: React.ReactNode }) {
  return <div className="min-w-0"><label htmlFor={id} className="text-sm font-semibold text-primary">{label}{required && <span aria-hidden="true" className="text-accent"> *</span>}</label>{children ? <select id={id} value={value} onChange={(event) => onChange?.(event.target.value)} className={`${fieldClass} mt-2`}>{children}</select> : <input id={id} type={type} value={value} onChange={(event) => onChange?.(event.target.value)} autoComplete={autoComplete} aria-required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className={`${fieldClass} mt-2 ${error ? "border-rose-500 focus:border-rose-500 focus:ring-rose-200" : ""}`} />}{error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-rose-700">{error}</p>}</div>;
}

function StepHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header id="step-heading"><p className="text-xs font-semibold uppercase tracking-[.16em] text-accent">{eyebrow}</p><h2 className="mt-2 text-xl font-semibold text-primary sm:text-2xl">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></header>;
}

function FlightSummary({ from, to, depart, cabin, offer, totalPax, total, currency, hasFare, expanded = false }: { from: string; to: string; depart: string; cabin: string; offer: NonNullable<ReturnType<typeof readOffer>>; totalPax: number; total: number; currency: string; hasFare: boolean; expanded?: boolean }) {
  return <div className={`${expanded ? "mt-6" : "mt-4"} rounded-2xl bg-surface p-4 sm:p-5`}><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary ring-1 ring-border/70">{offer.airline || "Airline unavailable"}</span>{offer.code && <span className="text-xs text-muted-foreground">{offer.code}</span>}<span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border/70">{cabin}</span></div><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3"><div><p className="text-2xl font-semibold text-primary">{offer.depart || "—"}</p><p className="text-sm font-semibold text-foreground">{from}</p><p className="text-xs text-muted-foreground">{airportLabel(from)}</p></div><div className="text-center"><p className="text-xs text-muted-foreground">{offer.duration || "Duration unavailable"}</p><div className="my-2 h-px w-12 bg-border sm:w-20"/><p className="text-xs text-muted-foreground">{offer.stops || "Stops unavailable"}</p></div><div className="text-right"><p className="text-2xl font-semibold text-primary">{offer.arrive || "—"}</p><p className="text-sm font-semibold text-foreground">{to}</p><p className="text-xs text-muted-foreground">{airportLabel(to)}</p></div></div><div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-sm"><span className="text-muted-foreground">{safeDate(depart)} · {totalPax} traveler{totalPax === 1 ? "" : "s"}</span><span className="font-semibold text-primary">{hasFare ? formatMoney(total, currency) : "Fare on request"}</span></div>{expanded && offer.fareType && <p className="mt-2 text-xs text-muted-foreground">{offer.fareType}</p>}</div>;
}

function RequestReceived({ reference, email, from, to, depart, offer, total, currency, hasFare, totalPax }: { reference: string; email: string; from: string; to: string; depart: string; offer: NonNullable<ReturnType<typeof readOffer>>; total: number; currency: string; hasFare: boolean; totalPax: number }) {
  const message = `Hello, I submitted booking request ${reference}. Please let me know when the quotation has been reviewed.`;
  return <Shell><main className="container py-12 sm:py-16"><article className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-border/70 bg-white shadow-[0_24px_70px_-34px_rgba(4,24,50,.35)]"><div className="bg-primary px-6 py-8 text-white sm:px-9"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><CheckCircle2 className="h-6 w-6" /></span><p className="mt-5 text-xs font-semibold uppercase tracking-[.17em] text-sky-200">Request received</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Our travel desk will follow up</h1><p className="mt-2 max-w-xl text-sm leading-6 text-white/75">We’ve recorded your request and sent the details to our team. This does not reserve a seat, confirm an airline booking, or issue a ticket. Luskam handles supplier booking and ticketing manually after quotation and payment verification.</p></div><div className="p-6 sm:p-9"><div className="grid gap-4 rounded-2xl bg-surface p-4 sm:grid-cols-2 sm:p-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request reference</p><p className="mt-1 font-mono text-xl font-bold text-primary">{reference}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request status</p><p className="mt-1 font-semibold text-amber-800">Request received · Awaiting review</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Route & date</p><p className="mt-1 text-sm font-medium text-foreground">{from} → {to} · {safeDate(depart)}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Follow-up email</p><p className="mt-1 break-all text-sm font-medium text-foreground">{email}</p></div></div><div className="mt-5"><FlightSummary from={from} to={to} depart={depart} cabin={offer.cabin} offer={offer} totalPax={totalPax} total={total} currency={currency} hasFare={hasFare}/></div><div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-5"><h2 className="font-semibold text-sky-950">{hasFare ? "Estimated fare · subject to confirmation" : "Unpriced inquiry"}</h2><p className="mt-1 text-sm leading-6 text-sky-950">{hasFare ? "This is not a final invoice or payment request. Do not pay until Luskam verifies availability, confirms the quotation, and sends verified payment instructions. Payment alone does not confirm ticket issuance." : "No fare is attached and no payment is due. The travel desk will contact you if a quotation is available."}</p><a href={`https://wa.me/260773918145?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[#25D366] px-4 text-sm font-semibold text-white">Contact the travel desk</a></div><div className="mt-6 flex flex-wrap gap-3"><Link to="/account" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white">View my requests</Link><Link to="/" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold text-primary">Back to home</Link></div></div></article></main></Shell>;
}

function Shell({ children }: { children: React.ReactNode }) { return <div className="min-h-screen bg-surface"><Header />{children}<Footer /></div>; }
function safeDate(value: string) { try { return format(parseISO(value), "EEE, dd MMM yyyy"); } catch { return value; } }
function formatMoney(amount: number, currency: string) { try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); } catch { return `${currency} ${amount.toLocaleString()}`; } }

export default Checkout;
