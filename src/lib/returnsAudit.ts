import { supabase } from "@/integrations/supabase/client";

export type ReturnAuditAction =
  | "created"
  | "approved"
  | "rejected"
  | "completed"
  | "deleted"
  | "updated";

export interface ReturnAuditPayload {
  return_type: "sales" | "supplier";
  return_id: string;
  action: ReturnAuditAction;
  product_id?: string | null;
  quantity?: number;
  stock_delta?: number; // +ve = stock increased (came back), -ve = stock decreased
  amount_delta?: number; // refund / recovery amount
  previous_status?: string | null;
  new_status?: string | null;
  notes?: Record<string, any>;
}

export async function logReturnAudit(payload: ReturnAuditPayload) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("return_audit_logs" as any).insert({
      ...payload,
      user_id: user?.id,
      user_email: user?.email,
    });
  } catch (err) {
    // never block primary mutation on audit failure
    // eslint-disable-next-line no-console
    console.error("[returnsAudit] failed to write log", err);
  }
}

export async function fetchReturnAudit(return_type: "sales" | "supplier", return_id: string) {
  const { data, error } = await supabase
    .from("return_audit_logs" as any)
    .select("*")
    .eq("return_type", return_type)
    .eq("return_id", return_id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchAllReturnAudits(limit = 500) {
  const { data, error } = await supabase
    .from("return_audit_logs" as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
