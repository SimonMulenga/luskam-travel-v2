import { createRoot } from "react-dom/client";
import { supabase } from "@/integrations/supabase/client";
import { handlePasswordRecoveryAuthEvent } from "@/lib/passwordRecoveryState";
import App from "./App.tsx";
import "./index.css";

// Subscribe before React mounts so a recovery callback is captured even if
// Supabase processes the email-link URL during client initialization.
supabase.auth.onAuthStateChange(handlePasswordRecoveryAuthEvent);

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // PWA enhancements are optional; the application remains usable online.
    });
  });
}
