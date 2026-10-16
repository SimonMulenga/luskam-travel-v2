import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

interface Sub { id: string; email: string; name: string | null; created_at: string }

export const SubscribersList = () => {
  const [subs, setSubs] = useState<Sub[]>([]);
  const load = async () => {
    const { data } = await supabase.from("newsletter_subscribers").select("*").order("created_at", { ascending: false });
    setSubs((data ?? []) as Sub[]);
  };
  useEffect(() => { load(); }, []);

  const exportCsv = () => {
    const csv = ["email,name,subscribed"].concat(subs.map((s) => `${s.email},"${(s.name ?? "").replace(/"/g, "'")}",${s.created_at}`)).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "newsletter-subscribers.csv";
    a.click();
  };
  const copyEmails = () => { navigator.clipboard.writeText(subs.map((s) => s.email).join(", ")); toast.success("Emails copied"); };
  const remove = async (id: string) => {
    if (!confirm("Remove this subscriber?")) return;
    await supabase.from("newsletter_subscribers").delete().eq("id", id);
    load();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">{subs.length} subscribers</span>
        <button onClick={exportCsv} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Download list</button>
        <button onClick={copyEmails} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Copy all emails</button>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg bg-card ring-1 ring-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-4 py-3">Email</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Subscribed</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {subs.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 text-foreground">{s.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.name ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{format(new Date(s.created_at), "dd MMM yyyy")}</td>
                <td className="px-4 py-3 text-right"><button onClick={() => remove(s.id)} className="text-xs text-destructive hover:underline">Remove</button></td>
              </tr>
            ))}
            {subs.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No subscribers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};
