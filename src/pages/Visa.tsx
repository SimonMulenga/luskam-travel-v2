import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createBooking, generateReference } from "@/lib/bookings";

const COUNTRIES = [
  "United Arab Emirates", "United Kingdom", "United States", "Schengen Area", "China",
  "South Africa", "Kenya", "India", "Turkey", "Canada", "Australia", "Qatar",
];

const VISA_TYPES = ["Tourist", "Business", "Transit", "Student", "Work"];

const WHATSAPP_NUMBERS = [
  { label: "773 918 145", number: "260773918145" },
  { label: "976 652 877", number: "260976652877" },
];

const buildWhatsappMessage = (ref: string, form: Record<string, string>) =>
  [
    `*New Visa Application* (Ref: ${ref})`,
    "",
    `Destination: ${form.country}`,
    `Visa type: ${form.visaType}`,
    `Travel date: ${form.travelDate}`,
    `Duration: ${form.duration} days`,
    "",
    `Name: ${form.firstName} ${form.lastName}`,
    `Date of birth: ${form.dob}`,
    `Nationality: ${form.nationality}`,
    `Passport: ${form.passport} (expires ${form.passportExpiry})`,
    "",
    `Email: ${form.email}`,
    `Phone: ${form.phone}`,
    form.address ? `Address: ${form.address}` : "",
    form.notes ? `Notes: ${form.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

const whatsappLink = (number: string, message: string) =>
  `https://wa.me/${number}?text=${encodeURIComponent(message)}`;


const VisaPage = () => {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [form, setForm] = useState({
    country: "United Arab Emirates",
    visaType: "Tourist",
    travelDate: "",
    duration: "30",
    firstName: "",
    lastName: "",
    dob: "",
    nationality: "",
    passport: "",
    passportExpiry: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const required = ["travelDate", "firstName", "lastName", "dob", "nationality", "passport", "passportExpiry", "email", "phone"];
    if (required.some((k) => !(form as Record<string, string>)[k])) {
      toast.error("Please complete all required fields");
      return;
    }
    try {
      let ref = generateReference("VA");
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session) {
        try {
          const booking = await createBooking({
            type: "visa",
            travel_date: form.travelDate,
            details: { ...form },
          });
          ref = booking.reference;
        } catch {
          // continue to WhatsApp even if saving fails
        }
      }
      setSubmitted(ref);
      window.scrollTo({ top: 0, behavior: "smooth" });

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit application");
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-16">
          <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-border/70 bg-white shadow-sm">
            <div className="bg-primary p-6 text-white sm:p-8">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="h-10 w-10 shrink-0 text-sky-200" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-200">Visa inquiry</p>
                <h1 className="mt-2 text-2xl font-semibold text-white">Your reference is ready</h1>
                <p className="mt-2 text-sm leading-6 text-white/75">Use WhatsApp below to send these details to the team. This form has not filed an application with an embassy or immigration authority.</p>
              </div>
            </div>
            </div>
            <div className="p-6 sm:p-8">
            <div className="rounded-2xl bg-surface p-4 ring-1 ring-border">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Application reference</div>
              <div className="mt-1 font-mono text-xl font-semibold text-primary">{submitted}</div>
            </div>
            <div className="mt-5 rounded-2xl border border-border/70 p-4 sm:p-5">
              <div className="text-sm font-semibold text-foreground">Send your application on WhatsApp</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Tap a number below to open WhatsApp with your application details prefilled, then press send.
              </p>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                {WHATSAPP_NUMBERS.map((n) => (
                  <a
                    key={n.number}
                    href={whatsappLink(n.number, buildWhatsappMessage(submitted, form))}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="min-h-11 flex-1 rounded-full bg-[#25D366] px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-[#1ebe5d]"
                  >
                    WhatsApp {n.label}
                  </a>
                ))}
              </div>
            </div>
            <button onClick={() => navigate("/")} className="mt-6 min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-[hsl(var(--primary-hover))]">Back to home</button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-7xl py-8 sm:py-10">
        <div className="rounded-3xl bg-primary px-6 py-8 text-white sm:px-8 sm:py-10"><p className="text-xs font-semibold uppercase tracking-[.17em] text-sky-200">Visa services</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Request visa guidance</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">Share your travel plans and applicant details so the team can discuss available support. Requirements, fees and timelines depend on the destination and issuing authority.</p></div>
        <div role="note" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Important:</strong> This is an inquiry form. A visa outcome is not guaranteed, and your application is not filed until you complete the official process with the relevant authority.</div>

        <form onSubmit={submit} className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Section title="Trip details" description="Tell us about the destination and intended travel." >
              <Select label="Destination country" value={form.country} onChange={(v) => update("country", v)} options={COUNTRIES} />
              <Select label="Visa type" value={form.visaType} onChange={(v) => update("visaType", v)} options={VISA_TYPES} />
              <Field label="Intended travel date" type="date" value={form.travelDate} onChange={(v) => update("travelDate", v)} required />
              <Field label="Duration of stay (days)" type="number" value={form.duration} onChange={(v) => update("duration", v)} required />
            </Section>

            <Section title="Applicant details" description="Provide the identity details used in your inquiry." >
              <Field label="First name" value={form.firstName} onChange={(v) => update("firstName", v)} required />
              <Field label="Last name" value={form.lastName} onChange={(v) => update("lastName", v)} required />
              <Field label="Date of birth" type="date" value={form.dob} onChange={(v) => update("dob", v)} required />
              <Field label="Nationality" value={form.nationality} onChange={(v) => update("nationality", v)} required />
              <Field label="Passport number" value={form.passport} onChange={(v) => update("passport", v)} required />
              <Field label="Passport expiry" type="date" value={form.passportExpiry} onChange={(v) => update("passportExpiry", v)} required />
            </Section>

            <Section title="Contact & address" description="We use these details to follow up on your inquiry." >
              <Field label="Email" type="email" value={form.email} onChange={(v) => update("email", v)} required />
              <Field label="Phone" type="tel" value={form.phone} onChange={(v) => update("phone", v)} required />
              <div className="sm:col-span-2">
                <label htmlFor="visa-address" className="text-sm font-semibold text-primary">Residential address</label>
                <textarea
                  id="visa-address"
                  rows={3}
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="visa-notes" className="text-sm font-semibold text-primary">Additional notes</label>
                <textarea
                  id="visa-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </Section>
          </div>

          <aside className="self-start rounded-3xl border border-border/70 bg-white p-5 shadow-sm lg:sticky lg:top-24 sm:p-6">
            <h2 className="text-base font-semibold text-primary">Before you continue</h2>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
              <li><span className="font-semibold text-primary">1.</span> Submit this form to prepare an inquiry reference.</li>
              <li><span className="font-semibold text-primary">2.</span> Tap WhatsApp on the next screen and press send to share your details.</li>
              <li><span className="font-semibold text-primary">3.</span> Confirm document requirements, fees and next steps with the team.</li>
              <li><span className="font-semibold text-primary">4.</span> The issuing authority decides the application outcome and timing.</li>
            </ol>
            <button type="submit" className="mt-6 min-h-12 w-full rounded-full bg-accent px-5 text-sm font-semibold text-white hover:bg-[hsl(var(--accent-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              Prepare visa inquiry
            </button>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">No payment is collected through this form. Ask the team to confirm any applicable fees.</p>
          </aside>
        </form>
      </main>
      <Footer />
    </div>
  );
};

const Section = ({ title, description, children }: { title: string; description: string; children: React.ReactNode }) => (
  <section className="rounded-3xl border border-border/70 bg-white p-5 shadow-sm sm:p-6">
    <h2 className="text-base font-semibold text-primary">{title}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
  </section>
);

const Field = ({
  label, type = "text", value, onChange, required,
}: { label: string; type?: string; value: string; onChange: (v: string) => void; required?: boolean }) => {
  const id = `visa-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-primary">{label}{required && " *"}</label>
      <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className="mt-2 min-h-11 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
    </div>
  );
};

const Select = ({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: string[] }) => {
  const id = `visa-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-primary">{label}</label>
      <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-2 min-h-11 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
};

export default VisaPage;
