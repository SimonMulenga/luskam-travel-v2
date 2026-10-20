import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { PasswordField } from "@/components/auth/PasswordField";
import { isPasswordValid } from "@/lib/passwordPolicy";

const AuthPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = new URLSearchParams(location.search).get("next") || "/account";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const signupPasswordReady = isPasswordValid(password) && password === confirmPassword;

  const showRegistrationNotice = () => toast.info(
    "If registration can be completed, we'll send next steps to this email. If you already have an account, sign in.",
  );

  useEffect(() => {
    if (location.state?.passwordReset) toast.success("Password changed. Sign in with your new password.");
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate(redirectTo, { replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate(redirectTo, { replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, redirectTo, location.state]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && !signupPasswordReady) return;
    setBusy(true);
    const submittedMode = mode;
    try {
      if (submittedMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName, phone },
          },
        });
        // Keep signup feedback neutral whether Auth accepted, suppressed, or
        // rejected an address. In particular, don't claim a session exists
        // when email confirmation is required, or reveal account existence.
        if (!error && data.user && data.session) {
          toast.success("Account created and signed in.");
          navigate(redirectTo, { replace: true });
        } else showRegistrationNotice();
      } else {
        const { data } = await supabase.auth.signInWithPassword({ email, password });
        if (!data.session) {
          toast.error("Invalid email or password. Please check your credentials and try again.");
        }
      }
    } catch {
      if (submittedMode === "signup") showRegistrationNotice();
      else toast.error("Invalid email or password. Please check your credentials and try again.");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) toast.error("Google sign-in failed");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-16">
        <div className="mx-auto max-w-md rounded-lg bg-card p-8 ring-1 ring-border">
          <h1 className="text-2xl font-semibold text-foreground">
            {mode === "signin" ? "Sign in to your account" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage bookings, quotations and travel documents in one place.
          </p>

          <button
            disabled={busy}
            onClick={google}
            className="mt-6 w-full rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <>
                <Field label="Full name" value={fullName} onChange={setFullName} required />
                <Field label="Phone" type="tel" value={phone} onChange={setPhone} />
              </>
            )}
            <Field label="Email" type="email" value={email} onChange={setEmail} required />
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              showRequirements={mode === "signup"}
            />
            {mode === "signup" && (
              <>
                <PasswordField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs font-medium text-destructive" role="alert">Passwords do not match.</p>
                )}
              </>
            )}
            <button
              disabled={busy || (mode === "signup" && !signupPasswordReady)}
              className="mt-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-[hsl(var(--primary-hover))] disabled:opacity-60"
            >
              {busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>New to Luskam? <button disabled={busy} onClick={() => setMode("signup")} className="font-medium text-primary hover:underline disabled:opacity-60">Create an account</button></>
            ) : (
              <>Already have an account? <button disabled={busy} onClick={() => setMode("signin")} className="font-medium text-primary hover:underline disabled:opacity-60">Sign in</button></>
            )}
          </div>

          {mode === "signin" && (
            <Link to="/forgot-password" className="mt-3 block text-center text-sm font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          )}

          <Link to="/" className="mt-6 block text-center text-xs text-muted-foreground hover:text-primary">Back to home</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
};

const Field = ({ label, type = "text", value, onChange, required }: { label: string; type?: string; value: string; onChange: (v: string) => void; required?: boolean }) => {
  const id = `auth-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
};

export default AuthPage;
