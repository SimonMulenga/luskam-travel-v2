import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";
import { Activity, BadgeCheck, BookOpen, CalendarDays, ChevronRight, CircleDollarSign, FileText, Loader2, Mail, Package, RefreshCw, Shield, SlidersHorizontal, Trash2, UserPlus, Users, WalletCards } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles, type AppRole } from "@/hooks/useRoles";
import { toast } from "sonner";
import { FlightPricing } from "@/components/admin/FlightPricing";
import { SiteContentEditor } from "@/components/admin/SiteContentEditor";
import { BlogManager } from "@/components/admin/BlogManager";
import { SubscribersList } from "@/components/admin/SubscribersList";
import { bookingStatus, paymentStatus, statusToneClass } from "@/lib/bookingStatus";

interface Booking {
  id: string;
  user_id: string;
  type: string;
  reference: string;
  total_amount: number;
  currency: string;
  status: string;
  payment_status: string;
  travel_date: string | null;
  created_at: string;
  details: Record<string, unknown>;
}
interface RoleRow { id: string; user_id: string; role: AppRole; created_at: string; email?: string; full_name?: string }
type Tab = "bookings" | "team" | "pricing" | "content" | "blog" | "subscribers";

const serviceLabels: Record<string, string> = { flight: "Flight", hotel: "Hotel", car: "Car hire", visa: "Visa", kakande: "Kakande trip", package: "Package", transfer: "Transfer", insurance: "Insurance" };

const AdminPage = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isAgent, loading: rolesLoading } = useRoles();
  const [tab, setTab] = useState<Tab>("bookings");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [roleRows, setRoleRows] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [newAgentEmail, setNewAgentEmail] = useState("");
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const { data: bookingData, error: bookingError } = await supabase.from("bookings").select("*").order("created_at", { ascending: false }).limit(200);
    if (bookingError) setLoadError("Bookings could not be loaded. Check access or try again.");
    else setBookings((bookingData ?? []) as Booking[]);

    if (isAdmin) {
      const { data: roleData, error: roleError } = await supabase.from("user_roles").select("*").order("created_at", { ascending: false });
      if (roleError) setLoadError("Some team details could not be loaded.");
      const rows = (roleData ?? []) as RoleRow[];
      const ids = [...new Set(rows.map((row) => row.user_id))];
      if (ids.length) {
        const { data: profileData } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        const names = new Map((profileData ?? []).map((profile) => [profile.id, profile.full_name]));
        rows.forEach((row) => { row.full_name = names.get(row.user_id) ?? undefined; });
      }
      setRoleRows(rows);
    }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    if (!authLoading && !rolesLoading && (isAdmin || isAgent)) void load();
  }, [authLoading, rolesLoading, isAdmin, isAgent, load]);

  if (authLoading || rolesLoading) return <div className="flex min-h-screen items-center justify-center bg-surface" role="status" aria-label="Checking access"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin && !isAgent) return <div className="min-h-screen bg-surface"><Header /><main className="container py-20 text-center"><Shield className="mx-auto h-10 w-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-semibold text-primary">Restricted</h1><p className="mt-1 text-sm text-muted-foreground">You don't have access to the admin dashboard.</p></main><Footer /></div>;

  const filtered = bookings.filter((booking) => (statusFilter === "all" || booking.status === statusFilter) && (typeFilter === "all" || booking.type === typeFilter));
  const bookingValue = currencyTotals(filtered);
  const paidValue = currencyTotals(filtered.filter((booking) => booking.payment_status === "paid"));
  const tabs: { id: Tab; label: string; icon: typeof Package; adminOnly?: boolean }[] = [
    { id: "bookings", label: "Bookings", icon: Package },
    { id: "pricing", label: "Flight pricing", icon: SlidersHorizontal },
    { id: "content", label: "Website content", icon: FileText, adminOnly: true },
    { id: "blog", label: "Blog", icon: BookOpen, adminOnly: true },
    { id: "subscribers", label: "Newsletter", icon: Mail, adminOnly: true },
    { id: "team", label: "Team & roles", icon: Users, adminOnly: true },
  ];
  const visibleTabs = tabs.filter((item) => !item.adminOnly || isAdmin);

  const updateBookingStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Booking updated");
    setBookings((previous) => previous.map((booking) => booking.id === id ? { ...booking, status } : booking));
  };
  const assignAgent = async (event: React.FormEvent) => {
    event.preventDefault();
    const email = newAgentEmail.trim().toLowerCase();
    if (!email) return;
    setAssigning(true);
    try {
      const { data, error } = await supabase.functions.invoke("assign-agent", { body: { email } });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success("Agent assigned");
      setNewAgentEmail("");
      void load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setAssigning(false);
    }
  };
  const removeRole = async (id: string) => {
    if (!confirm("Remove this role?")) return;
    const { error } = await supabase.from("user_roles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    setRoleRows((previous) => previous.filter((row) => row.id !== id));
  };

  return <div className="min-h-screen bg-surface">
    <Header />
    <main className="mx-auto w-full min-w-0 max-w-7xl px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
      <section className="overflow-hidden rounded-3xl bg-primary text-white shadow-[0_24px_70px_-36px_rgba(4,24,50,.5)]">
          <div className="flex min-w-0 flex-wrap items-end justify-between gap-5 p-5 sm:p-8">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10"><Activity className="h-6 w-6" /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.18em] text-sky-200">Travel operations</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Admin dashboard</h1><p className="mt-1 break-all text-sm text-white/70">{isAdmin ? "Director access" : "Sales agent access"} · {user.email}</p></div></div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh records</button>
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Current booking summary">
        <StatCard icon={<Package className="h-4 w-4" />} label="Matching bookings" value={String(filtered.length)} detail={`${bookings.length} loaded records`} />
        <StatCard icon={<CircleDollarSign className="h-4 w-4" />} label="Estimated request value" value={formatTotals(bookingValue)} detail="Indicative amounts; not customer invoices" />
        <StatCard icon={<WalletCards className="h-4 w-4" />} label="Payments recorded" value={formatTotals(paidValue)} detail="Recorded payment status does not mean a ticket was issued" />
      </section>

      <nav aria-label="Admin sections" className="mt-6 min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-2xl border border-border/70 bg-white p-1.5 shadow-sm">
        <div role="group" aria-label="Dashboard sections" className="flex w-max min-w-full gap-1">
          {visibleTabs.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4 ${tab === item.id ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-surface hover:text-primary"}`}><Icon className="h-4 w-4" />{item.label}</button>; })}
        </div>
      </nav>

      {loadError && <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-800"><span>{loadError}</span><button type="button" onClick={() => void load()} className="font-semibold underline underline-offset-2">Try again</button></div>}

      {tab === "bookings" && <section className="mt-5 overflow-hidden rounded-3xl border border-border/70 bg-white shadow-sm" aria-labelledby="bookings-heading">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/70 p-5 sm:p-6"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-accent">Manual travel operations</p><h2 id="bookings-heading" className="mt-1 text-xl font-semibold text-primary">Booking requests</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Review submitted details and verify availability and fare directly with the supplier. A request status is internal to Luskam and does not confirm an airline reservation or issued ticket. Payment status is read-only here; do not collect payment until an authorized staff member verifies the final quotation and sends instructions.</p></div><div className="flex flex-wrap gap-2"><label className="sr-only" htmlFor="booking-type-filter">Filter by service</label><select id="booking-type-filter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="min-h-10 rounded-xl border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"><option value="all">All services</option>{Object.entries(serviceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="sr-only" htmlFor="booking-status-filter">Filter by status</label><select id="booking-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-xl border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"><option value="all">All services statuses</option><option value="confirmed">Request approved</option><option value="pending">Request received</option><option value="cancelled">Cancelled</option><option value="completed">Request completed</option></select></div></div>
        {loading ? <div className="flex min-h-52 items-center justify-center gap-3 text-sm text-muted-foreground" role="status"><Loader2 className="h-5 w-5 animate-spin text-accent" />Loading booking records…</div> : filtered.length === 0 ? <div className="px-5 py-16 text-center"><CalendarDays className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-semibold text-primary">No bookings match these filters</p><p className="mt-1 text-sm text-muted-foreground">Try a different service or status.</p></div> : <div className="overflow-x-auto overscroll-x-contain"><table className="w-full min-w-[920px] text-sm"><thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-[.13em] text-muted-foreground"><tr><th className="px-4 py-3.5">Reference</th><th className="px-4 py-3.5">Service</th><th className="px-4 py-3.5">Travel date</th><th className="px-4 py-3.5">Amount</th><th className="px-4 py-3.5">Booking status</th><th className="px-4 py-3.5">Recorded payment status</th><th className="px-4 py-3.5">Created</th></tr></thead><tbody className="divide-y divide-border/70">{filtered.map((booking) => <tr key={booking.id} className="transition hover:bg-surface/70"><td className="px-4 py-3.5 font-mono text-xs font-semibold text-primary">{booking.reference}<RequestDetails booking={booking} /></td><td className="px-4 py-3.5"><span className="inline-flex rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-foreground">{serviceLabels[booking.type] ?? booking.type}</span></td><td className="px-4 py-3.5 text-muted-foreground">{booking.travel_date ? format(new Date(booking.travel_date), "dd MMM yyyy") : "—"}</td><td className="px-4 py-3.5 font-semibold text-primary">{booking.currency} {Number(booking.total_amount).toLocaleString()}</td><td className="px-4 py-3.5"><div className="flex flex-col items-start gap-1"><StatusBadge kind="booking" value={booking.status} /><label className="sr-only" htmlFor={`status-${booking.id}`}>Update booking status for {booking.reference}</label><select id={`status-${booking.id}`} aria-label={`Update booking status for ${booking.reference}`} value={booking.status} onChange={(event) => void updateBookingStatus(booking.id, event.target.value)} className="min-h-8 max-w-40 rounded-lg border border-border bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"><option value="pending">Request received</option><option value="confirmed">Request approved (not airline confirmed)</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div></td><td className="px-4 py-3.5"><div className="flex flex-col items-start gap-1"><StatusBadge kind="payment" value={booking.payment_status} amount={booking.total_amount} /></div></td><td className="px-4 py-3.5 text-xs text-muted-foreground">{format(new Date(booking.created_at), "dd MMM, HH:mm")}</td></tr>)}</tbody></table></div>}
        <div className="border-t border-border/70 px-5 py-3 text-xs text-muted-foreground sm:px-6">Showing records returned by current account permissions, up to 200 latest bookings.</div>
      </section>}

      {tab === "pricing" && <div className="mt-5 min-w-0 rounded-3xl border border-border/70 bg-white p-4 shadow-sm sm:p-6"><div className="mb-4 flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary"><SlidersHorizontal className="h-5 w-5" /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-accent">Fare controls</p><h2 className="break-words font-semibold text-primary">Flight pricing &amp; markup</h2></div></div><FlightPricing canEdit={isAdmin} /></div>}
      {tab === "content" && isAdmin && <Panel title="Website content" eyebrow="Site settings" icon={<FileText className="h-5 w-5" />}><SiteContentEditor /></Panel>}
      {tab === "blog" && isAdmin && <Panel title="Blog publishing" eyebrow="Editorial" icon={<BookOpen className="h-5 w-5" />}><BlogManager /></Panel>}
      {tab === "subscribers" && isAdmin && <Panel title="Newsletter subscribers" eyebrow="Audience records" icon={<Mail className="h-5 w-5" />}><SubscribersList /></Panel>}

      {tab === "team" && isAdmin && <div className="mt-5 grid items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <form onSubmit={assignAgent} className="rounded-3xl border border-border/70 bg-white p-5 shadow-sm sm:p-6"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5 text-primary"><UserPlus className="h-5 w-5" /></span><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-accent">Access management</p><h2 className="mt-1 text-lg font-semibold text-primary">Assign a sales agent</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">The person must already have an account. Enter the email used to sign up.</p><label htmlFor="agent-email" className="mt-4 block text-sm font-semibold text-primary">Account email</label><input id="agent-email" type="email" required autoComplete="email" value={newAgentEmail} onChange={(event) => setNewAgentEmail(event.target.value)} placeholder="agent@example.com" className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" /><button type="submit" disabled={assigning} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{assigning ? <><Loader2 className="h-4 w-4 animate-spin" /> Assigning…</> : <>Grant agent access <ChevronRight className="h-4 w-4" /></>}</button></form>
        <section className="overflow-hidden rounded-3xl border border-border/70 bg-white shadow-sm"><div className="border-b border-border/70 p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-wide text-accent">Access list</p><h2 className="mt-1 text-lg font-semibold text-primary">Team members</h2></div>{roleRows.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No team roles returned.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Name / account</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Since</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-border/70">{roleRows.map((row) => <tr key={row.id}><td className="px-4 py-3.5 font-medium text-foreground">{row.full_name ?? <span className="font-mono text-xs text-muted-foreground">{row.user_id.slice(0, 8)}…</span>}</td><td className="px-4 py-3.5"><span className="rounded-full bg-primary/5 px-2.5 py-1 text-xs font-semibold capitalize text-primary">{row.role}</span></td><td className="px-4 py-3.5 text-xs text-muted-foreground">{format(new Date(row.created_at), "dd MMM yyyy")}</td><td className="px-4 py-3.5 text-right">{row.role !== "admin" && <button type="button" onClick={() => void removeRole(row.id)} aria-label={`Remove ${row.role} role`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /> Remove</button>}</td></tr>)}</tbody></table></div>}</section>
      </div>}
    </main>
    <Footer />
  </div>;
};

function currencyTotals(rows: Booking[]) {
  return rows.reduce<Record<string, number>>((totals, booking) => { const currency = booking.currency || "Unknown currency"; totals[currency] = (totals[currency] ?? 0) + Number(booking.total_amount || 0); return totals; }, {});
}
function RequestDetails({ booking }: { booking: Booking }) {
  const details = booking.details ?? {};
  const contact = typeof details.contact === "object" && details.contact !== null ? details.contact as Record<string, unknown> : {};
  const travelers = Array.isArray(details.pax) ? details.pax as Array<Record<string, unknown>> : [];
  const search = typeof details.search === "object" && details.search !== null ? details.search as Record<string, unknown> : {};
  const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "";
  return <details className="mt-2 max-w-xs text-left font-sans text-xs">
    <summary className="cursor-pointer font-semibold text-accent underline-offset-2 hover:underline">Review request details</summary>
    <div className="mt-2 space-y-2 rounded-xl bg-surface p-3 text-foreground">
      {text(contact.email) && <p><span className="font-semibold">Email:</span> <a className="break-all text-accent underline" href={`mailto:${text(contact.email)}`}>{text(contact.email)}</a></p>}
      {text(contact.phone) && <p><span className="font-semibold">Phone:</span> <a className="text-accent underline" href={`tel:${text(contact.phone)}`}>{text(contact.phone)}</a></p>}
      {(text(search.origin) || text(search.destination)) && <p><span className="font-semibold">Route:</span> {text(search.origin)} → {text(search.destination)} {text(search.departureDate) && `· ${text(search.departureDate)}`}</p>}
      {travelers.length > 0 && <div><p className="font-semibold">Travelers:</p><ul className="mt-1 list-inside list-disc">{travelers.map((traveler, index) => <li key={index}>{[traveler.title, traveler.firstName, traveler.lastName].map(text).filter(Boolean).join(" ")} {text(traveler.type) && `(${text(traveler.type)})`}</li>)}</ul></div>}
      {text(details.airline) && <p><span className="font-semibold">Airline:</span> {text(details.airline)}</p>}
      {text(details.providerReference) && <p><span className="font-semibold">Provider offer reference:</span> <span className="break-all font-mono">{text(details.providerReference)}</span></p>}
      {!text(contact.email) && !text(contact.phone) && travelers.length === 0 && !text(search.origin) && !text(search.destination) && <p>{Object.entries(details).filter(([, value]) => typeof value === "string" || typeof value === "number").map(([key, value]) => <span key={key} className="mr-2 inline-block"><strong>{key}:</strong> {text(value)}</span>)}</p>}
    </div>
  </details>;
}
function formatTotals(totals: Record<string, number>) {
  const entries = Object.entries(totals);
  return entries.length ? entries.map(([currency, amount]) => `${currency} ${amount.toLocaleString()}`).join(" · ") : "—";
}
function StatusBadge({ kind, value, amount }: { kind: "booking" | "payment"; value: string; amount?: number }) {
  const status = kind === "booking" ? bookingStatus(value) : paymentStatus(value, amount);
  const tone = status.tone;
  return <span title={status.description} className={`inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset ${statusToneClass(tone)}`}>{kind === "booking" && value === "confirmed" ? <BadgeCheck className="h-3 w-3" /> : null}{status.label}</span>;
}
function StatCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <article className="min-w-0 rounded-2xl border border-border/70 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/5 text-primary">{icon}</span>{label}</div><p className="mt-3 break-words text-lg font-semibold leading-snug text-primary sm:text-xl">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>;
}
function Panel({ title, eyebrow, icon, children }: { title: string; eyebrow: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="mt-5 rounded-3xl border border-border/70 bg-white p-4 shadow-sm sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5 text-primary">{icon}</span><div><p className="text-xs font-semibold uppercase tracking-wide text-accent">{eyebrow}</p><h2 className="font-semibold text-primary">{title}</h2></div></div>{children}</section>;
}

export default AdminPage;
