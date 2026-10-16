import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SITE_IMAGE_ACCEPT, useSiteContent, uploadSiteImage } from "@/hooks/useSiteContent";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

type Field = { key: string; label: string; kind: "text" | "textarea" | "image" };

const SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: "Homepage top section",
    fields: [
      { key: "hero_title", label: "Headline", kind: "text" },
      { key: "hero_subtitle", label: "Intro text", kind: "textarea" },
      { key: "hero_image", label: "Main image", kind: "image" },
    ],
  },
  {
    title: "About section",
    fields: [
      { key: "about_title", label: "Heading", kind: "text" },
      { key: "about_p1", label: "First paragraph", kind: "textarea" },
      { key: "about_p2", label: "Second paragraph", kind: "textarea" },
      { key: "about_phone", label: "Phone shown", kind: "text" },
      { key: "about_location", label: "Based in", kind: "text" },
      { key: "about_image_1", label: "Left image", kind: "image" },
      { key: "about_image_2", label: "Right image", kind: "image" },
    ],
  },
  {
    title: "Footer",
    fields: [{ key: "footer_tagline", label: "Tagline", kind: "textarea" }],
  },
];

export const SiteContentEditor = () => {
  const { content } = useSiteContent();
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => setValues(content), [content]);

  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const rows = SECTIONS.flatMap((s) => s.fields).map((f) => ({
      key: f.key,
      value: values[f.key] ?? "",
      updated_at: new Date().toISOString(),
      updated_by: u.user?.id,
    }));
    const { error } = await supabase.from("site_content").upsert(rows);
    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["site_content"] });
    toast.success("Website updated");
  };

  const onFile = async (key: string, file?: File) => {
    if (!file) return;
    setUploading(key);
    try {
      set(key, await uploadSiteImage(file, "site"));
      toast.success("Image uploaded — click Save changes to publish");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Leave a field empty to keep the original website text or image.</p>
      {SECTIONS.map((s) => (
        <div key={s.title} className="rounded-lg bg-card p-5 ring-1 ring-border">
          <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {s.fields.map((f) => (
              <label key={f.key} className={f.kind === "textarea" ? "md:col-span-2" : ""}>
                <span className="text-xs font-medium text-muted-foreground">{f.label}</span>
                {f.kind === "text" && (
                  <input value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                )}
                {f.kind === "textarea" && (
                  <textarea rows={3} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                )}
                {f.kind === "image" && (
                  <div className="mt-1 flex items-center gap-3">
                    <div className="h-20 w-28 overflow-hidden rounded-md bg-muted ring-1 ring-border">
                      {values[f.key] ? <img src={values[f.key]} alt="" className="h-full w-full object-cover" /> :
                        <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">Original</div>}
                    </div>
                    <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                      {uploading === f.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Replace image
                      <input type="file" accept={SITE_IMAGE_ACCEPT} className="hidden" onChange={(e) => onFile(f.key, e.target.files?.[0])} />
                    </span>
                    {values[f.key] && (
                      <button type="button" onClick={() => set(f.key, "")} className="text-xs text-destructive hover:underline">Reset</button>
                    )}
                  </div>
                )}
              </label>
            ))}
          </div>
        </div>
      ))}
      <button onClick={save} disabled={saving}
        className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
};
