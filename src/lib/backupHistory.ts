import { supabase } from "@/integrations/supabase/client";
import type { TableKey } from "./backupExport";

export interface LogBackupArgs {
  tables: TableKey[];
  counts: Record<string, number>;
  download_ok: boolean;
  cloud_ok: boolean;
  cloud_url?: string | null;
  filename?: string;
  trigger_type: "manual" | "auto";
  error?: string | null;
}

export async function logBackupRun(args: LogBackupArgs): Promise<void> {
  try {
    const { data: u } = await supabase.auth.getUser();
    const total = Object.values(args.counts).reduce((a, b) => a + Number(b || 0), 0);
    await supabase.from("backup_history").insert({
      user_id: u?.user?.id ?? null,
      user_email: u?.user?.email ?? null,
      tables: args.tables as unknown as string[],
      counts: args.counts as any,
      total_records: total,
      download_ok: args.download_ok,
      cloud_ok: args.cloud_ok,
      cloud_url: args.cloud_url ?? null,
      filename: args.filename ?? null,
      trigger_type: args.trigger_type,
      error: args.error ?? null,
    });
  } catch (e) {
    console.warn("logBackupRun failed", e);
  }
}
