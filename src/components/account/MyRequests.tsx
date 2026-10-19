import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Check, Clock3, Plane, RefreshCw, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isFlightQuotationCurrentlyValid } from "@/lib/flightQuotationLifecycle";

type FlightRequest = {
  reference: string;
  created_at: string;
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string | null;
  trip_type: string;
  adults: number;
  children: number;
  infants: number;
  cabin_class: string;
  status: string;
};

type KakandeRequest = {
  reference: string;
  created_at: string;
  trip_month: string;
  travel_mode: string;
  travel_date: string;
  price_per_traveller_zmw: number;
  traveller_count: number;
  total_quoted_amount_zmw: number;
  currency_code: string;
  status: string;
};

type QuotationItem = { description: string; quantity: number; unitAmountZmw: number; lineTotalZmw: number };
type CustomerQuotation = { quotation_id: string; request_reference: string; revision: number; status: string; currency_code: string; subtotal_zmw: number; total_zmw: number; issued_at: string | null; valid_until: string | null; origin: string; destination: string; departure_date: string; return_date: string | null; trip_type: string; adults: number; children: number; infants: number; cabin_class: string; items: QuotationItem[] | unknown };
type CustomerBooking = { booking_id: string; quotation_id: string; request_reference: string; status: string; created_at: string; updated_at: string; origin: string; destination: string; departure_date: string; return_date: string | null; trip_type: string; adults: number; children: number; infants: number; cabin_class: string };

const flightStatus: Record<string, string> = {
  pending: "Pending review",
  reviewing: "Under review",
  quoted: "Quotation prepared",
  confirmed: "Accepted by you — ticket not issued",
  closed: "Closed",
};

const kakandeStatus: Record<string, string> = {
  pending: "Pending review",
  in_progress: "Under review",
  approved: "Approved by Luskam",
  rejected: "Not approved by Luskam",
};

function safeDate(value: string) {
  try { return format(parseISO(value), "dd MMM yyyy"); } catch { return value; }
}

function safeDateTime(value: string) {
  try { return format(parseISO(value), "dd MMM yyyy, HH:mm"); } catch { return value; }
}

function safeMoney(value: number, currency: string) {
  if (!Number.isFinite(value) || value < 0) return "Amount unavailable";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toLocaleString()}`; }
}

/** Reads only the narrow, caller-scoped customer RPCs; never queries request tables directly. */
export default function MyRequests({ userId }: { userId: string }) {
  const [flightRequests, setFlightRequests] = useState<FlightRequest[]>([]);
  const [kakandeRequests, setKakandeRequests] = useState<KakandeRequest[]>([]);
  const [quotations, setQuotations] = useState<CustomerQuotation[]>([]);
  const [quoteBookings, setQuoteBookings] = useState<CustomerBooking[]>([]);
  const [responding, setResponding] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(async (refresh = false) => {
    if (!userId) return;
    setError(false);
    if (refresh) setRefreshing(true);
    else setLoading(true);
    const currentSequence = ++requestSequence.current;
    try {
      const [flight, kakande, quotationResult, bookingResult] = await Promise.all([
        supabase.rpc("my_flight_quote_requests"),
        supabase.rpc("my_kakande_ministry_requests"),
        supabase.rpc("my_flight_quotations"),
        supabase.rpc("my_flight_quote_bookings"),
      ]);
      if (currentSequence !== requestSequence.current) return;
      if (flight.error || kakande.error || quotationResult.error || bookingResult.error || !flight.data || !kakande.data || !quotationResult.data || !bookingResult.data) {
        setError(true);
      } else {
        setFlightRequests(flight.data as FlightRequest[]);
        setKakandeRequests(kakande.data as KakandeRequest[]);
        setQuotations(quotationResult.data as CustomerQuotation[]);
        setQuoteBookings(bookingResult.data as CustomerBooking[]);
      }
    } catch {
      if (currentSequence === requestSequence.current) setError(true);
    } finally {
      if (currentSequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const respond = async (quotation: CustomerQuotation, accept: boolean) => {
    setResponding(quotation.quotation_id);
    try {
      const { data, error } = await supabase.rpc("respond_to_flight_quotation", { p_quotation_id: quotation.quotation_id, p_accept: accept });
      if (error) { toast.error(error.message); return; }
      const result = data as { outcome?: string };
      if (result.outcome === "accepted") toast.success("Quotation accepted. A booking request has been created; no airline ticket has been issued.");
      else if (result.outcome === "declined") toast.success("Quotation declined.");
      else if (result.outcome === "duplicate") toast.success(accept ? "This quotation was already accepted. Your booking request remains in your requests." : "This quotation was already declined.");
      else if (result.outcome === "expired") toast.error("This quotation has expired and cannot be accepted.");
      else toast.error("The quotation response could not be confirmed. Refresh your requests and check the status.");
      await load(true);
    } catch {
      toast.error("The quotation response could not be confirmed. Refresh your requests and check the status.");
    } finally {
      setResponding(null);
    }
  };

  const total = flightRequests.length + kakandeRequests.length + quotations.length + quoteBookings.length;

  return <section className="mt-6 rounded-3xl border border-border/70 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="my-requests-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.15em] text-accent">Request tracking</p>
        <h2 id="my-requests-heading" className="mt-1 text-xl font-semibold text-primary">My requests</h2>
      </div>
      <button type="button" onClick={() => void load(true)} disabled={loading || refreshing} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-primary transition hover:bg-surface disabled:opacity-60">
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>

    {loading || (refreshing && total === 0) ? <div role="status" className="mt-5 rounded-2xl bg-surface p-5 text-sm text-muted-foreground">Loading your requests…</div>
      : error ? <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5" role="alert">
        <p className="text-sm text-rose-800">We couldn’t load your requests. Please try again.</p>
        <button type="button" onClick={() => void load(true)} className="mt-3 min-h-9 rounded-full border border-rose-300 px-4 text-sm font-semibold text-rose-800">Try again</button>
      </div>
      : total === 0 ? <div className="mt-5 rounded-2xl bg-surface px-5 py-8 text-center">
        <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <h3 className="mt-2 font-semibold text-primary">No requests linked to this account</h3>
        <p className="mt-1 text-sm text-muted-foreground">Requests submitted before signing in are not linked automatically.</p>
      </div>
      : <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <RequestGroup title="Issued flight quotations" icon={<Plane className="h-4 w-4" />}>
          {quotations.length === 0 ? <p className="rounded-xl bg-surface p-4 text-sm text-muted-foreground">No issued flight quotations.</p> : quotations.map((quote) => {
            const items = Array.isArray(quote.items) ? quote.items as QuotationItem[] : [];
            const currentlyValid = isFlightQuotationCurrentlyValid(quote.status, quote.valid_until);
            return <article key={quote.quotation_id} className="rounded-2xl border border-border/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-accent">Revision {quote.revision}</p><h4 className="mt-1 break-all font-mono text-sm font-bold text-primary">{quote.request_reference}</h4></div><Status status={currentlyValid ? "issued_valid" : quote.status === "issued" ? "expired_local" : quote.status} labels={{ issued_valid: "Issued · valid", expired_local: "Expired", accepted: "Accepted", declined: "Declined", expired: "Expired", superseded: "Revised" }} /></div>
              <p className="mt-3 text-sm font-medium text-foreground">{quote.origin} → {quote.destination}</p><p className="mt-1 text-xs text-muted-foreground">Depart {safeDate(quote.departure_date)}{quote.return_date ? ` · Return ${safeDate(quote.return_date)}` : " · one way"} · {quote.adults + quote.children + quote.infants} traveller(s) · {quote.cabin_class.replaceAll("_", " ")}</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5"/>Issued {quote.issued_at ? safeDateTime(quote.issued_at) : "date unavailable"} · Expires {quote.valid_until ? safeDateTime(quote.valid_until) : "date unavailable"}</p>
              <div className="mt-3 divide-y divide-border/70 rounded-xl bg-surface px-3">{items.map((item, index) => <div key={`${quote.quotation_id}-${index}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span className="min-w-0 flex-1 break-words">{item.description} <span className="text-xs text-muted-foreground">× {item.quantity}</span></span><span className="font-medium">{safeMoney(item.lineTotalZmw, quote.currency_code)}</span></div>)}<div className="flex justify-between gap-2 py-3 font-semibold text-primary"><span>Total</span><span>{safeMoney(quote.total_zmw, quote.currency_code)}</span></div></div>
              {currentlyValid && <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={responding === quote.quotation_id} onClick={() => void respond(quote, true)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"><Check className="h-4 w-4"/>Accept quotation</button><button type="button" disabled={responding === quote.quotation_id} onClick={() => void respond(quote, false)} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-primary disabled:opacity-50"><X className="h-4 w-4"/>Decline</button></div>}
              {quote.status === "accepted" && <p className="mt-3 text-xs text-muted-foreground">Accepted quotation creates a booking request. It is not a confirmed airline reservation or issued ticket.</p>}
            </article>;
          })}
        </RequestGroup>
        <RequestGroup title="Flight booking requests" icon={<Check className="h-4 w-4" />}>
          {quoteBookings.length === 0 ? <p className="rounded-xl bg-surface p-4 text-sm text-muted-foreground">No flight booking requests from accepted quotations.</p> : quoteBookings.map((booking) => <article key={booking.booking_id} className="rounded-2xl border border-border/70 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-accent">Booking request</p><h4 className="mt-1 break-all font-mono text-sm font-bold text-primary">{booking.request_reference}</h4></div><Status status={booking.status} labels={{ booking_requested: "Received", processing: "Being processed", awaiting_supplier_confirmation: "Awaiting supplier", confirmed_ticket_issued: "Ticket issued", completed: "Completed", cancelled: "Cancelled", unable_to_fulfil: "Unable to fulfil" }}/></div><p className="mt-3 text-sm font-medium">{booking.origin} → {booking.destination}</p><p className="mt-1 text-xs text-muted-foreground">Created {safeDate(booking.created_at)} · Updated {safeDate(booking.updated_at)}</p><p className="mt-2 text-xs text-muted-foreground">A booking request does not reserve a seat or issue a ticket. Luskam will update this status after manual supplier follow-up.</p></article>)}
        </RequestGroup>
        <RequestGroup title="Flight quotations" icon={<Plane className="h-4 w-4" />}>
          {flightRequests.length === 0 ? <p className="rounded-xl bg-surface p-4 text-sm text-muted-foreground">No flight quotation requests.</p> : flightRequests.map((request) => <article key={request.reference} className="rounded-2xl border border-border/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-accent">Flight quotation</p><h4 className="mt-1 break-all font-mono text-sm font-bold text-primary">{request.reference}</h4></div><Status status={request.status} labels={flightStatus} /></div>
            <p className="mt-3 text-sm font-medium text-foreground">{request.origin} → {request.destination}</p>
            <p className="mt-1 text-xs text-muted-foreground">{request.trip_type === "return" && request.return_date ? `Depart ${safeDate(request.departure_date)} · Return ${safeDate(request.return_date)}` : `Depart ${safeDate(request.departure_date)}`} · {request.adults + request.children + request.infants} traveller(s) · {request.cabin_class.replaceAll("_", " ")}</p>
            <p className="mt-2 text-xs text-muted-foreground">Submitted {safeDate(request.created_at)}</p>
            {request.status === "confirmed" && <p className="mt-2 text-xs text-muted-foreground">Accepted status does not mean an airline reservation or ticket has been issued.</p>}
          </article>)}
        </RequestGroup>
        <RequestGroup title="Kakande Ministries trips" icon={<CalendarDays className="h-4 w-4" />}>
          {kakandeRequests.length === 0 ? <p className="rounded-xl bg-surface p-4 text-sm text-muted-foreground">No Kakande Ministries requests.</p> : kakandeRequests.map((request) => <article key={request.reference} className="rounded-2xl border border-border/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-accent">Kakande Ministries · {request.travel_mode === "road" ? "By road" : "By flight"}</p><h4 className="mt-1 break-all font-mono text-sm font-bold text-primary">{request.reference}</h4></div><Status status={request.status} labels={kakandeStatus} /></div>
            <p className="mt-3 text-sm font-medium text-foreground">{request.trip_month} · {safeDate(request.travel_date)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{request.traveller_count} traveller(s) · {safeMoney(request.price_per_traveller_zmw, request.currency_code)} each · Total {safeMoney(request.total_quoted_amount_zmw, request.currency_code)}</p>
            <p className="mt-2 text-xs text-muted-foreground">Submitted {safeDate(request.created_at)}</p>
            {request.status === "approved" && <p className="mt-2 text-xs text-muted-foreground">Approved by Luskam; this does not mean approval by Kakande Ministries.</p>}
          </article>)}
        </RequestGroup>
      </div>}
  </section>;
}

function RequestGroup({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="min-w-0"><h3 className="mb-3 flex items-center gap-2 font-semibold text-primary">{icon}{title}</h3><div className="space-y-3">{children}</div></div>;
}

function Status({ status, labels }: { status: string; labels: Record<string, string> }) {
  return <span className="inline-flex min-h-7 items-center rounded-full bg-primary/5 px-3 text-xs font-semibold text-primary">{labels[status] ?? "Status update pending"}</span>;
}
