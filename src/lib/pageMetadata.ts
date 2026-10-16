const configuredOrigin = import.meta.env.VITE_SITE_ORIGIN?.trim().replace(/\/$/, "");
export const SITE_ORIGIN = configuredOrigin || (typeof window === "undefined" ? "" : window.location.origin);
export const SOCIAL_IMAGE = `${SITE_ORIGIN}/luskam-social-preview.jpg`;
const SITE_INDEXABLE = import.meta.env.VITE_SITE_INDEXABLE === "true";

export interface PageMetadataInput {
  title: string;
  description: string;
  path: string;
  indexable?: boolean;
  type?: "website" | "article";
  image?: string;
}

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = content;
}

export function applyPageMetadata({
  title,
  description,
  path,
  indexable = true,
  type = "website",
  image = SOCIAL_IMAGE,
}: PageMetadataInput) {
  document.title = title;
  setMeta("name", "description", description);
  const canIndex = SITE_INDEXABLE && indexable;
  setMeta("name", "robots", canIndex ? "index,follow" : "noindex,nofollow");
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:type", type);
  setMeta("property", "og:image", image);
  setMeta("property", "og:image:alt", "Luskam Travel Agents flight travel imagery");
  if (SITE_ORIGIN) setMeta("property", "og:url", `${SITE_ORIGIN}${path}`);
  setMeta("name", "twitter:card", "summary_large_image");
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", description);
  setMeta("name", "twitter:image", image);

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (canIndex && SITE_ORIGIN) {
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.append(canonical);
    }
    canonical.href = `${SITE_ORIGIN}${path}`;
  } else {
    canonical?.remove();
  }
}
