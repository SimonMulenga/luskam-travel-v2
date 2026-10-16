import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const siteIndexable = env.VITE_SITE_INDEXABLE === "true";
  const configuredSiteOrigin = env.VITE_SITE_ORIGIN?.trim().replace(/\/$/, "") ?? "";
  let siteOrigin = "";

  if (siteIndexable) {
    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(configuredSiteOrigin);
    } catch {
      throw new Error("VITE_SITE_INDEXABLE=true requires a valid HTTPS VITE_SITE_ORIGIN.");
    }
    if (parsedOrigin.protocol !== "https:" || parsedOrigin.origin !== configuredSiteOrigin) {
      throw new Error("VITE_SITE_INDEXABLE=true requires VITE_SITE_ORIGIN to be an HTTPS origin without a path.");
    }
    siteOrigin = parsedOrigin.origin;
  }

  const stagingSeoGuard = {
    name: "luskam-site-seo-guard",
    transformIndexHtml(html: string) {
      if (!siteIndexable) return html;
      const escapedOrigin = siteOrigin
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      return html
        .replace('content="noindex,nofollow"', 'content="index,follow"')
        .replace(/content="\/luskam-social-preview\.jpg"/g, `content="${escapedOrigin}/luskam-social-preview.jpg"`)
        .replace("</head>", `    <link rel="canonical" href="${escapedOrigin}/" />\n    <meta property="og:url" content="${escapedOrigin}/" />\n  </head>`);
    },
  };

  return ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), stagingSeoGuard, mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  });
});
