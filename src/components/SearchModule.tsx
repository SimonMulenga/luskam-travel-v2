import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plane, Hotel, Car, ArrowLeftRight, Search, MapPin } from "lucide-react";
import { addDays, format, isBefore, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { AirportSelect } from "./search/AirportSelect";
import { DateField } from "./search/DateField";
import { PassengerSelect, type PaxState } from "./search/PassengerSelect";
import { TimeField } from "./search/TimeField";

type Tab = "flights" | "hotels" | "cars";
const tabs: { id: Tab; label: string; icon: typeof Plane }[] = [
  { id: "flights", label: "Flights", icon: Plane },
  { id: "hotels", label: "Hotels", icon: Hotel },
  { id: "cars", label: "Car Rentals", icon: Car },
];

const fmt = (d?: Date) => (d ? format(d, "yyyy-MM-dd") : "");

export const SearchModule = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("flights");
  const [tripType, setTripType] = useState<"return" | "oneway">("return");
  const [flightErrors, setFlightErrors] = useState<Partial<Record<"from" | "to" | "depart" | "ret", string>>>({});

  // Flights
  const [from, setFrom] = useState("LUN");
  const [to, setTo] = useState("JNB");
  const [depart, setDepart] = useState<Date | undefined>(addDays(new Date(), 14));
  const [ret, setRet] = useState<Date | undefined>(addDays(new Date(), 21));
  const [pax, setPax] = useState<PaxState>({ adults: 1, children: 0, infants: 0, cabin: "Economy" });

  // Hotels
  const [hotelDest, setHotelDest] = useState("Cape Town, South Africa");
  const [checkIn, setCheckIn] = useState<Date | undefined>(addDays(new Date(), 14));
  const [checkOut, setCheckOut] = useState<Date | undefined>(addDays(new Date(), 18));
  const [rooms, setRooms] = useState(1);
  const [hotelPax, setHotelPax] = useState<PaxState>({ adults: 2, children: 0, infants: 0, cabin: "Economy" });

  // Cars
  const [pickup, setPickup] = useState("Kenneth Kaunda Intl Airport (LUN)");
  const [dropoffLoc, setDropoffLoc] = useState("");
  const [diffDrop, setDiffDrop] = useState(false);
  const [pickupDate, setPickupDate] = useState<Date | undefined>(addDays(new Date(), 7));
  const [dropoffDate, setDropoffDate] = useState<Date | undefined>(addDays(new Date(), 10));
  const [pickupTime, setPickupTime] = useState("10:00");
  const [dropoffTime, setDropoffTime] = useState("10:00");
  const [driverAge, setDriverAge] = useState(true);

  const swap = () => {
    const a = from;
    setFrom(to);
    setTo(a);
  };

  const submit = () => {
    if (tab === "flights") {
      const errors: typeof flightErrors = {};
      if (!from) errors.from = "Choose a departure airport.";
      if (!to) errors.to = "Choose a destination airport.";
      if (from && to && from === to) errors.to = "Choose a destination different from your origin.";
      if (!depart) errors.depart = "Choose a departure date.";
      else if (isBefore(startOfDay(depart), startOfDay(new Date()))) errors.depart = "Departure date must be today or later.";
      if (tripType === "return" && !ret) errors.ret = "Choose a return date, or select one way.";
      else if (tripType === "return" && depart && ret && isBefore(startOfDay(ret), startOfDay(depart))) {
        errors.ret = "Return date must be on or after departure.";
      }
      setFlightErrors(errors);
      if (Object.keys(errors).length) return;

      const params = new URLSearchParams({
        from, to,
        depart: fmt(depart),
        ret: tripType === "return" ? fmt(ret) : "",
        adults: String(pax.adults),
        children: String(pax.children),
        infants: String(pax.infants),
        cabin: pax.cabin,
        trip: tripType,
      });
      navigate(`/flights?${params.toString()}`);
    } else if (tab === "hotels") {
      const params = new URLSearchParams({
        dest: hotelDest,
        in: fmt(checkIn),
        out: fmt(checkOut),
        adults: String(hotelPax.adults),
        children: String(hotelPax.children),
        rooms: String(rooms),
      });
      navigate(`/hotels?${params.toString()}`);
    } else {
      const params = new URLSearchParams({
        pickup,
        dropoff: diffDrop ? dropoffLoc : pickup,
        pdate: fmt(pickupDate),
        ddate: fmt(dropoffDate),
        ptime: pickupTime,
        dtime: dropoffTime,
        age: driverAge ? "1" : "0",
      });
      navigate(`/cars?${params.toString()}`);
    }
  };

  return (
    <section className="w-full">
      <div className="overflow-hidden rounded-2xl bg-card shadow-[0_24px_70px_-26px_rgba(3,22,48,.4)] ring-1 ring-black/[.04] sm:rounded-3xl">
        <div role="tablist" aria-label="Choose a travel service" className="flex overflow-x-auto border-b border-border bg-surface/80 px-2 sm:px-4">
          {tabs.map((t) => {
            const active = t.id === tab;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative flex min-h-[58px] items-center gap-2 whitespace-nowrap px-4 text-sm font-semibold transition-colors sm:px-6",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                {active && <span className="absolute inset-x-3 -bottom-px h-0.5 bg-primary" />}
              </button>
            );
          })}
        </div>

        <div className="p-4 sm:p-6 lg:p-7">
          {tab === "flights" && (
            <>
              <fieldset className="mb-4">
                <legend className="sr-only">Trip type</legend>
                <div className="flex flex-wrap gap-1 text-sm">
                {([["return", "Round trip"], ["oneway", "One way"]] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={tripType === id}
                    onClick={() => {
                      setTripType(id);
                      setFlightErrors((current) => ({ ...current, ret: undefined }));
                    }}
                    className={cn(
                      "min-h-10 rounded-full px-4 py-2 font-semibold transition-colors",
                      tripType === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {label}
                  </button>
                ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                <div className="relative md:col-span-3">
                  <AirportSelect label="From" value={from} error={flightErrors.from} onChange={(value) => {
                    setFrom(value);
                    setFlightErrors((current) => ({ ...current, from: undefined }));
                  }} />
                </div>
                <div className="hidden items-end justify-center md:col-span-1 md:flex">
                  <button
                    onClick={swap}
                    className="mb-2 rounded-full border border-border bg-background p-2.5 text-muted-foreground shadow-sm transition-all hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Swap"
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="md:col-span-3">
                    <AirportSelect label="To" value={to} error={flightErrors.to} onChange={(value) => {
                      setTo(value);
                      setFlightErrors((current) => ({ ...current, to: undefined }));
                    }} />
                </div>
                <div className="md:col-span-2">
                  <DateField label="Departure" value={depart} error={flightErrors.depart} onChange={(value) => {
                    setDepart(value);
                    setFlightErrors((current) => ({ ...current, depart: undefined, ret: undefined }));
                  }} />
                </div>
                <div className="md:col-span-2">
                  <DateField
                    label="Return"
                    value={ret}
                    onChange={(value) => {
                      setRet(value);
                      setFlightErrors((current) => ({ ...current, ret: undefined }));
                    }}
                    minDate={depart}
                    disabled={tripType === "oneway"}
                    error={flightErrors.ret}
                  />
                </div>
                <div className="md:col-span-12">
                  <PassengerSelect value={pax} onChange={setPax} />
                </div>
              </div>
            </>
          )}

          {tab === "hotels" && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-5">
                <label className="block min-h-[76px] rounded-xl bg-surface px-3.5 py-3 ring-1 ring-border transition-all hover:bg-white hover:shadow-sm focus-within:ring-2 focus-within:ring-ring">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Destination</span>
                  <div className="mt-1 flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                      value={hotelDest}
                      onChange={(e) => setHotelDest(e.target.value)}
                      placeholder="City, hotel, area"
                      className="w-full bg-transparent text-sm font-semibold text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
                    />
                  </div>
                </label>
              </div>
              <div className="md:col-span-2">
                <DateField label="Check-in" value={checkIn} onChange={setCheckIn} />
              </div>
              <div className="md:col-span-2">
                <DateField label="Check-out" value={checkOut} onChange={setCheckOut} minDate={checkIn} />
              </div>
              <div className="md:col-span-3">
                <PassengerSelect
                  label="Guests & rooms"
                  value={hotelPax}
                  onChange={setHotelPax}
                  showCabin={false}
                />
              </div>
              <div className="md:col-span-3">
                <label className="block min-h-[76px] rounded-xl bg-surface px-3.5 py-3 ring-1 ring-border transition-all hover:bg-white hover:shadow-sm focus-within:ring-2 focus-within:ring-ring">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Rooms</span>
                  <input
                    type="number"
                    min={1}
                    max={9}
                    value={rooms}
                    onChange={(e) => setRooms(Math.max(1, parseInt(e.target.value) || 1))}
                    className="mt-1 w-full bg-transparent text-sm font-semibold text-foreground focus:outline-none"
                  />
                </label>
              </div>
            </div>
          )}

          {tab === "cars" && (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                <div className="md:col-span-12">
                  <label className="block min-h-[76px] rounded-xl bg-surface px-3.5 py-3 ring-1 ring-border transition-all hover:bg-white hover:shadow-sm focus-within:ring-2 focus-within:ring-ring">
                    <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pick-up location</span>
                    <div className="mt-1 flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <input
                        value={pickup}
                        onChange={(e) => setPickup(e.target.value)}
                        placeholder="Airport, city or station"
                        className="w-full bg-transparent text-sm font-semibold text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
                      />
                    </div>
                  </label>
                </div>
                {diffDrop && (
                  <div className="md:col-span-12">
                    <label className="block min-h-[76px] rounded-xl bg-surface px-3.5 py-3 ring-1 ring-border transition-all hover:bg-white hover:shadow-sm focus-within:ring-2 focus-within:ring-ring">
                      <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Drop-off location</span>
                      <div className="mt-1 flex items-center gap-2">
                        <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <input
                          value={dropoffLoc}
                          onChange={(e) => setDropoffLoc(e.target.value)}
                          placeholder="Airport, city or station"
                          className="w-full bg-transparent text-sm font-semibold text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
                        />
                      </div>
                    </label>
                  </div>
                )}
                <div className="md:col-span-4">
                  <DateField label="Pick-up date" value={pickupDate} onChange={setPickupDate} />
                </div>
                <div className="md:col-span-2">
                  <TimeField label="Time" value={pickupTime} onChange={setPickupTime} />
                </div>
                <div className="md:col-span-4">
                  <DateField label="Drop-off date" value={dropoffDate} onChange={setDropoffDate} minDate={pickupDate} />
                </div>
                <div className="md:col-span-2">
                  <TimeField label="Time" value={dropoffTime} onChange={setDropoffTime} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <label className="flex items-center gap-2 text-foreground">
                  <input type="checkbox" checked={diffDrop} onChange={(e) => setDiffDrop(e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
                  Drop car off at different location
                </label>
                <label className="flex items-center gap-2 text-foreground">
                  <input type="checkbox" checked={driverAge} onChange={(e) => setDriverAge(e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
                  Driver aged between 30 – 65?
                </label>
              </div>
            </>
          )}

          <div className="mt-5 flex justify-stretch sm:justify-end">
            <button
              onClick={submit}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-7 py-3 text-sm font-semibold text-accent-foreground shadow-md shadow-accent/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[hsl(var(--accent-hover))] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
            >
              <Search className="h-4 w-4" />
              {tab === "flights" ? "Search Flights" : tab === "hotels" ? "Search Hotels" : "Search Cars"}
            </button>
          </div>
          {tab === "flights" && <p className="mt-3 text-xs leading-5 text-muted-foreground">Flight fares are indicative and subject to availability and confirmation. Sending a request does not reserve a seat or confirm an airline booking. Do not pay until Luskam verifies your quotation and sends payment instructions.</p>}
        </div>
      </div>
    </section>
  );
};
