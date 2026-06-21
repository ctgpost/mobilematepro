import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Extract Cloudinary public_id from a secure_url
// e.g. https://res.cloudinary.com/<cloud>/image/upload/v123/folder/abc.jpg -> folder/abc
function extractPublicId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("res.cloudinary.com")) return null;
    // path: /<cloud>/image/upload/(v123/)?<public_id>.<ext>
    const parts = u.pathname.split("/").filter(Boolean);
    const uploadIdx = parts.indexOf("upload");
    if (uploadIdx < 0) return null;
    let rest = parts.slice(uploadIdx + 1);
    // Strip transformation segments (anything before version or before file). Heuristic: drop leading segments
    // until we find a version segment "vNNN..." or until we get the last segment as public_id.
    const vIdx = rest.findIndex((p) => /^v\d+$/.test(p));
    if (vIdx >= 0) rest = rest.slice(vIdx + 1);
    if (rest.length === 0) return null;
    const last = rest[rest.length - 1].replace(/\.[^.]+$/, "");
    rest[rest.length - 1] = last;
    return rest.join("/");
  } catch {
    return null;
  }
}

async function sha1Hex(str: string): Promise<string> {
  const buf = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
    if (!apiKey || !apiSecret) {
      throw new Error("CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET কনফিগার নেই");
    }

    // Auth: require logged-in user
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userRes } = await supa.auth.getUser(token);
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read cloud_name from shop_settings
    const { data: settings } = await supa
      .from("shop_settings")
      .select("cloudinary_cloud_name")
      .limit(1)
      .maybeSingle();
    const cloudName = (settings as any)?.cloudinary_cloud_name;
    if (!cloudName) throw new Error("Cloudinary cloud_name সেট নেই");

    const body = await req.json().catch(() => ({}));
    const urls: string[] = Array.isArray(body.urls) ? body.urls : [];
    const publicIds: string[] = Array.isArray(body.public_ids) ? body.public_ids : [];

    const ids = [
      ...publicIds,
      ...urls.map(extractPublicId).filter((x): x is string => !!x),
    ];

    const results: Array<{ public_id: string; result: string; error?: string }> = [];
    for (const pid of ids) {
      const timestamp = Math.floor(Date.now() / 1000);
      const toSign = `public_id=${pid}&timestamp=${timestamp}${apiSecret}`;
      const signature = await sha1Hex(toSign);
      const form = new FormData();
      form.append("public_id", pid);
      form.append("timestamp", String(timestamp));
      form.append("api_key", apiKey);
      form.append("signature", signature);
      const r = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
        { method: "POST", body: form },
      );
      const j = await r.json().catch(() => ({}));
      results.push({ public_id: pid, result: j.result || "error", error: j.error?.message });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
