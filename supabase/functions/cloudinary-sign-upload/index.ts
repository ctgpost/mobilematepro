import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
      throw new Error("Cloudinary credentials missing");
    }

    // Require logged-in user
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

    const { data: roleRow } = await supa.from("user_roles").select("role").eq("user_id", userRes.user.id).maybeSingle();
    if (!roleRow || !["admin", "manager", "staff"].includes(roleRow.role)) {
      return new Response(JSON.stringify({ error: "Permission denied" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const folder: string = typeof body.folder === "string" ? body.folder : "uploads";
    const publicId: string | undefined = typeof body.public_id === "string" ? body.public_id : undefined;
    const folderParts = folder.split("/");
    const allowedRoots = new Set(["uploads", "products", "customers", "suppliers", "avatars", "shop", "mobile-mate-pro-backups"]);
    if (folder.length > 160 || !allowedRoots.has(folderParts[0]) || folderParts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
      throw new Error("Invalid upload folder");
    }
    if (body.public_id !== undefined && (!publicId || !/^[A-Za-z0-9_-]{1,120}$/.test(publicId))) throw new Error("Invalid public_id");

    const timestamp = Math.floor(Date.now() / 1000);

    // Build params alphabetically for signature (Cloudinary spec)
    const params: Record<string, string> = {
      folder,
      timestamp: String(timestamp),
    };
    if (publicId) params.public_id = publicId;

    const toSign =
      Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join("&") + apiSecret;
    const signature = await sha1Hex(toSign);

    return new Response(
      JSON.stringify({
        api_key: apiKey,
        timestamp,
        signature,
        folder,
        public_id: publicId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
