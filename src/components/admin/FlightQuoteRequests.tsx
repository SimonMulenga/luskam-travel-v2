import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Mail, MessageCircle, Plane, RefreshCw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type QuoteStatus = "pending" | "reviewing" | "quoted" | "confirmed" | "closed";
type FlightQuoteRequest = {
  id: string;
  reference: string;
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string | null;
  trip_type: string;
  adults: number;
  children: number;
  infants: number;
  cabin_class: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  special_requests: string;
  status: QuoteStatus;
  internal_notes: string;
  created_at: string;
};

const statuses: { value: QuoteStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "reviewing", label: "Reviewing" },
  { value: "quoted", label: "Quotation sent" },
  { value: "confirmed", label: "Customer accepted quote" },
  { value: "closed", label: "Closed" },
];

export const FlightQuoteRequests = () => {
  const [requests, setRequests] = useState<FlightQuoteRequest[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { status: QuoteStatus; notes: string }>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase.from("flight_quote_requests").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) {
      setLoadError(true);
      setRequests([]);
    } else {
      const rows = (data ?? []) as FlightQuoteRequest[];
      setRequests(rows);
      setDrafts(Object.fromEntries(rows.map((row) => [row.id, { status: row.status, notes: row.internal_notes ?? "" }])));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (request: FlightQuoteRequest) => {
    const draft = drafts[request.id] ?? { status: request.status, notes: request.internal_notes };
    setSavingId(request.id);
    const { data, error } = await supabase.from("flight_quote_requests")
      .update({ status: draft.status, internal_notes: draft.notes })
      .eq("id", request.id)
      .select("id")
      .maybeSingle();
    setSavingId(null);
    if (error || !data) {
      toast.error("This request could not be updated. Confirm your staff access and try again.");
      return;
    }
    setRequests((previous) => previous.map((row) => row.id === request.id ? { ...row, status: draft.status, internal_notes: draft.notes } : row));
    toast.success("Flight quotation request updated");
  };

  return (
    <section aria-labelledby="flight-quote-requests-heading" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-5 sm:p-6">
        <div><p className="text-xs font-semibold uppercase tracking-[.15em] text-accent">Manual quotation desk</p><h2 id="flight-quote-requests-heading" className="mt-1 text-xl font-semibold text-primary">Flight quotation requests</h2><p className="mt-1 text-sm text-muted-foreground">Requests are inquiries only. “Customer accepted quote” does not mean an airline reservation or ticket exists.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-primary hover:bg-surface disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
      </div>
      {loading ? <div className="p-10 text-center text-sm text-muted-foreground" role="status">Loading quotation requests…</div>
        : loadError ? <div className="p-8 text-center" role="alert"><p className="text-sm text-rose-800">Requests could not be loaded. Check staff access or try again.</p><button type="button" onClick={() => void load()} className="mt-3 text-sm font-semibold text-primary underline">Try again</button></div>
        : requests.length === 0 ? <div className="p-10 text-center"><Plane className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-semibold text-primary">No flight quotation requests yet</p><p className="mt-1 text-sm text-muted-foreground">New customer inquiries will appear here.</p></div>
          : <div className="grid gap-4 p-4 sm:p-5">{requests.map((request) => {
            const draft = drafts[request.id] ?? { status: request.status, notes: request.internal_notes };
            const whatsapp = request.customer_phone.replace(/\D/g, "");
            return <article key={request.id} className="min-w-0 rounded-2xl border border-border/70 bg-white p-4 shadow-sm sm:p-5">
              <header className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-4">
                <div className="min-w-0"><p className="font-mono text-xs font-bold tracking-wide text-accent">{request.reference}</p><h3 className="mt-1 break-words text-lg font-semibold text-primary">{request.customer_name}</h3><p className="mt-1 text-xs text-muted-foreground">Submitted {format(parseISO(request.created_at), "dd MMM yyyy, HH:mm")}</p></div>
                <span className="inline-flex rounded-full bg-primary/5 px-3 py-1.5 text-xs font-semibold capitalize text-primary">{statuses.find((item) => item.value === request.status)?.label ?? request.status}</span>
              </header>
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.7fr)]">
                <div className="min-w-0 space-y-3">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-surface p-3"><div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">From</p><p className="mt-1 truncate font-semibold text-primary">{request.origin}</p></div><Plane className="h-4 w-4 text-accent" aria-hidden="true" /><div className="min-w-0 text-right"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">To</p><p className="mt-1 truncate font-semibold text-primary">{request.destination}</p></div></div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">Departure</dt><dd className="mt-0.5 font-medium">{format(parseISO(request.departure_date), "dd MMM yyyy")}</dd></div><div><dt className="text-xs text-muted-foreground">Return</dt><dd className="mt-0.5 font-medium">{request.return_date ? format(parseISO(request.return_date), "dd MMM yyyy") : "One way"}</dd></div><div><dt className="text-xs text-muted-foreground">Travelers</dt><dd className="mt-0.5 font-medium">{request.adults} adults · {request.children} children · {request.infants} infants</dd></div><div><dt className="text-xs text-muted-foreground">Cabin</dt><dd className="mt-0.5 font-medium capitalize">{request.cabin_class.replaceAll("_", " ")}</dd></div></dl>
                  {request.special_requests && <div className="rounded-xl border border-border/70 p-3"><p className="text-xs font-semibold text-muted-foreground">Special requests</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{request.special_requests}</p></div>}
                  <div className="flex flex-wrap gap-2 pt-1"><a href={`mailto:${encodeURIComponent(request.customer_email)}?subject=${encodeURIComponent(`Flight quotation ${request.reference}`)}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-3.5 text-sm font-semibold text-primary hover:bg-surface"><Mail className="h-4 w-4" /> Email customer</a>{whatsapp && <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-3.5 text-sm font-semibold text-primary hover:bg-surface"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}</div>
                </div>
                <div className="min-w-0 rounded-xl border border-border/70 p-3 sm:p-4">
                  <label htmlFor={`quote-status-${request.id}`} className="text-sm font-semibold text-primary">Request status</label><select id={`quote-status-${request.id}`} value={draft.status} onChange={(event) => setDrafts((previous) => ({ ...previous, [request.id]: { ...draft, status: event.target.value as QuoteStatus } }))} className="mt-1.5 min-h-10 w-full rounded-xl border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
                  <label htmlFor={`quote-notes-${request.id}`} className="mt-4 block text-sm font-semibold text-primary">Internal notes <span className="font-normal text-muted-foreground">(staff only)</span></label><textarea id={`quote-notes-${request.id}`} value={draft.notes} maxLength={5000} rows={5} onChange={(event) => setDrafts((previous) => ({ ...previous, [request.id]: { ...draft, notes: event.target.value } }))} className="mt-1.5 w-full resize-y rounded-xl border border-border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  <button type="button" onClick={() => void save(request)} disabled={savingId === request.id} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{savingId === request.id ? "Saving…" : <><Save className="h-4 w-4" /> Save updates</>}</button>
                </div>
              </div>
            </article>;
          })}</div>}
      <div className="border-t border-border/70 px-5 py-3 text-xs text-muted-foreground">Customer contact details and internal notes are available only to authorized admins and agents through database row-level security.</div>
    </section>
  );
};
