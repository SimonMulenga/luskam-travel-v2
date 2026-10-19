import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Check, Clock3, FilePlus2, Plane, RefreshCw, Send, TicketCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { calculateFlightQuotationTotalCents } from "@/lib/flightQuotationAmounts";
import { canAdvanceFlightBooking, FLIGHT_BOOKING_TRANSITIONS, isFlightQuotationPastDue } from "@/lib/flightQuotationLifecycle";

type RequestRow = { id: string; reference: string; customer_name: string; origin: string; destination: string; departure_date: string; return_date: string | null; trip_type: string; adults: number; children: number; infants: number; cabin_class: string; status: string };
type QuoteRow = { id: string; request_id: string; revision: number; status: string; subtotal_zmw: number; issued_at: string | null; valid_until: string | null };
type ItemDraft = { description: string; quantity: string; unitAmountZmw: string };
type QuoteItemRow = { id: string; description: string; quantity: number; unit_amount_zmw: number; line_total_zmw: number };
type BookingRow = { id: string; quotation_id: string; request_id: string; status: string; supplier_confirmation_reference: string | null; ticket_number: string | null; created_at: string; quotation?: QuoteRow; request?: RequestRow; events?: { id: string; from_status: string | null; to_status: string; staff_note: string; created_at: string }[] };

const money = (value: number) => `ZMW ${new Intl.NumberFormat("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
const dateTime = (value: string | null) => value ? format(parseISO(value), "dd MMM yyyy, HH:mm") : "Not issued";
const transitions = FLIGHT_BOOKING_TRANSITIONS;

function blankItem(): ItemDraft { return { description: "", quantity: "1", unitAmountZmw: "" }; }

export function FlightQuotationOperations() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [selectedRequest, setSelectedRequest] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([blankItem()]);
  const [editingQuote, setEditingQuote] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [revisionMode, setRevisionMode] = useState(false);
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<QuoteItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [bookingDrafts, setBookingDrafts] = useState<Record<string, { status: string; note: string; supplier: string; ticket: string }>>({});
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
    const [requestResult, quoteResult, bookingResult, eventResult] = await Promise.all([
      supabase.from("flight_quote_requests").select("id,reference,customer_name,origin,destination,departure_date,return_date,trip_type,adults,children,infants,cabin_class,status").order("created_at", { ascending: false }).limit(200),
      supabase.from("flight_quotations").select("id,request_id,revision,status,subtotal_zmw,issued_at,valid_until").order("revision", { ascending: false }).limit(500),
      supabase.from("flight_quote_bookings").select("id,quotation_id,request_id,status,supplier_confirmation_reference,ticket_number,created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("flight_quote_booking_events").select("id,booking_id,from_status,to_status,staff_note,created_at").order("created_at", { ascending: true }).limit(1000),
    ]);
    const failed = requestResult.error || quoteResult.error || bookingResult.error || eventResult.error;
    if (failed) {
      setRequests([]); setQuotes([]); setBookings([]); setBookingDrafts({}); setLoadError(true);
      return;
    }
    const requestRows = (requestResult.data ?? []) as RequestRow[];
    const quoteRows = (quoteResult.data ?? []) as QuoteRow[];
    const bookingRows = (bookingResult.data ?? []) as Omit<BookingRow, "quotation" | "request" | "events">[];
    const quoteById = new Map(quoteRows.map((row) => [row.id, row]));
    const requestById = new Map(requestRows.map((row) => [row.id, row]));
    const eventRows = (eventResult.data ?? []) as ({ id: string; booking_id: string; from_status: string | null; to_status: string; staff_note: string; created_at: string })[];
    setRequests(requestRows); setQuotes(quoteRows);
    setBookings(bookingRows.map((row) => ({ ...row, quotation: quoteById.get(row.quotation_id), request: requestById.get(row.request_id), events: eventRows.filter((event) => event.booking_id === row.id) })));
    setBookingDrafts((previous) => Object.fromEntries(bookingRows.map((row) => [row.id, previous[row.id] ?? { status: "", note: "", supplier: row.supplier_confirmation_reference ?? "", ticket: row.ticket_number ?? "" }])));
    if (!selectedRequest && requestRows[0]) setSelectedRequest(requestRows[0].id);
    } catch {
      setRequests([]); setQuotes([]); setBookings([]); setBookingDrafts({}); setLoadError(true);
    } finally {
    setLoading(false);
    }
  }, [selectedRequest]);

  useEffect(() => { void load(); }, [load]);

  const quotesByRequest = useMemo(() => {
    const map = new Map<string, QuoteRow[]>();
    quotes.forEach((quote) => map.set(quote.request_id, [...(map.get(quote.request_id) ?? []), quote]));
    return map;
  }, [quotes]);
  const visibleBookings = bookings.filter((row) => `${row.request?.reference ?? ""} ${row.request?.customer_name ?? ""} ${row.request?.origin ?? ""} ${row.request?.destination ?? ""} ${row.status}`.toLowerCase().includes(search.toLowerCase()));
  const selected = requests.find((row) => row.id === selectedRequest);
  const selectedQuotes = quotesByRequest.get(selectedRequest) ?? [];
  const editable = selectedQuotes.find((row) => row.id === editingQuote);
  const previewTotalCents = calculateFlightQuotationTotalCents(items);

  const loadDraft = async (quote?: QuoteRow) => {
    if (!quote) { setEditingQuote(null); setRevisionMode(false); setEditorOpen(true); setItems([blankItem()]); return; }
    const { data, error } = await supabase.from("flight_quotation_items").select("description,quantity,unit_amount_zmw").eq("quotation_id", quote.id).order("item_order");
    if (error) return toast.error("Draft items could not be loaded.");
    setEditingQuote(quote.id);
    setEditorOpen(true);
    setItems(((data ?? []) as { description: string; quantity: number; unit_amount_zmw: number }[]).map((item) => ({ description: item.description, quantity: String(item.quantity), unitAmountZmw: String(item.unit_amount_zmw) })));
  };

  const toggleQuoteItems = async (quote: QuoteRow) => {
    if (expandedQuote === quote.id) { setExpandedQuote(null); setExpandedItems([]); return; }
    const { data, error } = await supabase.from("flight_quotation_items").select("id,description,quantity,unit_amount_zmw,line_total_zmw").eq("quotation_id", quote.id).order("item_order");
    if (error) return toast.error("Quotation line items could not be loaded.");
    setExpandedQuote(quote.id); setExpandedItems((data ?? []) as QuoteItemRow[]);
  };

  const saveDraft = async (revise = false) => {
    if (!selected) return;
    if (items.length < 1 || items.length > 100) return toast.error("Add between 1 and 100 quotation items.");
    const payload = items.map((item) => ({ description: item.description.trim(), quantity: Number(item.quantity), unitAmountZmw: Number(item.unitAmountZmw) }));
    if (payload.some((item) => !item.description || item.description.length > 240)) return toast.error("Each item needs a description of at most 240 characters.");
    const exactTotalCents = calculateFlightQuotationTotalCents(items);
    if (exactTotalCents === null) return toast.error("Check each amount (quantity 0.01–100,000.00, unit price ZMW 0.00–9,999,999.99) and keep the total at or below ZMW 999,999,999,999.99.");
    setSaving(true);
    const rpcItems = payload.map((item) => ({ description: item.description, quantity: item.quantity, unitAmountZmw: item.unitAmountZmw }));
    let error: { message: string } | null = null;
    if (revise && editingQuote) {
      const result = await supabase.rpc("revise_flight_quotation", { p_quotation_id: editingQuote, p_items: rpcItems }); error = result.error;
    } else if (editingQuote) {
      const result = await supabase.rpc("edit_flight_quotation_draft", { p_quotation_id: editingQuote, p_items: rpcItems }); error = result.error;
    } else {
      const result = await supabase.rpc("create_flight_quotation_draft", { p_request_id: selected.id, p_items: rpcItems }); error = result.error;
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(revise ? "Quotation revision saved as a draft." : "Quotation draft saved.");
    setEditingQuote(null); setEditorOpen(false); setRevisionMode(false); await load();
  };

  const issue = async (quote: QuoteRow) => {
    setSaving(true); const { data, error } = await supabase.rpc("issue_flight_quotation", { p_quotation_id: quote.id }); setSaving(false);
    if (error) return toast.error(error.message);
    const issued = data as { valid_until?: string };
    toast.success(`Quotation issued. Valid until ${dateTime(issued.valid_until ?? null)}.`); await load();
  };

  const expire = async (quote: QuoteRow) => {
    setSaving(true); const { data, error } = await supabase.rpc("expire_flight_quotation", { p_quotation_id: quote.id }); setSaving(false);
    if (error) return toast.error(error.message);
    if (!data) return toast.error("This quotation is not yet expired or is no longer in the issued state.");
    toast.success("Quotation marked expired."); await load();
  };

  const saveBooking = async (row: BookingRow) => {
    const draft = bookingDrafts[row.id];
    if (!draft?.status) return toast.error("Choose a next booking status.");
    if (!canAdvanceFlightBooking(row.status, draft.status)) return toast.error("That booking status transition is not allowed.");
    if (draft.status === "confirmed_ticket_issued" && (!draft.supplier.trim() || !draft.ticket.trim())) return toast.error("Enter the real supplier confirmation and ticket references before recording ticket issuance.");
    if (draft.status === "confirmed_ticket_issued" && (draft.supplier.trim() === row.supplier_confirmation_reference || draft.ticket.trim() === row.ticket_number)) return toast.error("Enter verified supplier and ticket references; these fields are required for the ticket issuance transition.");
    setSaving(true);
    const { data, error } = await supabase.rpc("update_flight_quote_booking_status", { p_booking_id: row.id, p_status: draft.status, p_staff_note: draft.note, p_supplier_confirmation_reference: draft.status === "confirmed_ticket_issued" ? draft.supplier.trim() : null, p_ticket_number: draft.status === "confirmed_ticket_issued" ? draft.ticket.trim() : null });
    setSaving(false);
    if (error) return toast.error(error.message);
    const result = data as { outcome?: string; status?: string };
    if (result.outcome !== "updated") return toast.error("The booking status was not updated.");
    toast.success("Booking request updated."); await load();
  };

  return <div className="space-y-6 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-accent">Phase 6A / 7A</p><h2 className="mt-1 text-xl font-semibold text-primary">Quotation and booking operations</h2><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Issuing a quote starts a 24-hour window. Customer acceptance creates a booking request only. Ticketing remains manual after real supplier confirmation.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-primary"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button></div>
    {loadError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Quotation operations could not be loaded. No partial results are shown. Check staff access and refresh.</div>}
    <section className="grid gap-5 xl:grid-cols-[minmax(280px,.75fr)_minmax(0,1.5fr)]">
      <div className="rounded-2xl border border-border/70 p-4"><h3 className="font-semibold text-primary">Select a request</h3>{loading ? <p className="py-6 text-sm text-muted-foreground">Loading requests…</p> : <div className="mt-3 max-h-[32rem] space-y-2 overflow-auto">{requests.map((row) => <button key={row.id} type="button" onClick={() => { setSelectedRequest(row.id); setEditingQuote(null); setEditorOpen(false); setRevisionMode(false); setItems([blankItem()]); }} aria-pressed={selectedRequest === row.id} className={`w-full rounded-xl border p-3 text-left ${selectedRequest === row.id ? "border-accent bg-accent/5" : "border-border/70 hover:bg-surface"}`}><span className="flex items-center justify-between gap-2"><span className="font-mono text-xs font-bold text-accent">{row.reference}</span><span className="text-xs capitalize text-muted-foreground">{row.status}</span></span><span className="mt-1 block text-sm font-semibold text-primary">{row.customer_name}</span><span className="mt-1 block text-xs text-muted-foreground">{row.origin} → {row.destination} · {row.adults + row.children + row.infants} travellers</span></button>)}</div>}</div>
      {selected ? <div className="min-w-0 rounded-2xl border border-border/70 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-accent">{selected.reference}</p><h3 className="mt-1 text-lg font-semibold text-primary">{selected.customer_name} · {selected.origin} → {selected.destination}</h3><p className="mt-1 text-sm text-muted-foreground">{format(parseISO(selected.departure_date), "dd MMM yyyy")}{selected.return_date ? ` – ${format(parseISO(selected.return_date), "dd MMM yyyy")}` : " · one way"} · {selected.cabin_class}</p></div><span className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold capitalize"><Plane className="h-3.5 w-3.5" />{selected.status}</span></div>
        <div className="mt-5 border-t border-border/70 pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold text-primary">Quotation history</h4>{!editable && <button type="button" onClick={() => void loadDraft()} className="inline-flex min-h-9 items-center gap-2 rounded-full bg-primary px-3.5 text-xs font-semibold text-white"><FilePlus2 className="h-4 w-4" />New draft</button>}</div>
          {selectedQuotes.length ? <ol className="mt-3 space-y-2">{[...selectedQuotes].sort((a,b) => a.revision-b.revision).map((quote) => { const pastDue = isFlightQuotationPastDue(quote.status, quote.valid_until); return <li key={quote.id} className="rounded-xl bg-surface p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-primary">Revision {quote.revision} · <span className="capitalize">{pastDue ? "expired" : quote.status}</span></p><p className="mt-0.5 text-xs text-muted-foreground">{quote.status === "draft" ? "Draft" : `Issued ${dateTime(quote.issued_at)} · expires ${dateTime(quote.valid_until)}`} · {money(quote.subtotal_zmw)}</p></div><div className="flex flex-wrap gap-2">{quote.status !== "draft" && <button type="button" onClick={() => void toggleQuoteItems(quote)} className="min-h-9 rounded-full border border-border px-3 text-xs font-semibold">{expandedQuote === quote.id ? "Hide items" : "View items"}</button>}{quote.status === "draft" && <><button type="button" onClick={() => { setRevisionMode(false); void loadDraft(quote); }} className="min-h-9 rounded-full border border-border px-3 text-xs font-semibold">Edit draft</button><button type="button" disabled={saving} onClick={() => void issue(quote)} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-accent px-3 text-xs font-semibold text-white"><Send className="h-3.5 w-3.5" />Issue</button></>}{pastDue && <button type="button" disabled={saving} onClick={() => void expire(quote)} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border px-3 text-xs font-semibold"><Clock3 className="h-3.5 w-3.5"/>Persist expiry</button>}{quote.status !== "draft" && quote.status !== "accepted" && <button type="button" onClick={() => { void loadDraft(quote).then(() => setRevisionMode(true)); }} className="min-h-9 rounded-full border border-border px-3 text-xs font-semibold">Prepare revision</button>}</div></div>{expandedQuote === quote.id && <div className="mt-3 divide-y divide-border/70 rounded-lg border border-border/70 bg-white px-3">{expandedItems.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span className="min-w-0 flex-1 break-words">{item.description} <span className="text-xs text-muted-foreground">× {item.quantity} at {money(item.unit_amount_zmw)}</span></span><span className="font-medium">{money(item.line_total_zmw)}</span></div>)}</div>}</li>; })}</ol> : <p className="mt-3 rounded-xl bg-surface p-4 text-sm text-muted-foreground">No quotation history yet.</p>}</div>
        {editorOpen && <div className="mt-5 rounded-xl border border-accent/30 bg-accent/5 p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold text-primary">{revisionMode ? `Prepare revision from revision ${editable?.revision ?? ""}` : editingQuote ? `Edit quotation draft${editable ? ` · revision ${editable.revision}` : ""}` : "New quotation draft"}</h4><p className="text-xs text-muted-foreground">Amounts use ZMW. Each issued version is immutable.</p></div><button type="button" onClick={() => { setEditingQuote(null); setEditorOpen(false); setRevisionMode(false); setItems([blankItem()]); }} className="text-xs font-semibold text-primary underline">Close editor</button></div>
          {items.map((item,index) => <div key={index} className="mt-3 grid gap-2 rounded-xl border border-border/70 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_130px_160px_auto]"><label className="text-xs font-semibold text-muted-foreground">Description<input maxLength={240} value={item.description} onChange={(e) => setItems((old) => old.map((it,i) => i===index ? {...it,description:e.target.value} : it))} className="mt-1 min-h-10 w-full rounded-lg border border-border px-3 text-sm font-normal text-foreground" /></label><label className="text-xs font-semibold text-muted-foreground">Quantity<input type="number" min="0.01" max="100000" step="0.01" value={item.quantity} onChange={(e) => setItems((old) => old.map((it,i) => i===index ? {...it,quantity:e.target.value} : it))} className="mt-1 min-h-10 w-full rounded-lg border border-border px-3 text-sm font-normal text-foreground" /></label><label className="text-xs font-semibold text-muted-foreground">Unit amount (ZMW)<input type="number" min="0" max="9999999.99" step="0.01" value={item.unitAmountZmw} onChange={(e) => setItems((old) => old.map((it,i) => i===index ? {...it,unitAmountZmw:e.target.value} : it))} className="mt-1 min-h-10 w-full rounded-lg border border-border px-3 text-sm font-normal text-foreground" /></label><button type="button" disabled={items.length===1} onClick={() => setItems((old) => old.filter((_,i) => i!==index))} className="mt-4 min-h-10 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-40">Remove</button><p className="text-xs text-muted-foreground sm:col-span-full">Line total preview: {money(Number(item.quantity || 0)*Number(item.unitAmountZmw || 0))}</p></div>)}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={items.length>=100} onClick={() => setItems((old) => [...old,blankItem()])} className="min-h-10 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-40">Add line item</button><p className="font-semibold text-primary">Total preview: {previewTotalCents === null ? "Amount out of range" : money(Number(previewTotalCents) / 100)}</p></div><div className="mt-4 flex flex-wrap gap-2">{!revisionMode && <button type="button" disabled={saving} onClick={() => void saveDraft(false)} className="min-h-10 rounded-full bg-primary px-4 text-sm font-semibold text-white">{saving ? "Saving…" : "Save draft"}</button>}{revisionMode && <button type="button" disabled={saving} onClick={() => void saveDraft(true)} className="min-h-10 rounded-full border border-primary px-4 text-sm font-semibold text-primary">{saving ? "Saving…" : "Create new revision draft"}</button>}</div>
        </div>}
        </div> : <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Select a flight request to manage its quotations.</div>}
    </section>
    <section className="rounded-2xl border border-border/70"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-accent">Phase 7A</p><h3 className="font-semibold text-primary">Accepted quotation booking requests</h3></div><label className="sr-only" htmlFor="quote-booking-search">Search booking requests</label><input id="quote-booking-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, customer, route…" className="min-h-10 w-full max-w-sm rounded-xl border border-border px-3 text-sm" /></div>
      {loading ? <p className="p-6 text-sm text-muted-foreground">Loading booking requests…</p> : loadError ? null : visibleBookings.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No matching accepted quotation bookings.</p> : <div className="space-y-3 p-3 sm:p-4">{visibleBookings.map((row) => { const draft=bookingDrafts[row.id] ?? {status:"",note:"",supplier:"",ticket:""}; const options=FLIGHT_BOOKING_TRANSITIONS[row.status] ?? []; return <article key={row.id} className="rounded-xl border border-border/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-accent">{row.request?.reference ?? "Request reference unavailable"}</p><h4 className="mt-1 font-semibold text-primary">{row.request?.customer_name ?? "Customer"} · {row.request?.origin ?? "—"} → {row.request?.destination ?? "—"}</h4><p className="mt-1 text-xs text-muted-foreground">Booking request · {row.quotation ? `Quotation revision ${row.quotation.revision} · ${money(row.quotation.subtotal_zmw)}` : "Quotation details unavailable"} · {format(parseISO(row.created_at),"dd MMM yyyy, HH:mm")}</p></div><span className="rounded-full bg-primary/5 px-3 py-1.5 text-xs font-semibold capitalize text-primary">{row.status.replaceAll("_"," ")}</span></div>
        <details className="mt-3 rounded-lg bg-surface p-3"><summary className="cursor-pointer text-sm font-semibold text-primary">Booking history ({row.events?.length ?? 0})</summary><ol className="mt-2 space-y-2">{(row.events ?? []).map((event) => <li key={event.id} className="border-l-2 border-accent/40 pl-3 text-xs"><p className="font-semibold capitalize">{event.from_status ? `${event.from_status.replaceAll("_"," ")} → ` : ""}{event.to_status.replaceAll("_"," ")}</p><p className="text-muted-foreground">{dateTime(event.created_at)}{event.staff_note ? ` · ${event.staff_note}` : ""}</p></li>)}</ol></details>
        {options.length>0 ? <div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-xs font-semibold text-muted-foreground">Next status<select value={draft.status} onChange={(e) => setBookingDrafts((old) => ({...old,[row.id]:{...draft,status:e.target.value}}))} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground"><option value="">Select status</option>{options.map((status) => <option key={status} value={status}>{status.replaceAll("_"," ")}</option>)}</select></label><label className="text-xs font-semibold text-muted-foreground">Staff note<input maxLength={5000} value={draft.note} onChange={(e) => setBookingDrafts((old) => ({...old,[row.id]:{...draft,note:e.target.value}}))} className="mt-1 min-h-10 w-full rounded-lg border border-border px-3 text-sm font-normal text-foreground" /></label>{draft.status === "confirmed_ticket_issued" && <><label className="text-xs font-semibold text-muted-foreground">Verified supplier confirmation reference<input value={draft.supplier} onChange={(e)=>setBookingDrafts((old)=>({...old,[row.id]:{...draft,supplier:e.target.value}}))} className="mt-1 min-h-10 w-full rounded-lg border border-border px-3 text-sm font-normal text-foreground" /></label><label className="text-xs font-semibold text-muted-foreground">Real airline ticket number<input value={draft.ticket} onChange={(e)=>setBookingDrafts((old)=>({...old,[row.id]:{...draft,ticket:e.target.value}}))} className="mt-1 min-h-10 w-full rounded-lg border border-border px-3 text-sm font-normal text-foreground" /></label><p className="text-xs text-amber-800 sm:col-span-2">Record ticket issuance only after you have the supplier's real confirmation and ticket number.</p></>}{draft.status && <button type="button" disabled={saving} onClick={()=>void saveBooking(row)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white sm:col-span-2"><TicketCheck className="h-4 w-4"/>{saving?"Saving…":"Save status update"}</button>}</div> : <p className="mt-3 text-xs text-muted-foreground">This booking is in a terminal status. Its audit history remains available.</p>}
      </article>; })}</div>}</section>
  </div>;
}
