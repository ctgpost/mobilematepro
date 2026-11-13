import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Map of postgres tables -> related react-query keys to invalidate on change.
const TABLE_TO_KEYS: Record<string, string[][]> = {
  products: [["products"], ["dashboard"], ["stock-sync"], ["stock-movements"]],
  sales: [["sales"], ["dashboard"], ["due-sales"], ["staff-performance"]],
  sale_items: [["sales"], ["dashboard"], ["sale-items"]],
  customers: [["customers"], ["dashboard"]],
  suppliers: [["suppliers"]],
  categories: [["categories"]],
  due_payments: [["due-payments"], ["sales"], ["dashboard"]],
  returns: [["returns"], ["dashboard"]],
  supplier_returns: [["supplier-returns"], ["dashboard"]],
  customer_ledger_entries: [["customer-ledger"], ["customers"]],
  investment_entries: [["investments"], ["investment-entries"]],
  investment_incomes: [["investments"], ["investment-incomes"]],
  investment_sectors: [["investment-sectors"], ["investments"]],
  activity_logs: [["activity-logs"]],
  shop_settings: [["shop-settings"], ["shop_settings"]],
  user_roles: [["user-roles"], ["users"]],
  profiles: [["profiles"], ["users"]],
  return_audit_logs: [["return-audit"]],
};

/**
 * Subscribes to all main tables and invalidates relevant queries
 * so every page reflects realtime data without manual refresh.
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase.channel("global-realtime-sync");

    Object.entries(TABLE_TO_KEYS).forEach(([table, keys]) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          keys.forEach((key) => {
            queryClient.invalidateQueries({ queryKey: key });
          });
        }
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
