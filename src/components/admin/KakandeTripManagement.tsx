import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays, Loader2, Plus, RefreshCw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Availability = "open" | "filling_fast" | "fully_booked" | "closed";
type TripOption = {
  option_id: string;
  transport_mode: "flight" | "road";
  departure_date: string;
  price_per_traveller_zmw: number;
  is_published: boolean;
  availability: Availability;
};
type KakandeTrip = {
  trip_id: string;
  month_label: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  flight_option: TripOption | null;
  road_option: TripOption | null;
};
type TripDraft = {
  tripId: string | null;
  month: string;
  tripPublished: boolean;
  flightDate: string;
  flightPrice: string;
  flightPublished: boolean;
  flightAvailability: Availability | "";
  roadDate: string;
  roadPrice: string;
  roadPublished: boolean;
  roadAvailability: Availability | "";
};

const availabilityOptions: { value: Availability; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "filling_fast", label: "Filling fast" },
  { value: "fully_booked", label: "Fully booked" },
  { value: "closed", label: "Closed" },
];
const blankDraft = (): TripDraft => ({
  tripId: null,
  month: "",
  tripPublished: false,
  flightDate: "",
  flightPrice: "",
  flightPublished: false,
  flightAvailability: "",
  roadDate: "",
  roadPrice: "",
  roadPublished: false,
  roadAvailability: "",
});
const todayIso = () => format(new Date(), "yyyy-MM-dd");
const monthValueFromLabel = (label: string) => {
  const monthPart = label.trim().split(" | ", 1)[0];
  const match = monthPart.match(/^([A-Za-z]+) (\d{4})$/);
  if (!match) return "";
  const parsed = new Date(`${match[1]} 1, ${match[2]}`);
  return Number.isNaN(parsed.getTime()) ? "" : format(parsed, "yyyy-MM");
};
const monthLabelFromValue = (month: string) => format(parseISO(`${month}-01`), "MMMM yyyy");
const displayMonthLabel = (label: string) => {
  const month = monthValueFromLabel(label);
  return month ? monthLabelFromValue(month) : label;
};
const parseMonthLabel = (label: string) => monthValueFromLabel(label);
const tripIdForMonth = (month: string) => month;

const fieldClass = "mt-1.5 min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-slate-50 disabled:text-muted-foreground";

export const KakandeTripManagement = () => {
  const [trips, setTrips] = useState<KakandeTrip[]>([]);
  const [draft, setDraft] = useState<TripDraft>(blankDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [filterMonth, setFilterMonth] = useState("");

  const loadTrips = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase.rpc("list_kakande_monthly_trips");
    if (error || !data) {
      setTrips([]);
      setLoadError(true);
    } else {
      setTrips(data as KakandeTrip[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadTrips(); }, [loadTrips]);

  const historicalIds = useMemo(() => new Set(trips.filter((trip) =>
    [trip.flight_option?.departure_date, trip.road_option?.departure_date]
      .some((date) => Boolean(date) && date! <= todayIso()),
  ).map((trip) => trip.trip_id)), [trips]);
  const availableMonths = useMemo(() => [...new Set(trips.map((trip) => monthValueFromLabel(trip.month_label)).filter(Boolean))].sort(), [trips]);
  const filteredTrips = useMemo(() => filterMonth
    ? trips.filter((trip) => monthValueFromLabel(trip.month_label) === filterMonth)
    : trips, [filterMonth, trips]);

  const updateDraft = <K extends keyof TripDraft>(key: K, value: TripDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFormError("");
    setNotice("");
  };

  const startNew = () => {
    setDraft(blankDraft());
    setFormOpen(true);
    setFormError("");
    setNotice("");
  };

  const startEdit = (trip: KakandeTrip) => {
    if (historicalIds.has(trip.trip_id)) return;
    const parsed = parseMonthLabel(trip.month_label);
    setDraft({
      tripId: trip.trip_id,
      month: parsed,
      tripPublished: trip.is_published,
      flightDate: trip.flight_option?.departure_date ?? "",
      flightPrice: trip.flight_option ? String(trip.flight_option.price_per_traveller_zmw) : "",
      flightPublished: trip.flight_option?.is_published ?? false,
      flightAvailability: trip.flight_option?.availability ?? "",
      roadDate: trip.road_option?.departure_date ?? "",
      roadPrice: trip.road_option ? String(trip.road_option.price_per_traveller_zmw) : "",
      roadPublished: trip.road_option?.is_published ?? false,
      roadAvailability: trip.road_option?.availability ?? "",
    });
    setFormOpen(true);
    setFormError("");
    setNotice("");
  };

  const validate = () => {
    const monthDate = draft.month ? parseISO(`${draft.month}-01`) : null;
    if (!draft.month || !monthDate || Number.isNaN(monthDate.getTime())) return "Enter a trip month and year.";
    if (draft.month < todayIso().slice(0, 7)) return "Choose the current or a future trip month.";
    const monthName = monthLabelFromValue(draft.month);
    if (monthName.length < 1 || monthName.length > 40) return "The trip month and year do not fit the database label limit.";
    if (!draft.flightDate || !draft.roadDate || !draft.flightAvailability || !draft.roadAvailability) return "Enter both departure dates and select availability for both travel options.";
    if (draft.flightDate <= todayIso() || draft.roadDate <= todayIso()) return "Both departure dates must be in the future.";
    if ((draft.flightPublished || draft.roadPublished) && !draft.tripPublished) return "Publish the trip before publishing either travel option.";
    for (const [name, raw] of [["Flight", draft.flightPrice], ["Road", draft.roadPrice]] as const) {
      const amount = Number(raw);
      if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isFinite(amount) || amount <= 0 || amount >= 10_000_000_000) {
        return `${name} price must be greater than zero and have no more than two decimal places.`;
      }
    }
    return "";
  };

  const save = async (asDraft: boolean) => {
    const validationMessage = validate();
    if (validationMessage) {
      setFormError(validationMessage);
      setNotice("");
      return;
    }

    const published = asDraft ? false : draft.tripPublished;
    const flightPublished = asDraft ? false : draft.flightPublished;
    const roadPublished = asDraft ? false : draft.roadPublished;
    if (published || flightPublished || roadPublished) {
      const confirmed = window.confirm("Publish the selected Kakande trip and options? Published information may appear on the public website.");
      if (!confirmed) return;
    }

    const monthDate = parseISO(`${draft.month}-01`);
    const monthLabel = monthLabelFromValue(draft.month);
    const tripId = draft.tripId ?? tripIdForMonth(draft.month);
    if (!tripId) {
      setFormError("Enter a valid trip month and year.");
      return;
    }
    if (!draft.tripId && trips.some((trip) => trip.trip_id === tripId || monthValueFromLabel(trip.month_label) === draft.month)) {
      setFormError("A trip already exists for this month. Edit the existing trip instead.");
      return;
    }

    setSaving(true);
    setFormError("");
    setNotice("");
    const { error } = await supabase.rpc("save_kakande_monthly_trip", {
      p_trip_id: tripId,
      p_month_label: monthLabel,
      p_trip_published: published,
      p_flight_date: draft.flightDate,
      p_flight_price_zmw: Number(draft.flightPrice),
      p_flight_published: flightPublished,
      p_flight_availability: draft.flightAvailability as Availability,
      p_road_date: draft.roadDate,
      p_road_price_zmw: Number(draft.roadPrice),
      p_road_published: roadPublished,
      p_road_availability: draft.roadAvailability as Availability,
    });
    setSaving(false);
    if (error) {
      setFormError("The trip could not be saved. Verify administrator access and the trip details, then try again.");
      return;
    }
    setNotice(asDraft ? "Trip saved as an unpublished draft." : "Trip configuration saved.");
    await loadTrips();
    setDraft(blankDraft());
    setFormOpen(false);
  };

  return (
    <section aria-labelledby="kakande-trip-management-heading" className="border-t border-border/70 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.15em] text-accent">Administrator tools</p>
          <h2 id="kakande-trip-management-heading" className="mt-1 text-xl font-semibold text-primary">Manage trips</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Configure road and flight options separately. New trips start unpublished; prices and availability are entered by an administrator.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void loadTrips()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-primary hover:bg-surface disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh trips
          </button>
          <button type="button" onClick={startNew} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90">
            <Plus className="h-4 w-4" aria-hidden="true" /> New trip
          </button>
        </div>
      </div>

      {loading ? <p className="py-7 text-sm text-muted-foreground" role="status">Loading trip configurations…</p> : loadError ? (
        <div className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800" role="alert">Trip configurations could not be loaded. Check administrator access or try again.</div>
      ) : trips.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">No trips are configured. Create a trip only after its dates, prices and availability have been approved.</p>
      ) : (
        <div className="mt-4">
          <label className="block max-w-xs text-sm font-medium text-primary">Filter by month and year<select aria-label="Filter trips by month" value={filterMonth} onChange={(event) => setFilterMonth(event.target.value)} className={fieldClass}><option value="">All months</option>{availableMonths.map((month) => <option key={month} value={month}>{monthLabelFromValue(month)}</option>)}</select></label>
          {filteredTrips.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground">No trip is configured for {monthLabelFromValue(filterMonth)}.</p> : <div className="mt-3 grid gap-3">
          {filteredTrips.map((trip) => {
            const locked = historicalIds.has(trip.trip_id);
            return <article key={trip.trip_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 p-4">
              <div className="min-w-0">
                <h3 className="break-words font-semibold text-primary">Kakande Ministries — {displayMonthLabel(trip.month_label)}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{trip.is_published ? "Published" : "Draft / unpublished"}{locked ? " · Historical configuration locked" : ""}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Flight: {trip.flight_option ? `${trip.flight_option.departure_date} · ZMW ${Number(trip.flight_option.price_per_traveller_zmw).toFixed(2)} · ${trip.flight_option.availability.replace("_", " ")}` : "Not configured"}
                  <span className="mx-2" aria-hidden="true">|</span>
                  Road: {trip.road_option ? `${trip.road_option.departure_date} · ZMW ${Number(trip.road_option.price_per_traveller_zmw).toFixed(2)} · ${trip.road_option.availability.replace("_", " ")}` : "Not configured"}
                </p>
              </div>
              <button type="button" onClick={() => startEdit(trip)} disabled={locked} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50">
                <CalendarDays className="h-4 w-4" aria-hidden="true" /> {locked ? "Historical" : "Edit"}
              </button>
            </article>;
          })}
          </div>}
        </div>
      )}

      {formOpen && <form className="mt-5 rounded-2xl border border-border/70 bg-slate-50/70 p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); void save(false); }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="font-semibold text-primary">{draft.month ? `Kakande Ministries — ${format(parseISO(`${draft.month}-01`), "MMMM yyyy")}` : "New monthly trip"}</h3><p className="mt-1 text-xs text-muted-foreground">Trip labels use the month and year only. Road and flight options are configured separately.</p></div>
          <button type="button" onClick={() => { setDraft(blankDraft()); setFormError(""); setNotice(""); }} className="text-sm font-semibold text-muted-foreground underline">Clear form</button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-primary">Trip month and year<input aria-label="Trip month and year" type="month" required value={draft.month} onChange={(event) => updateDraft("month", event.target.value)} className={fieldClass} /></label>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {(["flight", "road"] as const).map((mode) => {
            const isFlight = mode === "flight";
            const dateKey = isFlight ? "flightDate" : "roadDate";
            const priceKey = isFlight ? "flightPrice" : "roadPrice";
            const publishedKey = isFlight ? "flightPublished" : "roadPublished";
            const availabilityKey = isFlight ? "flightAvailability" : "roadAvailability";
            return <fieldset key={mode} className="min-w-0 rounded-xl border border-border bg-white p-4">
              <legend className="px-1 font-semibold capitalize text-primary">{mode} option</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-primary">Departure date<input aria-label={`${mode} departure date`} type="date" min={todayIso()} required value={draft[dateKey]} onChange={(event) => updateDraft(dateKey, event.target.value)} className={fieldClass} /></label>
                <label className="text-sm font-medium text-primary">Price per traveller (ZMW)<input aria-label={`${mode} price`} type="number" min="0.01" max="9999999999.99" step="0.01" required value={draft[priceKey]} onChange={(event) => updateDraft(priceKey, event.target.value)} className={fieldClass} /></label>
                <label className="text-sm font-medium text-primary">Availability<select aria-label={`${mode} availability`} required value={draft[availabilityKey]} onChange={(event) => updateDraft(availabilityKey, event.target.value as Availability | "")} className={fieldClass}><option value="">Select availability</option>{availabilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="flex min-h-11 items-center gap-2 self-end text-sm font-medium text-primary"><input type="checkbox" checked={draft[publishedKey]} onChange={(event) => updateDraft(publishedKey, event.target.checked)} className="h-4 w-4 accent-primary" /> Publish {mode} option</label>
              </div>
            </fieldset>;
          })}
        </div>

        <label className="mt-4 flex min-h-11 items-center gap-2 text-sm font-medium text-primary"><input type="checkbox" checked={draft.tripPublished} onChange={(event) => updateDraft("tripPublished", event.target.checked)} className="h-4 w-4 accent-primary" /> Publish trip</label>
        {formError && <p className="mt-3 text-sm text-rose-800" role="alert">{formError}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />} Save configuration</button>
          <button type="button" disabled={saving} onClick={() => void save(true)} className="inline-flex min-h-10 items-center rounded-full border border-border px-4 text-sm font-semibold text-primary disabled:opacity-50">Save as unpublished draft</button>
        </div>
      </form>}
      {notice && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p>}
    </section>
  );
};
