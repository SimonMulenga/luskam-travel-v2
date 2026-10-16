// Secure provider logging. Never stores API keys or raw credentials.
import { createClient } from "npm:@supabase/supabase-js@2";

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export interface ProviderLogEntry {
  provider: string;
  action: string;
  endpoint?: string | null;
  requestAt: number;
  success: boolean;
  httpStatus?: number | null;
  providerReference?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  meta?: Record<string, unknown>;
}

const SECRET_PATTERN = /(access_key|api_key|apikey|authorization|token|secret)=?[^&\s"]*/gi;

export const redact = (s?: string | null) =>
  s ? s.replace(SECRET_PATTERN, "$1=[redacted]") : s ?? null;

export async function logProviderCall(entry: ProviderLogEntry) {
  try {
    const now = Date.now();
    await serviceClient().from("flight_provider_logs").insert({
      provider: entry.provider,
      action: entry.action,
      endpoint: redact(entry.endpoint ?? null),
      request_at: new Date(entry.requestAt).toISOString(),
      response_at: new Date(now).toISOString(),
      duration_ms: now - entry.requestAt,
      success: entry.success,
      http_status: entry.httpStatus ?? null,
      provider_reference: entry.providerReference ?? null,
      error_code: entry.errorCode ?? null,
      error_message: redact(entry.errorMessage ?? null),
      meta: entry.meta ?? null,
    });
  } catch (_) {
    // logging must never break a request
  }
}
