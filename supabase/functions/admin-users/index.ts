import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return reply({ error: "Authentication required" }, 401);

  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return reply({ error: "Invalid session" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: roleRow, error: roleError } = await admin.from("user_roles")
    .select("role").eq("user_id", authData.user.id).maybeSingle();
  if (roleError || roleRow?.role !== "admin") return reply({ error: "Admin access required" }, 403);

  try {
    const body = await req.json();
    const action = body.action;

    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const fullName = String(body.full_name ?? "").trim();
      const role = body.role;
      if (!email || password.length < 8 || !["staff", "manager", "admin"].includes(role)) {
        return reply({ error: "Valid email, password (8+ chars), and role are required" }, 400);
      }
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: false, user_metadata: { full_name: fullName || email },
      });
      if (error) throw error;
      const { error: updateError } = await admin.from("user_roles")
        .update({ role }).eq("user_id", data.user.id);
      if (updateError) {
        await admin.auth.admin.deleteUser(data.user.id);
        throw updateError;
      }
      return reply({ user: { id: data.user.id, email, role } }, 201);
    }

    if (action === "role") {
      const userId = String(body.user_id ?? "");
      const role = body.role;
      if (!userId || !["staff", "manager", "admin"].includes(role)) return reply({ error: "Invalid user or role" }, 400);
      if (userId === authData.user.id && role !== "admin") return reply({ error: "You cannot remove your own admin role" }, 400);
      if (role !== "admin") {
        const { count } = await admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "admin");
        const { data: target } = await admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
        if (target?.role === "admin" && (count ?? 0) <= 1) return reply({ error: "Cannot demote the last admin" }, 409);
      }
      const { error } = await admin.from("user_roles").update({ role }).eq("user_id", userId);
      if (error) throw error;
      return reply({ success: true });
    }

    if (action === "delete") {
      const userId = String(body.user_id ?? "");
      if (!userId || userId === authData.user.id) return reply({ error: "Invalid target; cannot delete your own account" }, 400);
      const { data: target } = await admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
      if (target?.role === "admin") {
        const { count } = await admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "admin");
        if ((count ?? 0) <= 1) return reply({ error: "Cannot delete the last admin" }, 409);
      }
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
      return reply({ success: true });
    }
    return reply({ error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("admin-users error", error);
    return reply({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }

  function reply(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), { status, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
