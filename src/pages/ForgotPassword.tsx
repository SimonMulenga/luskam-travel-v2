import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";

const NEUTRAL_CONFIRMATION = "If an account exists for this email, password reset instructions will be sent.";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // Keep the same response for unknown accounts and Auth/provider errors.
    } finally {
      setSubmitted(true);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-16">
        <section className="mx-auto max-w-md rounded-lg bg-card p-8 ring-1 ring-border" aria-labelledby="forgot-password-title">
          <h1 id="forgot-password-title" className="text-2xl font-semibold text-foreground">Forgot password?</h1>
          <p className="mt-2 text-sm text-muted-foreground">Enter the email address you use for your account.</p>
          {submitted ? (
            <p role="status" aria-live="polite" className="mt-6 rounded-xl bg-surface p-4 text-sm text-foreground">{NEUTRAL_CONFIRMATION}</p>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <label htmlFor="recovery-email" className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</label>
              <input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <button type="submit" disabled={busy} className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Please wait..." : "Send reset instructions"}</button>
            </form>
          )}
          <Link to="/auth" className="mt-6 block text-center text-sm font-medium text-primary hover:underline">Back to sign in</Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
