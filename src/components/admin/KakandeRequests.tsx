import { useCallback, useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Bus, Check, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KakandeTripManagement } from "@/components/admin/KakandeTripManagement";

type KakandeRequest = {
  id: string;
  reference: string;
  customer_name: string;
  customer_phone: string;
  trip_month: string;
  travel_mode: "flight" | "road";
  travel_date: string;
  total_quoted_amount_zmw: number;
  currency_code: "ZMW";
  status: "pending" | "in_progress" | "approved" | "rejected";
  internal_notes: string;
  created_at: string;
};

type KakandeStatus = KakandeRequest["status"];
type RequestDraft = { status: KakandeStatus; internalNotes: string };

const PAGE_SIZE = 25;

const statusLabels: Record<KakandeRequest["status"], string> = {
  pending: "Pending",
  in_progress: "In progress",
  approved: "Approved by Luskam",
  rejected: "Rejected by Luskam",
};

const statusOptions: { value: KakandeStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "approved", label: "Approved by Luskam" },
  { value: "rejected", label: "Rejected by Luskam" },
];
const allowedStatuses = new Set<KakandeStatus>(statusOptions.map(({ value }) => value));

const formatAmount = (amount: number) =>
  new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount));

type KakandeRequestsProps = {
  canManageTrips?: boolean;
  canUpdateRequests?: boolean;
  canApproveRequests?: boolean;
};

export const KakandeRequests = ({
  canManageTrips = false,
  canUpdateRequests = false,
  canApproveRequests = false,
}: KakandeRequestsProps) => {
  const [requests, setRequests] = useState<KakandeRequest[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RequestDraft>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const savingIdsRef = useRef(new Set<string>());
  const [feedback, setFeedback] = useState<Record<string, { kind: "success" | "error"; message: string }>>({});
  const [page, setPage] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadPage = useCallback(async (active: () => boolean) => {
    setLoading(true);
    setLoadError(false);

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error, count } = await supabase
      .from("kakande_ministry_requests")
      .select(
        "id, reference, customer_name, customer_phone, trip_month, travel_mode, travel_date, total_quoted_amount_zmw, currency_code, status, internal_notes, created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);

    if (!active()) return;
    if (error) {
      setRequests([]);
      setDrafts({});
      setTotalCount(0);
      setLoadError(true);
    } else {
      const loadedRequests = (data ?? []) as KakandeRequest[];
      setRequests(loadedRequests);
      setDrafts(Object.fromEntries(loadedRequests.map((request) => [request.id, {
        status: request.status,
        internalNotes: request.internal_notes ?? "",
      }])));
      setTotalCount(count ?? 0);
      if ((data ?? []).length === 0 && from > 0 && count !== null && from >= count) {
        setPage(Math.max(0, Math.ceil(count / PAGE_SIZE) - 1));
        return;
      }
    }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    let active = true;
    void loadPage(() => active);
    return () => { active = false; };
  }, [loadPage, refreshKey]);

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const updateDraft = (request: KakandeRequest, patch: Partial<RequestDraft>) => {
    setDrafts((current) => ({
      ...current,
      [request.id]: {
        status: current[request.id]?.status ?? request.status,
        internalNotes: current[request.id]?.internalNotes ?? request.internal_notes ?? "",
        ...patch,
      },
    }));
    setFeedback((current) => { const next = { ...current }; delete next[request.id]; return next; });
  };

  const saveRequestUpdate = async (request: KakandeRequest) => {
    if (!canUpdateRequests || savingIdsRef.current.has(request.id)) return;
    const draft = drafts[request.id] ?? { status: request.status, internalNotes: request.internal_notes ?? "" };
    const agentCanUpdate = canApproveRequests || (
      draft.status === "in_progress" && ["pending", "in_progress"].includes(request.status)
    );
    if (!allowedStatuses.has(draft.status) || !agentCanUpdate || draft.internalNotes.length > 5000) {
      setFeedback((current) => ({ ...current, [request.id]: { kind: "error", message: "This update is not permitted. Check the status and note, then try again." } }));
      return;
    }

    savingIdsRef.current.add(request.id);
    setSavingIds((current) => new Set(current).add(request.id));
    setFeedback((current) => { const next = { ...current }; delete next[request.id]; return next; });
    try {
      const { data, error } = await supabase.rpc("update_kakande_ministry_request", {
        p_request_id: request.id,
        p_status: draft.status,
        p_internal_notes: draft.internalNotes,
      });
      const result = data as { outcome?: string; reference?: string; status?: string } | null;
      const updated = !error && result?.reference === request.reference && (
        (result.outcome === "updated" && result.status === draft.status)
        || (result.outcome === "unchanged" && draft.status === request.status && draft.internalNotes === request.internal_notes)
      );
      if (!updated) {
        setFeedback((current) => ({ ...current, [request.id]: { kind: "error", message: "The request update could not be saved. Refresh and try again." } }));
        return;
      }
      setFeedback((current) => ({ ...current, [request.id]: { kind: "success", message: result.outcome === "unchanged" ? "No changes to save." : "Request updated." } }));
      setRefreshKey((current) => current + 1);
    } catch {
      setFeedback((current) => ({ ...current, [request.id]: { kind: "error", message: "The request update could not be saved. Refresh and try again." } }));
    } finally {
      savingIdsRef.current.delete(request.id);
      setSavingIds((current) => { const next = new Set(current); next.delete(request.id); return next; });
    }
  };

  return (
    <section aria-labelledby="kakande-requests-heading" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[.15em] text-accent">Monthly group travel</p>
          <h2 id="kakande-requests-heading" className="mt-1 text-xl font-semibold text-primary">Kakande Ministries requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">Review customer requests and the trip option price snapshot recorded at submission.</p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((current) => current + 1)}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-primary transition hover:bg-surface disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="p-10 text-center text-sm text-muted-foreground" role="status">Loading Kakande requests…</div>
      ) : loadError ? (
        <div className="p-8 text-center" role="alert">
          <p className="text-sm text-rose-800">Requests could not be loaded. Check staff access or try again.</p>
          <button type="button" onClick={() => setRefreshKey((current) => current + 1)} className="mt-3 text-sm font-semibold text-primary underline">Try again</button>
        </div>
      ) : requests.length === 0 ? (
        <div className="p-10 text-center">
          <Bus className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="mt-3 font-semibold text-primary">No Kakande requests yet</p>
          <p className="mt-1 text-sm text-muted-foreground">New customer requests will appear here.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 p-4 sm:p-5">
            {requests.map((request) => (
              <article key={request.id} className="min-w-0 rounded-2xl border border-border/70 bg-white p-4 shadow-sm sm:p-5">
                {(() => {
                  const draft = drafts[request.id] ?? { status: request.status, internalNotes: request.internal_notes ?? "" };
                  const saving = savingIds.has(request.id);
                  const editableByRole = canUpdateRequests && (
                    canApproveRequests || ["pending", "in_progress"].includes(request.status)
                  );
                  const dirty = draft.status !== request.status || draft.internalNotes !== (request.internal_notes ?? "");
                  return (
                    <>
                <header className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-4">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold tracking-wide text-accent">{request.reference}</p>
                    <h3 className="mt-1 break-words text-lg font-semibold text-primary">{request.customer_name}</h3>
                    <a className="mt-1 inline-block text-sm text-muted-foreground underline-offset-2 hover:underline" href={`tel:${request.customer_phone}`}>{request.customer_phone}</a>
                  </div>
                  <span className="inline-flex rounded-full bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
                    {statusLabels[request.status] ?? request.status}
                  </span>
                </header>

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
                  <div><dt className="text-xs text-muted-foreground">Transport</dt><dd className="mt-0.5 font-medium capitalize">By {request.travel_mode}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Travel month</dt><dd className="mt-0.5 font-medium">{request.trip_month}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Departure</dt><dd className="mt-0.5 font-medium">{format(parseISO(request.travel_date), "dd MMM yyyy")}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Quoted amount</dt><dd className="mt-0.5 font-semibold text-primary">{request.currency_code} {formatAmount(request.total_quoted_amount_zmw)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Submitted</dt><dd className="mt-0.5 font-medium">{format(parseISO(request.created_at), "dd MMM yyyy, HH:mm")}</dd></div>
                </dl>
                {editableByRole && <div className="mt-5 grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1.3fr)_auto] sm:items-end">
                  <div>
                    <label htmlFor={`kakande-status-${request.id}`} className="text-xs font-semibold text-primary">Request status</label>
                    <select
                      id={`kakande-status-${request.id}`}
                      aria-label={`Request status for ${request.reference}`}
                      value={draft.status}
                      disabled={saving}
                      onChange={(event) => updateDraft(request, { status: event.target.value as KakandeStatus })}
                      className="mt-1.5 min-h-10 w-full rounded-xl border border-border bg-white px-3 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                    >
                      {statusOptions.filter((option) => canApproveRequests || option.value === "in_progress" || option.value === request.status).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`kakande-notes-${request.id}`} className="text-xs font-semibold text-primary">Internal staff notes</label>
                    <textarea
                      id={`kakande-notes-${request.id}`}
                      aria-label={`Internal staff notes for ${request.reference}`}
                      value={draft.internalNotes}
                      maxLength={5000}
                      disabled={saving}
                      onChange={(event) => updateDraft(request, { internalNotes: event.target.value })}
                      className="mt-1.5 min-h-10 w-full resize-y rounded-xl border border-border bg-white px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Private to authorized staff; not shown to applicants.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveRequestUpdate(request)}
                    disabled={saving || !dirty}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving</> : <><Check className="h-4 w-4" aria-hidden="true" /> Save update</>}
                  </button>
                  {feedback[request.id] && <p className={`sm:col-span-3 text-sm ${feedback[request.id].kind === "success" ? "text-emerald-700" : "text-rose-800"}`} role={feedback[request.id].kind === "success" ? "status" : "alert"}>{feedback[request.id].message}</p>}
                </div>}
                    </>
                  );
                })()}
              </article>
            ))}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-5 py-3 sm:px-6">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount} requests
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0 || loading} aria-label="Previous page" className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
              </button>
              <span className="text-xs text-muted-foreground">Page {page + 1} of {pageCount}</span>
              <button type="button" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page >= pageCount - 1 || loading} aria-label="Next page" className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50">
                Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </footer>
        </>
      )}
      {canManageTrips && <KakandeTripManagement />}
    </section>
  );
};
