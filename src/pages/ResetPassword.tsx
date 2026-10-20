import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PasswordField } from "@/components/auth/PasswordField";
import { supabase } from "@/integrations/supabase/client";
import { clearValidatedPasswordRecoverySession, handlePasswordRecoveryAuthEvent, hasValidatedPasswordRecoverySession } from "@/lib/passwordRecoveryState";
import { isPasswordValid } from "@/lib/passwordPolicy";

type RecoveryState = "checking" | "ready" | "invalid" | "saving" | "saved";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [state, setState] = useState<RecoveryState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const completedRef = useRef(false);
  const passwordsMatch = password === confirmPassword;
  const canSave = isPasswordValid(password) && passwordsMatch && confirmPassword.length > 0;

  useEffect(() => {
    let active = true;
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      handlePasswordRecoveryAuthEvent(event, session);
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" && session) setState("ready");
      else if (event === "SIGNED_OUT" && !completedRef.current) setState("invalid");
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (!error && data.session && hasValidatedPasswordRecoverySession()) setState("ready");
      else setState((current) => current === "ready" ? current : "invalid");
    }).catch(() => {
      if (active) setState((current) => current === "ready" ? current : "invalid");
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (state !== "ready" || !canSave) return;
    setState("saving");
    setMessage("");
    let passwordUpdated = false;
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage("We couldn't update your password. The recovery link may have expired; request a new one.");
        setState("ready");
        return;
      }
      passwordUpdated = true;
      completedRef.current = true;
      clearValidatedPasswordRecoverySession();
      setState("saved");
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) {
        setMessage("Your password was changed, but this session could not be ended. Sign out from your account before signing in again.");
        return;
      }
      navigate("/auth", { replace: true, state: { passwordReset: true } });
    } catch {
      if (passwordUpdated) {
        setMessage("Your password was changed, but this session could not be ended. Sign out from your account before signing in again.");
        setState("saved");
      } else {
        setMessage("We couldn't update your password. The recovery link may have expired; request a new one.");
        setState("ready");
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container py-16">
        <section className="mx-auto max-w-md rounded-lg bg-card p-8 ring-1 ring-border" aria-labelledby="reset-password-title">
          <h1 id="reset-password-title" className="text-2xl font-semibold text-foreground">Set a new password</h1>
          {state === "checking" ? (
            <p role="status" className="mt-4 text-sm text-muted-foreground">Checking your recovery link...</p>
          ) : state === "invalid" ? (
            <div className="mt-4 space-y-4">
              <p role="alert" className="text-sm text-muted-foreground">This password recovery link is invalid or has expired. Request a new link to continue.</p>
              <Link to="/forgot-password" className="inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white">Request a new link</Link>
            </div>
          ) : state === "saved" ? (
            <div className="mt-4 space-y-3">
              <p role="status" className="text-sm text-foreground">Your password was changed. {message ? "" : "Returning to sign in..."}</p>
              {message && <><p role="alert" className="text-sm text-muted-foreground">{message}</p><Link to="/account" className="inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white">Go to your account</Link></>}
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <PasswordField label="New password" value={password} onChange={setPassword} showRequirements />
              <PasswordField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} />
              {confirmPassword && !passwordsMatch && <p role="alert" className="text-xs font-medium text-destructive">Passwords do not match.</p>}
              {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
              <button type="submit" disabled={state !== "ready" || !canSave} className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{state === "saving" ? "Saving..." : "Save new password"}</button>
            </form>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
