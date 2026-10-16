import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Plane, Bus, Phone, CheckCircle2, FileCheck, Syringe, Activity } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { createBooking, generateReference } from "@/lib/bookings";
import temple from "@/assets/kakande-temple.jpg";
import team from "@/assets/kakande-team.jpg";

interface MonthlyTrip {
  id: string;
  month: string;
  flightDate: string;
  roadDate: string;
  priceFlight: number;
  priceRoad: number;
  status: "Open" | "Filling fast" | "Closed";
}

const TRIPS: MonthlyTrip[] = [
  { id: "jun-2026", month: "June 2026", flightDate: "10 June 2026", roadDate: "8 June 2026", priceFlight: 10950, priceRoad: 4500, status: "Open" },
  { id: "jul-2026", month: "July 2026", flightDate: "10 July 2026", roadDate: "8 July 2026", priceFlight: 11200, priceRoad: 4700, status: "Open" },
  { id: "aug-2026", month: "August 2026", flightDate: "10 August 2026", roadDate: "8 August 2026", priceFlight: 11200, priceRoad: 4700, status: "Filling fast" },
  { id: "sep-2026", month: "September 2026", flightDate: "10 September 2026", roadDate: "8 September 2026", priceFlight: 11500, priceRoad: 4900, status: "Open" },
];

const requirements = [
  { icon: FileCheck, title: "Passport", body: "Valid for at least 6 months beyond your travel date." },
  { icon: Syringe, title: "Yellow Fever booklet", body: "Valid Yellow Fever vaccination certificate (Yellow Card)." },
  { icon: Activity, title: "Vitals", body: "Recent results for Blood Pressure, HIV and Sugar tests." },
];

const WHATSAPP_NUMBERS = [
  { label: "773 918 145", number: "260773918145" },
  { label: "976 652 877", number: "260976652877" },
];

const whatsappLink = (number: string, message: string) =>
  `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

const schema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(80),
  phone: z.string().trim().min(7, "Enter a valid phone number").max(20),
  email: z.string().trim().email("Enter a valid email").max(120),
  passport: z.string().trim().max(30).optional().or(z.literal("")),
  travellers: z.string().min(1),
  tripId: z.string().min(1),
  mode: z.enum(["flight", "road"]),
  notes: z.string().max(400).optional().or(z.literal("")),
});

const Kakande = () => {
  const [tripId, setTripId] = useState<string>(TRIPS[0].id);
  const [mode, setMode] = useState<"flight" | "road">("flight");
  const [travellers, setTravellers] = useState<string>("1");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [waMessage, setWaMessage] = useState<string>("");
  const navigate = useNavigate();

  const trip = useMemo(() => TRIPS.find((t) => t.id === tripId)!, [tripId]);
  const pricePer = mode === "flight" ? trip.priceFlight : trip.priceRoad;
  const total = pricePer * Number(travellers || 1);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      fullName: String(fd.get("fullName") || ""),
      phone: String(fd.get("phone") || ""),
      email: String(fd.get("email") || ""),
      passport: String(fd.get("passport") || ""),
      travellers,
      tripId,
      mode,
      notes: String(fd.get("notes") || ""),
    };
    const result = schema.safeParse(data);
    if (!result.success) {
      toast.error(result.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    let ref = generateReference("KM");
    const { data: sess } = await supabase.auth.getSession();
    if (sess.session) {
      try {
        const booking = await createBooking({
          type: "kakande",
          travel_date: null,
          details: { trip: trip.month, mode, travellers, ...data },
        });
        ref = booking.reference;
      } catch {
        // continue to WhatsApp even if saving fails
      }
    }
    setWaMessage(
      [
        `*New Kakande Ministries Reservation* (Ref: ${ref})`,
        "",
        `Trip: ${trip.month}`,
        `Travel mode: ${data.mode === "flight" ? `By flight · ${trip.flightDate}` : `By road · ${trip.roadDate}`}`,
        `Travellers: ${data.travellers}`,
        `Total (estimate): K${total.toLocaleString()} ZMW`,
        "",
        `Name: ${data.fullName}`,
        `Phone: ${data.phone}`,
        `Email: ${data.email}`,
        data.passport ? `Passport: ${data.passport}` : "",
        data.notes ? `Notes: ${data.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    setSubmitted(ref);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.success("Reservation received. Send it on WhatsApp to confirm.");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        {/* Intro */}
        <section className="border-b border-border bg-surface">
          <div className="container grid grid-cols-1 gap-10 py-10 sm:py-12 lg:grid-cols-2 lg:gap-14 lg:py-16">
            <div className="flex flex-col justify-center">
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-accent">
                Kakande Ministries travel programme
              </p>
              <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-primary sm:text-4xl">
                Monthly group travel to Kakande Ministries
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
                Luskam Travel Agents coordinates monthly group travel to The Kakande Ministries —
                The Temple Mount, Church of All Nations. Book by flight or by road; we arrange
                transfers, accommodation and group documentation.
              </p>
              <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-border/70 bg-white p-4">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Bookings</dt>
                  <dd className="mt-1 font-semibold text-foreground">+260 773 918 245</dd>
                </div>
                <div className="rounded-2xl border border-border/70 bg-white p-4">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Alternate</dt>
                  <dd className="mt-1 font-semibold text-foreground">+260 979 450 446</dd>
                </div>
              </dl>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <img src={temple} alt="The Temple Mount, Church of All Nations" loading="lazy" decoding="async" className="aspect-[3/4] w-full rounded-3xl object-cover shadow-sm" />
              <img src={team} alt="Kakande Ministries pilgrim group" loading="lazy" decoding="async" className="aspect-[3/4] w-full rounded-3xl object-cover shadow-sm" />
            </div>
          </div>
        </section>

        {/* Trips + Booking */}
        <section className="border-b border-border bg-background py-14">
          <div className="container grid grid-cols-1 gap-10 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <h2 className="text-xl font-semibold text-primary">Upcoming monthly trips</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Pick a month, then complete the reservation form. Prices are per traveller in Zambian Kwacha.
              </p>
              <div className="mt-5 space-y-3">
                {TRIPS.map((t) => {
                  const active = t.id === tripId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTripId(t.id)}
                      aria-pressed={active}
                      className={`flex w-full flex-col rounded-2xl border p-4 text-left transition duration-200 ${
                        active ? "border-primary bg-primary/5 shadow-sm" : "border-border/70 bg-white hover:border-primary/40 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-base font-semibold text-foreground">{t.month}</span>
                        <span className="text-xs text-muted-foreground">{t.status}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Plane className="h-4 w-4 text-primary" />
                          <div>
                            <div className="font-medium text-foreground">K{t.priceFlight.toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground">{t.flightDate}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Bus className="h-4 w-4 text-primary" />
                          <div>
                            <div className="font-medium text-foreground">K{t.priceRoad.toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground">{t.roadDate}</div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-3">
              {submitted ? (
                <div className="rounded-3xl border border-border/70 bg-white p-6 text-center shadow-sm sm:p-8">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-accent" />
                  <h3 className="mt-4 text-xl font-semibold text-primary">Travel request received</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Your reference is <span className="font-semibold text-foreground">{submitted}</span>. A
                    Luskam agent will call you on the number you provided to review availability and pricing. This request does not reserve a place. Wait for a confirmed quotation and verified payment instructions before paying.
                  </p>
                  <div className="mt-6 rounded-2xl border border-border/70 bg-background p-4 text-left">
                    <div className="text-sm font-semibold text-foreground">Share your request on WhatsApp</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Tap a number below to open WhatsApp with your reservation details prefilled, then press send.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      {WHATSAPP_NUMBERS.map((n) => (
                        <a
                          key={n.number}
                          href={whatsappLink(n.number, waMessage)}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#25D366] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#1ebe5d]"
                        >
                          WhatsApp {n.label}
                        </a>
                      ))}
                    </div>
                  </div>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <a
                      href="tel:+260773918245"
                      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                    >
                      <Phone className="h-4 w-4" /> Call bookings
                    </a>
                    <button
                      type="button"
                      onClick={() => setSubmitted(null)}
                      className="min-h-11 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                    >
                      Book another trip
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="rounded-3xl border border-border/70 bg-white p-5 shadow-sm sm:p-6">
                  <h3 className="text-lg font-semibold text-primary">Reservation details</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Selected: <span className="font-medium text-foreground">{trip.month}</span> ·
                    <span className="font-medium text-foreground"> {mode === "flight" ? trip.flightDate : trip.roadDate}</span>
                  </p>

                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label>Travel mode</Label>
                      <RadioGroup
                        value={mode}
                        onValueChange={(v) => setMode(v as "flight" | "road")}
                        className="mt-2 grid grid-cols-2 gap-3"
                      >
                        <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${mode === "flight" ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/40"}`}>
                          <RadioGroupItem value="flight" id="m-flight" />
                          <Plane className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">By flight · K{trip.priceFlight.toLocaleString()}</span>
                        </label>
                        <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${mode === "road" ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/40"}`}>
                          <RadioGroupItem value="road" id="m-road" />
                          <Bus className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">By road · K{trip.priceRoad.toLocaleString()}</span>
                        </label>
                      </RadioGroup>
                    </div>

                    <div>
                      <Label htmlFor="fullName">Full name</Label>
                      <Input id="fullName" name="fullName" required maxLength={80} placeholder="As shown on passport" />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone number</Label>
                      <Input id="phone" name="phone" required maxLength={20} placeholder="+260…" />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" name="email" type="email" required maxLength={120} placeholder="you@example.com" />
                    </div>
                    <div>
                      <Label htmlFor="passport">Passport number (optional)</Label>
                      <Input id="passport" name="passport" maxLength={30} placeholder="If available" />
                    </div>
                    <div>
                      <Label>Travellers</Label>
                      <Select value={travellers} onValueChange={setTravellers}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Total (estimate)</Label>
                      <div className="mt-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground">
                        K{total.toLocaleString()} ZMW
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="notes">Notes (optional)</Label>
                      <Textarea id="notes" name="notes" maxLength={400} placeholder="Dietary needs, room preferences, accessibility…" />
                    </div>
                  </div>

                    <Button type="submit" className="mt-6 min-h-12 w-full rounded-full bg-accent text-accent-foreground transition hover:bg-[hsl(var(--accent-hover))]">
                    Send trip request
                  </Button>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Submitting sends an inquiry only and does not reserve a place. The team will confirm availability, any applicable price, and required documents before discussing payment.
                  </p>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* Requirements */}
        <section className="bg-surface py-14">
          <div className="container">
            <h2 className="text-xl font-semibold text-primary">Travel requirements</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Please ensure you have the following ready before your departure date.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              {requirements.map((r, i) => {
                const Icon = r.icon;
                return (
                  <div key={r.title} className="rounded-2xl border border-border/70 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                        {i + 1}
                      </span>
                      <Icon className="h-5 w-5 text-primary" />
                      <h3 className="text-base font-semibold text-foreground">{r.title}</h3>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">{r.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Kakande;
