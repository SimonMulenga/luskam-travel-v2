import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const schema = z.string().trim().email().max(255);

export const NewsletterSignup = () => {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(email);
    if (!parsed.success) return toast.error("Please enter a valid email address");
    setBusy(true);
    const { error } = await supabase.from("newsletter_subscribers").insert({ email: parsed.data.toLowerCase() });
    setBusy(false);
    if (error && error.code !== "23505") return toast.error("Could not subscribe. Please try again.");
    toast.success("Thanks for subscribing!");
    setEmail("");
  };

  return (
    <form onSubmit={submit} className="mt-3 flex max-w-sm gap-2">
      <label className="sr-only" htmlFor="newsletter-email">Email address</label>
      <input id="newsletter-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email"
        className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-sm text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-white/70" />
      <button disabled={busy} className="min-h-11 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-sky-50 disabled:opacity-50">
        {busy ? "…" : "Subscribe"}
      </button>
    </form>
  );
};
