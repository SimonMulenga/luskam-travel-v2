import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SITE_IMAGE_ACCEPT, uploadSiteImage } from "@/hooks/useSiteContent";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Plus, Upload } from "lucide-react";

interface Post {
  id: string; slug: string; title: string; excerpt: string; body: string;
  cover_url: string | null; published: boolean; published_at: string | null; created_at: string;
}
const empty = { id: "", slug: "", title: "", excerpt: "", body: "", cover_url: null, published: false, published_at: null, created_at: "" } as Post;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);

export const BlogManager = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [edit, setEdit] = useState<Post | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("blog_posts").select("*").order("created_at", { ascending: false });
    setPosts((data ?? []) as Post[]);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!edit || !edit.title.trim()) return toast.error("Title is required");
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const row = {
      title: edit.title.trim(),
      slug: edit.slug || slugify(edit.title) || String(Date.now()),
      excerpt: edit.excerpt, body: edit.body, cover_url: edit.cover_url,
      published: edit.published,
      published_at: edit.published ? edit.published_at ?? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      author_id: u.user?.id,
    };
    const { error } = edit.id
      ? await supabase.from("blog_posts").update(row).eq("id", edit.id)
      : await supabase.from("blog_posts").insert(row);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Post saved");
    setEdit(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this post?")) return;
    const { error } = await supabase.from("blog_posts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const onCover = async (file?: File) => {
    if (!file || !edit) return;
    setBusy(true);
    try { setEdit({ ...edit, cover_url: await uploadSiteImage(file, "blog") }); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  if (edit) {
    return (
      <div className="space-y-4 rounded-lg bg-card p-5 ring-1 ring-border">
        <input placeholder="Post title" value={edit.title}
          onChange={(e) => setEdit({ ...edit, title: e.target.value, slug: edit.id ? edit.slug : slugify(e.target.value) })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-base font-semibold" />
        <textarea placeholder="Short summary" rows={2} value={edit.excerpt} onChange={(e) => setEdit({ ...edit, excerpt: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <div className="flex items-center gap-3">
          {edit.cover_url && <img src={edit.cover_url} alt="" className="h-20 w-32 rounded-md object-cover" />}
          <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
            <Upload className="h-3.5 w-3.5" /> {edit.cover_url ? "Replace cover image" : "Add cover image"}
            <input type="file" accept={SITE_IMAGE_ACCEPT} className="hidden" onChange={(e) => onCover(e.target.files?.[0])} />
          </span>
        </div>
        <textarea placeholder="Write your post… (leave a blank line between paragraphs)" rows={14} value={edit.body}
          onChange={(e) => setEdit({ ...edit, body: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={edit.published} onChange={(e) => setEdit({ ...edit, published: e.target.checked })} />
          Published (visible on the website)
        </label>
        <div className="flex gap-3">
          <button onClick={save} disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save post"}
          </button>
          <button onClick={() => setEdit(null)} className="rounded-md border border-border px-4 py-2 text-sm">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => setEdit({ ...empty })} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
        <Plus className="h-4 w-4" /> New post
      </button>
      <div className="mt-4 overflow-hidden rounded-lg bg-card ring-1 ring-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {posts.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 text-foreground">{p.title}</td>
                <td className="px-4 py-3 text-xs">{p.published ? "Published" : "Draft"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{format(new Date(p.created_at), "dd MMM yyyy")}</td>
                <td className="space-x-3 px-4 py-3 text-right text-xs">
                  <button onClick={() => setEdit(p)} className="text-primary hover:underline">Edit</button>
                  <button onClick={() => remove(p.id)} className="text-destructive hover:underline">Delete</button>
                </td>
              </tr>
            ))}
            {posts.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No posts yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};
