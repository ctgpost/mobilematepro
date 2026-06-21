import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
    if (!apiKey || !apiSecret) {
      return new Response(
        JSON.stringify({ resources: [], next_cursor: null, not_configured: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Auth: must be logged in
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
    const cloudName = settings?.cloudinary_cloud_name;
    if (!cloudName) throw new Error("Cloudinary cloud_name not configured");

    const body = await req.json().catch(() => ({}));
    const prefix: string = body.prefix || "mobile-mate-pro-backups";
    const max: number = Math.min(Number(body.max_results) || 100, 500);
    const nextCursor: string | undefined = body.next_cursor;

    const url = new URL(
      `https://api.cloudinary.com/v1_1/${cloudName}/resources/raw`,
    );
    url.searchParams.set("type", "upload");
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("max_results", String(max));
    if (nextCursor) url.searchParams.set("next_cursor", nextCursor);

    const basic = btoa(`${apiKey}:${apiSecret}`);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Basic ${basic}` },
    });
    const j = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: j }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resources = (j.resources || []).map((r: any) => ({
      public_id: r.public_id,
      filename: r.public_id.split("/").pop(),
      created_at: r.created_at,
      bytes: r.bytes,
      secure_url: r.secure_url,
      format: r.format,
    }));

    // Sort newest first
    resources.sort(
      (a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return new Response(
      JSON.stringify({ resources, next_cursor: j.next_cursor || null }),
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
