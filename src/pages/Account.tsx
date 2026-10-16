import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, CarFront, CheckCircle2, CircleHelp, Clock3, CreditCard, Hotel, LifeBuoy, LogOut, Plane, Plus, UserRound, Wallet } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { bookingStatus, paymentStatus, statusToneClass } from "@/lib/bookingStatus";

interface Booking {
  id: string;
  reference: string;
  type: string;
  status: string;
  payment_status: string;
  total_amount: number;
  currency: string;
  travel_date: string | null;
  details: Record<string, unknown>;
  created_at: string;
}
interface Profile { full_name: string | null; phone: string | null }

const TYPE_LABEL: Record<string, string> = {
  flight: "Flight", hotel: "Hotel", car: "Car rental", visa: "Visa application",
  kakande: "Kakande Ministries trip", package: "Package", transfer: "Airport transfer", insurance: "Travel insurance",
};

const AccountPage = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [profile, setProfile] = useState<Profile>({ full_name: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!loading && !user) navigate("/auth?next=/account", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setFetching(true);
    (async () => {
      const [bookingResult, profileResult] = await Promise.all([
        supabase.from("bookings").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("full_name,phone").eq("id", userId).maybeSingle(),
      ]);
      if (!active) return;
      if (bookingResult.error) setLoadError("We couldn’t load your bookings. Please try again.");
      else setBookings((bookingResult.data ?? []) as Booking[]);
      if (profileResult.error) setLoadError("We couldn’t load all account details. Please refresh to try again.");
      else if (profileResult.data) setProfile({ full_name: profileResult.data.full_name ?? "", phone: profileResult.data.phone ?? "" });
      setFetching(false);
    })();
    return () => { active = false; };
  }, [userId]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({ id: user.id, full_name: profile.full_name, phone: profile.phone });
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Profile saved");
  };

  const cancelBooking = async (booking: Booking) => {
    if (!confirm(`Cancel booking ${booking.reference}?`)) return;
    setCancelling(booking.id);
    const { error } = await supabase.rpc("request_booking_cancellation", { p_booking_id: booking.id });
    setCancelling(null);
    if (error) return toast.error(error.message);
    toast.success("Booking cancelled");
    setBookings((current) => current.map((item) => item.id === booking.id ? { ...item, status: "cancelled" } : item));
  };

  if (loading || !user) return <div className="min-h-screen bg-surface"><Header /><main className="container py-20 text-center" role="status">Loading your account…</main></div>;

  const displayName = profile.full_name?.trim() || user.email?.split("@")[0] || "Traveler";
  const pendingCount = bookings.filter((booking) => booking.status === "pending").length;
  const paidCount = bookings.filter((booking) => booking.payment_status === "paid").length;

  return <div className="min-h-screen bg-surface">
    <Header />
    <main className="container max-w-7xl py-8 sm:py-10">
      <section className="overflow-hidden rounded-3xl bg-primary text-white shadow-[0_24px_70px_-35px_rgba(4,24,50,.55)]">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-9">
          <div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10"><UserRound className="h-6 w-6" /></span><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-sky-200">Traveler account</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Welcome, {displayName}</h1><p className="mt-1 break-all text-sm text-white/70">{user.email}</p></div></div>
          <div className="flex flex-wrap gap-2"><Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-primary transition hover:bg-sky-50"><Plus className="h-4 w-4" /> New booking</Link><button type="button" onClick={async () => { await signOut(); navigate("/"); }} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-4 text-sm font-semibold text-white transition hover:bg-white/10"><LogOut className="h-4 w-4" /> Sign out</button></div>
        </div>
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Stat icon={<CalendarDays className="h-4 w-4" />} label="Bookings" value={fetching ? "—" : String(bookings.length)} />
        <Stat icon={<Clock3 className="h-4 w-4" />} label="Requests in review" value={fetching ? "—" : String(pendingCount)} />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Payments marked received" value={fetching ? "—" : String(paidCount)} />
      </div>

      {loadError && <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-800">{loadError}</div>}

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        <section className="min-w-0 rounded-3xl border border-border/70 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="booking-history-heading">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-accent">Travel activity</p><h2 id="booking-history-heading" className="mt-1 text-xl font-semibold text-primary">Your bookings</h2></div><Link to="/" className="text-sm font-semibold text-accent hover:underline">Explore travel</Link></div>
          {fetching ? <div className="mt-5 space-y-3" role="status"><div className="h-28 animate-pulse rounded-2xl bg-surface"/><div className="h-28 animate-pulse rounded-2xl bg-surface"/></div> : bookings.length === 0 ? <div className="mt-5 rounded-2xl bg-surface px-5 py-10 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white text-primary shadow-sm"><Plane className="h-5 w-5" /></span><h3 className="mt-3 font-semibold text-primary">Your trips will appear here</h3><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground">Search flights, hotels, cars, or other travel services to start a booking request.</p><Link to="/" className="mt-4 inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-white">Start planning</Link></div> : <ul className="mt-5 space-y-3">{bookings.map((booking) => <BookingCard key={booking.id} booking={booking} onCancel={cancelBooking} cancelling={cancelling === booking.id} />)}</ul>}
        </section>

        <aside className="space-y-5">
          <section className="rounded-3xl border border-border/70 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="profile-heading"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5 text-primary"><UserRound className="h-5 w-5" /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-accent">Your details</p><h2 id="profile-heading" className="font-semibold text-primary">Profile</h2></div></div><form onSubmit={saveProfile} className="mt-4 space-y-3"><label className="block text-sm font-medium text-foreground" htmlFor="profile-name">Full name<input id="profile-name" autoComplete="name" value={profile.full_name ?? ""} onChange={(event) => setProfile((current) => ({ ...current, full_name: event.target.value }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label><label className="block text-sm font-medium text-foreground" htmlFor="profile-phone">Phone<input id="profile-phone" type="tel" autoComplete="tel" value={profile.phone ?? ""} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label><p className="text-xs leading-5 text-muted-foreground">Your profile details are visible only to your signed-in account.</p><button disabled={saving} className="min-h-11 w-full rounded-full bg-primary px-4 text-sm font-semibold text-white transition hover:bg-[hsl(var(--primary-hover))] disabled:opacity-60">{saving ? "Saving…" : "Save profile"}</button></form></section>
          <section className="rounded-3xl border border-border/70 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-2 font-semibold text-primary"><LifeBuoy className="h-4 w-4 text-accent" /> Need help?</div><p className="mt-2 text-sm leading-6 text-muted-foreground">Contact the travel team about a booking, fare, or manual payment.</p><div className="mt-4 grid gap-2"><a href="https://wa.me/260773918145" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#25D366] px-4 text-sm font-semibold text-white">WhatsApp bookings</a><a href="tel:+260979450446" className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-4 text-sm font-semibold text-primary">Call +260 979 450 446</a><a href="mailto:luskamtravelagents@gmail.com" className="inline-flex min-h-10 items-center justify-center text-sm font-medium text-accent hover:underline">Email support</a></div></section>
        </aside>
      </div>
    </main>
    <Footer />
  </div>;
};

function BookingCard({ booking, onCancel, cancelling }: { booking: Booking; onCancel: (booking: Booking) => void; cancelling: boolean }) {
  const bookingState = bookingStatus(booking.status);
  const paymentState = paymentStatus(booking.payment_status, booking.total_amount);
  const flight = booking.type === "flight";
  const Icon = flight ? Plane : booking.type === "hotel" ? Hotel : booking.type === "car" ? CarFront : CircleHelp;
  const canCancel = !["cancelled", "completed", "failed"].includes(booking.status.toLowerCase()) && booking.payment_status.toLowerCase() !== "paid";
  return <li className="rounded-2xl border border-border/70 p-4 transition hover:border-primary/20 hover:shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary"><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-accent">{TYPE_LABEL[booking.type] ?? booking.type}</p><h3 className="mt-1 break-all font-mono text-sm font-bold text-primary">{booking.reference}</h3></div></div><div className="shrink-0 text-right"><p className="text-base font-bold text-primary">{Number(booking.total_amount) > 0 ? formatMoney(booking.total_amount, booking.currency) : "Price on request"}</p>{Number(booking.total_amount) > 0 && <p className="text-[11px] text-muted-foreground">Estimated fare · subject to confirmation</p>}</div></div>
    <div className="mt-4 rounded-xl bg-surface p-3.5"><p className="text-sm font-semibold text-foreground">{bookingSummary(booking)}</p><p className="mt-1 text-xs text-muted-foreground">{booking.travel_date ? `Travel ${safeDate(booking.travel_date)} · ` : ""}Requested {safeDate(booking.created_at)}</p></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2"><StatusBadge label={bookingState.label} description={bookingState.description} tone={bookingState.tone} icon={booking.status.toLowerCase() === "confirmed" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />} /><StatusBadge label={paymentState.label} description={paymentState.description} tone={paymentState.tone} icon={<Wallet className="h-3.5 w-3.5" />} /></div>
    {booking.status.toLowerCase() === "pending" && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-950">We’ve received your request. The travel desk will review it and follow up. This status does not confirm ticketing.</p>}
    {booking.status.toLowerCase() !== "cancelled" && <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-3 text-xs leading-5 text-sky-950"><div className="flex items-center gap-2 font-semibold"><CreditCard className="h-3.5 w-3.5" /> Payment instructions</div><p className="mt-1">Do not pay based on this estimate or request status. Wait until Luskam verifies availability and sends you a confirmed quotation with payment instructions. Payment alone does not mean a ticket has been issued.</p></div>}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">Created {safeDate(booking.created_at)}</span>{canCancel && <button type="button" disabled={cancelling} onClick={() => onCancel(booking)} className="min-h-9 rounded-full border border-rose-200 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60">{cancelling ? "Cancelling…" : "Cancel request"}</button>}</div>
  </li>;
}

function StatusBadge({ label, description, tone, icon }: { label: string; description: string; tone: "amber" | "emerald" | "rose" | "slate" | "blue"; icon: React.ReactNode }) {
  return <div title={description} className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 ring-inset ${statusToneClass(tone)}`}>{icon}<span>{label}</span></div>;
}

function bookingSummary(booking: Booking) {
  const details = booking.details ?? {};
  const value = (...keys: string[]) => keys.map((key) => details[key]).find((item) => typeof item === "string" && item.trim()) as string | undefined;
  switch (booking.type) {
    case "flight": {
      const airline = value("airline");
      const code = value("code");
      const from = value("from");
      const to = value("to");
      const carrier = [airline, code].filter(Boolean).join(" ");
      const route = from || to ? `${from ?? "—"} → ${to ?? "—"}` : "";
      return [carrier, route].filter(Boolean).join(" · ") || "Flight request";
    }
    case "hotel": return [value("name", "hotel"), value("city")].filter(Boolean).join(" · ") || "Hotel request";
    case "car": return [value("brand"), value("model")].filter(Boolean).join(" ") || "Car rental request";
    case "visa": return [value("country"), value("visaType") ? `${value("visaType")} visa` : undefined].filter(Boolean).join(" · ") || "Visa request";
    case "kakande": return [value("trip"), value("mode")].filter(Boolean).join(" · ") || "Kakande Ministries trip";
    case "package": return value("name", "package") || "Travel package request";
    case "transfer": return [value("pickup"), value("dropoff")].filter(Boolean).join(" → ") || "Transfer request";
    case "insurance": return value("destination") || "Travel insurance request";
    default: return "Travel request";
  }
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-white p-4 shadow-sm"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/5 text-primary">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-semibold text-primary">{value}</p></div></div>; }
function safeDate(value: string) { try { return format(parseISO(value), "dd MMM yyyy"); } catch { return value; } }
function formatMoney(amount: number, currency: string) { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(Number(amount)); } catch { return `${currency || "USD"} ${Number(amount).toLocaleString()}`; } }

export default AccountPage;
