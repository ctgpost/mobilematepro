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

async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const cors = buildCors(req);
  const origin = req.headers.get("Origin");
  const reply = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (origin && !cors["Access-Control-Allow-Origin"]) return reply({ error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return reply({ error: "Unauthorized" }, 401);
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: authData, error: authError } = await supa.auth.getUser(authorization.slice(7));
    if (authError || !authData.user) return reply({ error: "Unauthorized" }, 401);
    const { data: roleRow, error: roleError } = await supa.from("user_roles")
      .select("role").eq("user_id", authData.user.id).maybeSingle();
    if (roleError || !roleRow || !["admin", "manager", "staff"].includes(roleRow.role)) {
      return reply({ error: "Permission denied" }, 403);
    }

    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
    if (!apiKey || !apiSecret) return reply({ error: "Cloudinary credentials missing" }, 503);
    const body = await req.json();
    const folder = typeof body.folder === "string" ? body.folder : "uploads";
    const folderParts = folder.split("/");
    const allowedRoots = new Set(["uploads", "products", "customers", "suppliers", "avatars", "shop", "mobile-mate-pro-backups"]);
    if (folder.length > 160 || !allowedRoots.has(folderParts[0]) ||
        folderParts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
      return reply({ error: "Invalid upload folder" }, 400);
    }
    const publicId = typeof body.public_id === "string" ? body.public_id : undefined;
    if (body.public_id !== undefined && (!publicId || !/^[A-Za-z0-9_-]{1,120}$/.test(publicId))) {
      return reply({ error: "Invalid public_id" }, 400);
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const params: Record<string, string> = { folder, timestamp: String(timestamp) };
    if (publicId) params.public_id = publicId;
    const signatureInput = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join("&") + apiSecret;
    return reply({ api_key: apiKey, timestamp, signature: await sha1Hex(signatureInput), folder, public_id: publicId });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
