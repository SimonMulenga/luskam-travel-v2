import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const SITE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const SITE_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,.avif,.gif,image/jpeg,image/png,image/webp,image/avif,image/gif";
const SITE_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

export const useSiteContent = () => {
  const { data } = useQuery({
    queryKey: ["site_content"],
    queryFn: async () => {
      const { data } = await supabase.from("site_content").select("key, value");
      return Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Record<string, string>;
    },
    staleTime: 60_000,
  });
  const get = (key: string, fallback: string) => (data?.[key]?.trim() ? data[key] : fallback);
  return { content: data ?? {}, get };
};

/** Uploads a file to the site media store and returns a long-lived URL. */
export const uploadSiteImage = async (file: File, folder = "site") => {
  const ext = SITE_IMAGE_EXTENSIONS[file.type];
  if (!ext) throw new Error("Choose a JPG, PNG, WebP, AVIF, or GIF image.");
  if (file.size <= 0 || file.size > SITE_IMAGE_MAX_BYTES) throw new Error("Image must be smaller than 10 MB.");
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("site-media").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data, error: sErr } = await supabase.storage
    .from("site-media")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (sErr || !data) throw sErr ?? new Error("Could not create image link");
  return data.signedUrl;
};
