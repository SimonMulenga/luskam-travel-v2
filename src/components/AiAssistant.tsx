import { useEffect, useState, useRef } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const AiAssistant = () => {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", content: "Hi! I'm Luskam's travel assistant. Ask me about visas, destinations, or planning your trip." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setErr(null);
    const next: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token ?? PUB_KEY;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: PUB_KEY,
        },
        body: JSON.stringify({ messages: next }),
      });
      if (!resp.ok) {
        if (resp.status === 429) throw new Error("Too many requests. Please try again in a moment.");
        if (resp.status === 402) throw new Error("AI credits exhausted. Please contact support.");
        throw new Error("Assistant is unavailable.");
      }
      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No response");
      const decoder = new TextDecoder();
      let assistant = "";
      setMsgs((m) => [...m, { role: "assistant", content: "" }]);
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload);
            const delta = j.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              assistant += delta;
              setMsgs((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: assistant };
                return copy;
              });
            }
          } catch {
            /* skip */
          }
        }
      }
    } catch (e) {
      setErr((e as Error).message);
      setMsgs((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-[hsl(var(--primary-hover))]"
          aria-label="Open travel assistant"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}
      {open && (
        <div className="fixed bottom-24 right-5 z-40 flex h-[520px] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg bg-card shadow-2xl ring-1 ring-border">
          <div className="flex items-center justify-between border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <div>
              <div className="text-sm font-semibold">Luskam Travel Assistant</div>
              <div className="text-[11px] opacity-80">Ask me anything about your trip</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground whitespace-pre-wrap"
                  }
                >
                  {m.content || (busy && i === msgs.length - 1 ? "…" : "")}
                </div>
              </div>
            ))}
            {busy && msgs[msgs.length - 1]?.role === "user" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking…
              </div>
            )}
            {err && <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</div>}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about visas, destinations…"
              disabled={busy}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
