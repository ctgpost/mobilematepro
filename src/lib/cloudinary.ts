import { supabase } from "@/integrations/supabase/client";

let cachedConfig: { cloud_name: string; upload_preset: string } | null = null;

export async function getCloudinaryConfig() {
  if (cachedConfig && cachedConfig.cloud_name && cachedConfig.upload_preset) return cachedConfig;
  const { data } = await supabase
    .from("shop_settings")
    .select("cloudinary_cloud_name, cloudinary_upload_preset")
    .limit(1)
    .maybeSingle();
  cachedConfig = {
    cloud_name: (data as any)?.cloudinary_cloud_name || "",
    upload_preset: (data as any)?.cloudinary_upload_preset || "",
  };
  return cachedConfig;
}

export function clearCloudinaryCache() {
  cachedConfig = null;
}

export async function uploadToCloudinary(file: File): Promise<string> {
  const cfg = await getCloudinaryConfig();
  if (!cfg.cloud_name || !cfg.upload_preset) {
    throw new Error("Cloudinary কনফিগার করা হয়নি — Settings → Cloudinary থেকে cloud name ও upload preset দিন");
  }
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", cfg.upload_preset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloud_name}/image/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Cloudinary আপলোড ব্যর্থ: ${txt}`);
  }
  const json = await res.json();
  return json.secure_url as string;
}

/**
 * Delete one or more Cloudinary assets by their secure_url.
 * Silent: never throws — orphan cleanup must not block UX.
 */
export async function deleteFromCloudinary(urls: (string | null | undefined)[]): Promise<void> {
  const list = urls.filter((u): u is string => !!u && /res\.cloudinary\.com/.test(u));
  if (!list.length) return;
  try {
    const { error } = await supabase.functions.invoke("cloudinary-delete", {
      body: { urls: list },
    });
    if (error) console.warn("[cloudinary-delete]", error.message);
  } catch (e) {
    console.warn("[cloudinary-delete] failed:", e);
  }
}
