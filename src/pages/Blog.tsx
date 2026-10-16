import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface Post { id: string; slug: string; title: string; excerpt: string; body: string; cover_url: string | null; published_at: string | null; created_at: string }

const Blog = () => {
  const { slug } = useParams();
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
    setPosts(null);
    let q = supabase.from("blog_posts").select("*").eq("published", true).order("published_at", { ascending: false });
    if (slug) q = q.eq("slug", slug);
    q.then(({ data }) => setPosts((data ?? []) as Post[]));
  }, [slug]);

  const date = (p: Post) => format(new Date(p.published_at ?? p.created_at), "dd MMM yyyy");

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container max-w-6xl py-8 sm:py-12">
        {posts === null ? (
          <div className="flex justify-center py-20" role="status" aria-label="Loading articles"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
        ) : slug ? (
          posts[0] ? (
            <article className="mx-auto max-w-4xl">
              <Link to="/blog" className="inline-flex min-h-10 items-center text-sm font-semibold text-primary transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">← All articles</Link>
              <header className="mt-5 max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[.16em] text-accent">Travel insights</p><h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-primary sm:text-4xl">{posts[0].title}</h1><p className="mt-3 text-sm text-muted-foreground">{date(posts[0])}</p></header>
              {posts[0].cover_url && <img src={posts[0].cover_url} alt="" loading="eager" fetchPriority="high" decoding="async" className="mt-7 aspect-[16/9] w-full rounded-3xl object-cover" />}
              <div className="mt-8 max-w-3xl space-y-5 text-base leading-8 text-foreground sm:text-lg">
                {posts[0].body.split(/\n\s*\n/).map((para, i) => <p key={i} className="whitespace-pre-line">{para}</p>)}
              </div>
            </article>
          ) : <div className="py-20 text-center"><p className="text-xl font-semibold text-primary">Article not found</p><Link to="/blog" className="mt-3 inline-flex text-sm font-semibold text-accent hover:underline">Browse all articles</Link></div>
        ) : (
          <>
            <div className="rounded-3xl bg-primary px-6 py-8 text-white sm:px-8 sm:py-10"><p className="text-xs font-semibold uppercase tracking-[.17em] text-sky-200">Journal</p><h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Travel news &amp; tips</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">Guides and stories published by the Luskam team.</p></div>
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((p) => (
                <Link key={p.id} to={`/blog/${p.slug}`} className="group overflow-hidden rounded-3xl border border-border/70 bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {p.cover_url && <img src={p.cover_url} alt="" className="aspect-[16/9] w-full object-cover transition duration-500 group-hover:scale-[1.02]" loading="lazy" decoding="async" />}
                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-accent">{date(p)}</p>
                    <h2 className="mt-2 text-lg font-semibold leading-snug text-primary">{p.title}</h2>
                    {p.excerpt && <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{p.excerpt}</p>}
                  </div>
                </Link>
              ))}
              {posts.length === 0 && <p className="rounded-2xl border border-border/70 bg-white p-8 text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">No articles yet — check back soon.</p>}
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Blog;
