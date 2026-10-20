import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

let recoverySessionValidated = false;

export function handlePasswordRecoveryAuthEvent(event: AuthChangeEvent, session: Session | null) {
  if (event === "PASSWORD_RECOVERY" && session) recoverySessionValidated = true;
  else if (event === "SIGNED_IN" || event === "SIGNED_OUT") recoverySessionValidated = false;
}

export function hasValidatedPasswordRecoverySession() {
  return recoverySessionValidated;
}

export function clearValidatedPasswordRecoverySession() {
  recoverySessionValidated = false;
}
