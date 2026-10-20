import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };
type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  readonly userChoice: Promise<InstallChoice>;
  prompt: () => Promise<void>;
};
type InstalledRelatedApp = { platform: string };
type NavigatorWithInstalledApps = Navigator & {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<InstalledRelatedApp[]>;
};

const DISMISSED_KEY = "luskam.pwa-install-dismissed.v1";

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches === true
    || (navigator as NavigatorWithInstalledApps).standalone === true;
}

function wasDismissed() {
  try { return window.localStorage.getItem(DISMISSED_KEY) === "true"; }
  catch { return false; }
}

function rememberDismissal() {
  try { window.localStorage.setItem(DISMISSED_KEY, "true"); }
  catch { /* The prompt remains dismissible for this page session. */ }
}

/** Offers installation without taking control of the browser's install UI. */
export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [installed, setInstalled] = useState(isStandalone);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const [installationCheckComplete, setInstallationCheckComplete] = useState(() => !/Android/i.test(navigator.userAgent));
  const dismissedRef = useRef(dismissed);

  useEffect(() => {
    const media = window.matchMedia?.("(display-mode: standalone)");
    const syncStandalone = () => setInstalled(isStandalone());
    const onBeforeInstallPrompt = (event: Event) => {
      if (!isAndroid) return;
      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      if (!dismissedRef.current && !isStandalone()) setInstallEvent(installEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    media?.addEventListener?.("change", syncStandalone);
    const getInstalledRelatedApps = (navigator as NavigatorWithInstalledApps).getInstalledRelatedApps;
    if (isAndroid && getInstalledRelatedApps) {
      void getInstalledRelatedApps.call(navigator)
        .then((apps) => {
          if (apps.some((app) => app.platform === "webapp")) setInstalled(true);
        })
        .catch(() => { /* This optional browser API may be unavailable. */ })
        .finally(() => setInstallationCheckComplete(true));
    } else {
      setInstallationCheckComplete(true);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      media?.removeEventListener?.("change", syncStandalone);
    };
  }, [isAndroid]);

  const dismiss = () => {
    dismissedRef.current = true;
    setDismissed(true);
    setInstallEvent(null);
    rememberDismissal();
  };

  const install = async () => {
    // prompt() must be called directly from the user's click gesture.
    const promptEvent = installEvent;
    if (!promptEvent) return;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setInstallEvent(null);
      if (choice.outcome === "accepted") setInstalled(true);
      else dismiss();
    } catch {
      setInstallEvent(null);
    }
  };

  if (installed || dismissed || !isAndroid || !installationCheckComplete) return null;

  return (
    <aside className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-lg rounded-2xl border border-primary/15 bg-white p-4 shadow-[0_18px_55px_-22px_rgba(4,24,50,.45)] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[min(100%-2rem,28rem)]" aria-label="Install Luskam Travel">
      <div className="flex items-start gap-3">
        <img src="/icons/icon-192.png" alt="" width="44" height="44" className="h-11 w-11 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-primary">Luskam Travel</p>
          {installEvent ? (
            <p className="mt-1 text-sm text-muted-foreground">Install the app for quick access from your home screen.</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">To install, open your browser menu and choose Install app or Add to Home screen.</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {installEvent && <button type="button" onClick={() => void install()} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white"><Download className="h-4 w-4" aria-hidden="true" />Install App</button>}
            <button type="button" onClick={dismiss} className="min-h-10 rounded-full border border-border px-4 text-sm font-semibold text-primary">Not Now</button>
          </div>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss install prompt" className="rounded-full p-2 text-muted-foreground hover:bg-surface"><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </aside>
  );
}

export default PwaInstallPrompt;
