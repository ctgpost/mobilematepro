import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

function buildCors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowed = (Deno.env.get("APP_ALLOWED_ORIGINS") || Deno.env.get("APP_ALLOWED_ORIGIN") || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function extractPublicId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const uploadIndex = parts.indexOf("upload");
    if (uploadIndex < 0) return null;
    let rest = parts.slice(uploadIndex + 1);
    const versionIndex = rest.findIndex((part) => /^v\d+$/.test(part));
    if (versionIndex >= 0) rest = rest.slice(versionIndex + 1);
    if (!rest.length) return null;
    rest[rest.length - 1] = rest[rest.length - 1].replace(/\.[^.]+$/, "");
    return rest.join("/");
  } catch {
    return null;
  }
}

async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  const origin = req.headers.get("Origin");
  const reply = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (origin && !corsHeaders["Access-Control-Allow-Origin"]) return reply({ error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return reply({ error: "Unauthorized" }, 401);
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userRes, error: authError } = await supa.auth.getUser(authHeader.slice(7));
    if (authError || !userRes.user) return reply({ error: "Unauthorized" }, 401);

    const { data: roleRow, error: roleError } = await supa.from("user_roles")
      .select("role").eq("user_id", userRes.user.id).maybeSingle();
    if (roleError || !roleRow || !["admin", "manager"].includes(roleRow.role)) {
      return reply({ error: "Admin or manager permission required" }, 403);
    }

    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
    if (!apiKey || !apiSecret) return reply({ error: "Cloudinary credentials are not configured" }, 503);

    const { data: settings, error: settingsError } = await supa.from("shop_settings")
      .select("cloudinary_cloud_name").limit(1).maybeSingle();
    if (settingsError) throw settingsError;
    const cloudName = settings?.cloudinary_cloud_name;
    if (!cloudName || !/^[A-Za-z0-9_-]{1,100}$/.test(cloudName)) {
      return reply({ error: "Cloudinary cloud name is missing or invalid" }, 503);
    }

    const body = await req.json();
    const urls: unknown[] = Array.isArray(body.urls) ? body.urls : [];
    const publicIds: unknown[] = Array.isArray(body.public_ids) ? body.public_ids : [];
    if (urls.length + publicIds.length > 50 ||
        urls.some((value) => typeof value !== "string") ||
        publicIds.some((value) => typeof value !== "string")) {
      return reply({ error: "Invalid asset list or too many assets" }, 400);
    }

    const extracted = (urls as string[]).map(extractPublicId);
    if (extracted.some((value) => !value)) return reply({ error: "A supplied URL is not a valid Cloudinary asset URL" }, 400);
    const ids = [...new Set([...(publicIds as string[]), ...(extracted as string[])])];
    const safePublicId = /^(uploads|products|customers|suppliers|avatars|shop)\/[A-Za-z0-9_./-]{1,180}$/;
    if (ids.some((id) => !safePublicId.test(id) || id.includes("..") || id.startsWith("/") || id.endsWith("/"))) {
      return reply({ error: "Invalid public_id" }, 400);
    }

    const deleted: { public_id: string; result: string }[] = [];
    for (const publicId of ids) {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await sha1Hex(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`);
      const form = new FormData();
      form.set("public_id", publicId);
      form.set("timestamp", String(timestamp));
      form.set("api_key", apiKey);
      form.set("signature", signature);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok || (result.result !== "ok" && result.result !== "not found")) {
        throw new Error(`Cloudinary deletion failed for ${publicId}`);
      }
      deleted.push({ public_id: publicId, result: result.result });
    }
    return reply({ deleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    return reply({ error: message }, 500);
  }
});
