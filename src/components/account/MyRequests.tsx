import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Plane, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

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

function safeMoney(value: number, currency: string) {
  if (!Number.isFinite(value) || value < 0) return "Amount unavailable";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toLocaleString()}`; }
}

/** Reads only the narrow, caller-scoped customer RPCs; never queries request tables directly. */
export default function MyRequests({ userId }: { userId: string }) {
  const [flightRequests, setFlightRequests] = useState<FlightRequest[]>([]);
  const [kakandeRequests, setKakandeRequests] = useState<KakandeRequest[]>([]);
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
      const [flight, kakande] = await Promise.all([
        supabase.rpc("my_flight_quote_requests"),
        supabase.rpc("my_kakande_ministry_requests"),
      ]);
      if (currentSequence !== requestSequence.current) return;
      if (flight.error || kakande.error || !flight.data || !kakande.data) {
        setError(true);
      } else {
        setFlightRequests(flight.data as FlightRequest[]);
        setKakandeRequests(kakande.data as KakandeRequest[]);
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

  const total = flightRequests.length + kakandeRequests.length;

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
