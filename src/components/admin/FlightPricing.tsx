import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Copy, Trash2, Calculator } from "lucide-react";

export interface PricingRule {
  id: string;
  name: string;
  description: string | null;
  rule_type: string;
  priority: number;
  markup_type: string;
  markup_amount: number;
  currency: string;
  airline_code: string | null;
  origin_airport: string | null;
  destination_airport: string | null;
  cabin_class: string | null;
  is_domestic: boolean | null;
  min_ticket_price: number | null;
  max_ticket_price: number | null;
  is_active: boolean;
  created_at: string;
}

type Draft = Partial<PricingRule>;

const emptyDraft: Draft = {
  name: "",
  rule_type: "global",
  priority: 10,
  markup_type: "fixed",
  markup_amount: 0,
  currency: "USD",
  airline_code: "",
  origin_airport: "",
  destination_airport: "",
  cabin_class: "",
  is_domestic: null,
  is_active: true,
};

const deriveType = (d: Draft) => {
  const airline = !!d.airline_code;
  const route = !!d.origin_airport && !!d.destination_airport;
  if (airline && route) return "airline_route";
  if (route) return "route";
  if (airline) return "airline";
  if (d.cabin_class) return "cabin";
  if (d.is_domestic !== null && d.is_domestic !== undefined) return "domestic";
  return "global";
};

const priorityFor = (type: string) =>
  ({ airline_route: 60, route: 50, airline: 40, cabin: 30, domestic: 20, global: 10 }[type] ?? 10);

export const FlightPricing = ({ canEdit }: { canEdit: boolean }) => {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const [preview, setPreview] = useState({ supplierPrice: "350", airlineCode: "", origin: "LUN", destination: "JNB", cabin: "economy" });
  const [previewResult, setPreviewResult] = useState<
    { supplier_price: number; markup_amount: number; customer_price: number; pricing_rule_name: string | null; margin_percent: number } | null
  >(null);
  const [previewing, setPreviewing] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pricing_rules")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRules((data ?? []) as PricingRule[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!draft) return;
    if (!draft.name?.trim()) return toast.error("Give the rule a name");
    setSaving(true);
    const type = deriveType(draft);
    const payload = {
      name: draft.name.trim(),
      description: draft.description || null,
      rule_type: type,
      priority: priorityFor(type),
      markup_type: draft.markup_type ?? "fixed",
      markup_amount: Number(draft.markup_amount) || 0,
      currency: draft.currency || "USD",
      airline_code: draft.airline_code ? draft.airline_code.toUpperCase() : null,
      origin_airport: draft.origin_airport ? draft.origin_airport.toUpperCase() : null,
      destination_airport: draft.destination_airport ? draft.destination_airport.toUpperCase() : null,
      cabin_class: draft.cabin_class || null,
      is_domestic: draft.is_domestic ?? null,
      min_ticket_price: draft.min_ticket_price ?? null,
      max_ticket_price: draft.max_ticket_price ?? null,
      is_active: draft.is_active ?? true,
    };
    const { error } = draft.id
      ? await supabase.from("pricing_rules").update(payload).eq("id", draft.id)
      : await supabase.from("pricing_rules").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(draft.id ? "Rule updated" : "Rule created");
    setDraft(null);
    load();
  };

  const toggleActive = async (r: PricingRule) => {
    const { error } = await supabase.from("pricing_rules").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) return toast.error(error.message);
    setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: !x.is_active } : x)));
  };

  const duplicate = (r: PricingRule) => {
    const { id, created_at, ...rest } = r;
    setDraft({ ...rest, name: `${r.name} (copy)` });
  };

  const remove = async (r: PricingRule) => {
    if (!confirm(`Delete "${r.name}"? Existing bookings keep the price they were sold at.`)) return;
    const { error } = await supabase.from("pricing_rules").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Rule deleted");
    setRules((prev) => prev.filter((x) => x.id !== r.id));
  };

  const runPreview = async () => {
    setPreviewing(true);
    const { data, error } = await supabase.functions.invoke("flight-pricing-preview", {
      body: { ...preview, supplierPrice: Number(preview.supplierPrice) },
    });
    setPreviewing(false);
    if (error) return toast.error("Preview unavailable");
    const d = data as { error?: string };
    if (d?.error) return toast.error(d.error);
    setPreviewResult(data as typeof previewResult);
  };

  const field = "mt-1.5 min-h-11 w-full min-w-0 rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  const label = "text-sm font-semibold text-primary";

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Flight pricing &amp; markup</h2>
            <p className="text-xs text-muted-foreground">
              Only the most specific matching rule applies — airline + route, then route, airline, cabin, domestic/international, then global.
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => setDraft({ ...emptyDraft })}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> New rule
            </button>
          )}
        </div>

        {draft && (
          <div className="min-w-0 rounded-lg bg-card p-4 ring-1 ring-border sm:p-5">
            <div className="text-sm font-semibold text-foreground">{draft.id ? "Edit rule" : "New rule"}</div>
            <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0 sm:col-span-2">
                <label className={label} htmlFor="pricing-rule-name">Rule name</label>
                <input id="pricing-rule-name" className={field} value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="min-w-0">
                <label className={label} htmlFor="pricing-rule-markup-type">Markup type</label>
                <select id="pricing-rule-markup-type" className={field} value={draft.markup_type} onChange={(e) => setDraft({ ...draft, markup_type: e.target.value })}>
                  <option value="fixed">Fixed amount</option>
                  <option value="percentage">Percentage</option>
                </select>
              </div>
              <div className="min-w-0">
                <label className={label} htmlFor="pricing-rule-markup-amount">{draft.markup_type === "percentage" ? "Percentage (%)" : "Amount (USD)"}</label>
                <input
                  type="number"
                  id="pricing-rule-markup-amount"
                  step="0.01"
                  className={field}
                  value={draft.markup_amount ?? 0}
                  onChange={(e) => setDraft({ ...draft, markup_amount: Number(e.target.value) })}
                />
              </div>
              <div className="min-w-0">
                <label className={label} htmlFor="pricing-rule-airline">Airline code (optional)</label>
                <input id="pricing-rule-airline" className={field} maxLength={3} value={draft.airline_code ?? ""} onChange={(e) => setDraft({ ...draft, airline_code: e.target.value.toUpperCase() })} />
              </div>
              <div className="min-w-0">
                <label className={label} htmlFor="pricing-rule-cabin">Cabin (optional)</label>
                <select id="pricing-rule-cabin" className={field} value={draft.cabin_class ?? ""} onChange={(e) => setDraft({ ...draft, cabin_class: e.target.value })}>
                  <option value="">Any cabin</option>
                  <option value="economy">Economy</option>
                  <option value="premium_economy">Premium Economy</option>
                  <option value="business">Business</option>
                  <option value="first">First</option>
                </select>
              </div>
              <div className="min-w-0">
                <label className={label} htmlFor="pricing-rule-origin">From airport (optional)</label>
                <input id="pricing-rule-origin" className={field} maxLength={3} value={draft.origin_airport ?? ""} onChange={(e) => setDraft({ ...draft, origin_airport: e.target.value.toUpperCase() })} />
              </div>
              <div className="min-w-0">
                <label className={label} htmlFor="pricing-rule-destination">To airport (optional)</label>
                <input id="pricing-rule-destination" className={field} maxLength={3} value={draft.destination_airport ?? ""} onChange={(e) => setDraft({ ...draft, destination_airport: e.target.value.toUpperCase() })} />
              </div>
              <div className="min-w-0">
                <label className={label} htmlFor="pricing-rule-domestic">Applies to</label>
                <select
                  id="pricing-rule-domestic"
                  className={field}
                  value={draft.is_domestic === null || draft.is_domestic === undefined ? "" : draft.is_domestic ? "yes" : "no"}
                  onChange={(e) => setDraft({ ...draft, is_domestic: e.target.value === "" ? null : e.target.value === "yes" })}
                >
                  <option value="">All flights</option>
                  <option value="yes">Domestic only</option>
                  <option value="no">International only</option>
                </select>
              </div>
              <div className="min-w-0">
                <label className={label} htmlFor="pricing-rule-status">Status</label>
                <select id="pricing-rule-status" className={field} value={draft.is_active ? "active" : "inactive"} onChange={(e) => setDraft({ ...draft, is_active: e.target.value === "active" })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button onClick={save} disabled={saving} className="min-h-11 w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:w-auto">
                {saving ? "Saving…" : "Save rule"}
              </button>
              <button onClick={() => setDraft(null)} className="min-h-11 w-full rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground sm:w-auto">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-white">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rules.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No pricing rules yet.</div>
          ) : (
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Rule</th>
                    <th className="px-4 py-3">Applies to</th>
                    <th className="px-4 py-3">Markup</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rules.map((r) => (
                    <tr key={r.id} className="transition hover:bg-surface/70">
                      <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {[
                          r.airline_code,
                          r.origin_airport && r.destination_airport ? `${r.origin_airport}→${r.destination_airport}` : null,
                          r.cabin_class,
                          r.is_domestic === null ? null : r.is_domestic ? "Domestic" : "International",
                        ].filter(Boolean).join(" · ") || "All flights"}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {r.markup_type === "percentage" ? `${r.markup_amount}%` : `${r.currency} ${r.markup_amount}`}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.priority}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => canEdit && toggleActive(r)}
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                        >
                          {r.is_active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {canEdit && (
                          <div className="flex justify-end gap-3">
                            <button onClick={() => setDraft(r)} className="text-primary hover:underline">Edit</button>
                            <button onClick={() => duplicate(r)} aria-label={`Duplicate ${r.name}`} className="text-muted-foreground hover:text-foreground"><Copy className="inline h-3.5 w-3.5" /></button>
                            <button onClick={() => remove(r)} aria-label={`Delete ${r.name}`} className="text-destructive hover:underline"><Trash2 className="inline h-3.5 w-3.5" /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && rules.length > 0 && (
            <div className="grid gap-3 p-3 md:hidden">
              {rules.map((r) => {
                const appliesTo = [
                  r.airline_code,
                  r.origin_airport && r.destination_airport ? `${r.origin_airport} → ${r.destination_airport}` : null,
                  r.cabin_class,
                  r.is_domestic === null ? null : r.is_domestic ? "Domestic" : "International",
                ].filter(Boolean).join(" · ") || "All flights";
                return (
                  <article key={r.id} className="min-w-0 rounded-xl border border-border/70 bg-white p-4 shadow-sm">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <h3 className="min-w-0 break-words font-semibold text-foreground">{r.name}</h3>
                      <button type="button" disabled={!canEdit} onClick={() => canEdit && void toggleActive(r)} aria-label={`${r.is_active ? "Deactivate" : "Activate"} ${r.name}`} className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium disabled:cursor-default ${r.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {r.is_active ? "Active" : "Inactive"}
                      </button>
                    </div>
                    <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 text-sm">
                      <div className="col-span-2 min-w-0">
                        <dt className="text-xs font-medium text-muted-foreground">Applicable flights</dt>
                        <dd className="mt-0.5 break-words text-foreground">{appliesTo}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs font-medium text-muted-foreground">Markup</dt>
                        <dd className="mt-0.5 break-words font-semibold text-foreground">
                          {r.markup_type === "percentage" ? `${r.markup_amount}%` : `${r.currency} ${r.markup_amount}`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">Priority</dt>
                        <dd className="mt-0.5 text-foreground">{r.priority}</dd>
                      </div>
                    </dl>
                    {canEdit && (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-border/70 pt-3">
                        <button type="button" onClick={() => setDraft(r)} className="min-h-10 rounded-lg border border-border px-3 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Edit</button>
                        <button type="button" onClick={() => duplicate(r)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Copy className="h-4 w-4" aria-hidden="true" />Duplicate</button>
                        <button type="button" onClick={() => remove(r)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-destructive/30 px-3 text-sm font-semibold text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Trash2 className="h-4 w-4" aria-hidden="true" />Delete</button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <aside className="min-w-0 self-start rounded-2xl border border-border/70 bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Calculator className="h-4 w-4" /> Price preview
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Shows the rule that would apply and the customer price.</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className={label}>Supplier fare (USD)</label>
            <input className={field} type="number" value={preview.supplierPrice} onChange={(e) => setPreview({ ...preview, supplierPrice: e.target.value })} />
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>From</label>
              <input className={field} maxLength={3} value={preview.origin} onChange={(e) => setPreview({ ...preview, origin: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label className={label}>To</label>
              <input className={field} maxLength={3} value={preview.destination} onChange={(e) => setPreview({ ...preview, destination: e.target.value.toUpperCase() })} />
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Airline</label>
              <input className={field} maxLength={3} value={preview.airlineCode} onChange={(e) => setPreview({ ...preview, airlineCode: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label className={label}>Cabin</label>
              <select className={field} value={preview.cabin} onChange={(e) => setPreview({ ...preview, cabin: e.target.value })}>
                <option value="economy">Economy</option>
                <option value="premium_economy">Premium</option>
                <option value="business">Business</option>
                <option value="first">First</option>
              </select>
            </div>
          </div>
          <button onClick={runPreview} disabled={previewing} className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {previewing ? "Calculating…" : "Preview price"}
          </button>
        </div>
        {previewResult && (
          <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Supplier cost</dt><dd className="text-foreground">${previewResult.supplier_price}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Markup</dt><dd className="text-foreground">${previewResult.markup_amount} ({previewResult.margin_percent}%)</dd></div>
            <div className="flex justify-between font-semibold"><dt className="text-foreground">Customer price</dt><dd className="text-foreground">${previewResult.customer_price}</dd></div>
            <div className="pt-1 text-xs text-muted-foreground">Rule applied: {previewResult.pricing_rule_name ?? "None — no markup"}</div>
          </dl>
        )}
      </aside>
    </div>
  );
};
