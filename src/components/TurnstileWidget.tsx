import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    action: string;
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT_ID = "cloudflare-turnstile-api";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
    }
    const timeout = window.setTimeout(() => reject(new Error("turnstile_load_timeout")), 10_000);
    script.addEventListener("load", () => { window.clearTimeout(timeout); resolve(); }, { once: true });
    script.addEventListener("error", () => { window.clearTimeout(timeout); reject(new Error("turnstile_load_error")); }, { once: true });
    if (!script.isConnected) document.head.appendChild(script);
  }).catch((error: unknown) => {
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

type Props = { onToken: (token: string | null) => void; resetKey: number };

export function TurnstileWidget({ onToken, resetKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();

  useEffect(() => {
    let active = true;
    let widgetId: string | null = null;
    onToken(null);
    if (!siteKey) {
      setStatus("unavailable");
      return () => { active = false; };
    }
    setStatus("loading");
    void loadTurnstile().then(() => {
      if (!active || !containerRef.current || !window.turnstile) return;
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action: "flight_quote_request",
        callback: (token) => { if (active) { onToken(token); setStatus("ready"); } },
        "expired-callback": () => {
          if (active) {
            onToken(null);
            setStatus("loading");
            if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
          }
        },
        "error-callback": () => { if (active) { onToken(null); setStatus("unavailable"); } },
      });
    }).catch(() => { if (active) setStatus("unavailable"); });
    return () => {
      active = false;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, resetKey, onToken]);

  return (
    <div className="space-y-2">
      <div ref={containerRef} aria-label="Human verification" />
      {status === "loading" && <p className="text-xs text-muted-foreground" role="status">Loading verification…</p>}
      {status === "unavailable" && <p className="text-sm text-rose-800" role="alert">Verification is temporarily unavailable. Please try again later.</p>}
    </div>
  );
}
