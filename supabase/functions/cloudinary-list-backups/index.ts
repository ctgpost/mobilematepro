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
    if (roleError || !roleRow || !["admin", "manager"].includes(roleRow.role)) {
      return reply({ error: "Admin or manager permission required" }, 403);
    }

    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
    if (!apiKey || !apiSecret) return reply({ resources: [], next_cursor: null, not_configured: true }, 503);
    const { data: settings, error: settingsError } = await supa.from("shop_settings")
      .select("cloudinary_cloud_name").limit(1).maybeSingle();
    if (settingsError) throw settingsError;
    const cloudName = settings?.cloudinary_cloud_name;
    if (!cloudName || !/^[A-Za-z0-9_-]{1,100}$/.test(cloudName)) return reply({ error: "Invalid Cloudinary cloud name" }, 503);

    const body = await req.json();
    const prefix = typeof body.prefix === "string" ? body.prefix : "mobile-mate-pro-backups";
    if (prefix !== "mobile-mate-pro-backups" && !prefix.startsWith("mobile-mate-pro-backups/")) {
      return reply({ error: "Invalid backup prefix" }, 400);
    }
    const max = Number(body.max_results ?? 100);
    if (!Number.isInteger(max) || max < 1 || max > 500) return reply({ error: "max_results must be 1..500" }, 400);
    const cursor = body.next_cursor;
    if (cursor !== undefined && (typeof cursor !== "string" || cursor.length > 2048)) return reply({ error: "Invalid pagination cursor" }, 400);

    const url = new URL(`https://api.cloudinary.com/v1_1/${cloudName}/resources/raw`);
    url.searchParams.set("type", "upload");
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("max_results", String(max));
    if (cursor) url.searchParams.set("next_cursor", cursor);
    const response = await fetch(url, { headers: { Authorization: `Basic ${btoa(`${apiKey}:${apiSecret}`)}` } });
    const payload = await response.json();
    if (!response.ok) return reply({ error: "Cloudinary request failed" }, response.status);
    const resources = (payload.resources || []).map((resource: Record<string, any>) => ({
      public_id: resource.public_id,
      filename: String(resource.public_id || "").split("/").pop(),
      created_at: resource.created_at,
      bytes: resource.bytes,
      secure_url: resource.secure_url,
      format: resource.format,
    })).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return reply({ resources, next_cursor: payload.next_cursor || null });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
