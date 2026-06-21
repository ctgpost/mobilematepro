import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { ALL_TABLES, TableKey } from "./backupExport";

export interface RestoreResult {
  table: TableKey;
  inserted: number;
  updated: number;
  processed: number;
  error?: string;
}

export interface BackupAnalysis {
  present: { table: TableKey; count: number }[];
  missing: TableKey[]; // expected but not in zip (relative to ALL_TABLES)
}

/**
 * Download a backup ZIP from a public Cloudinary URL.
 */
export async function fetchBackupZip(url: string): Promise<JSZip> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ব্যাকআপ ডাউনলোড ব্যর্থ: ${res.status}`);
  const buf = await res.arrayBuffer();
  return await JSZip.loadAsync(buf);
}

export async function listBackupTables(zip: JSZip): Promise<TableKey[]> {
  const tables: TableKey[] = [];
  for (const t of ALL_TABLES) {
    if (zip.file(`json/${t.key}.json`)) tables.push(t.key);
  }
  return tables;
}

async function readTableJson(zip: JSZip, key: TableKey): Promise<any[]> {
  const f = zip.file(`json/${key}.json`);
  if (!f) return [];
  const txt = await f.async("string");
  try {
    const arr = JSON.parse(txt);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Inspect a backup ZIP: returns per-table counts and any missing standard tables.
 */
export async function analyzeBackup(zip: JSZip): Promise<BackupAnalysis> {
  const present: { table: TableKey; count: number }[] = [];
  const missing: TableKey[] = [];
  for (const t of ALL_TABLES) {
    const f = zip.file(`json/${t.key}.json`);
    if (!f) {
      missing.push(t.key);
      continue;
    }
    try {
      const txt = await f.async("string");
      const arr = JSON.parse(txt);
      present.push({ table: t.key, count: Array.isArray(arr) ? arr.length : 0 });
    } catch {
      present.push({ table: t.key, count: 0 });
    }
  }
  return { present, missing };
}

/**
 * Restore selected tables from the ZIP into the database.
 * Tracks inserted vs updated by checking existing ids first.
 */
export async function restoreFromZip(
  zip: JSZip,
  tables: TableKey[],
  opts: { onProgress?: (msg: string) => void } = {},
): Promise<RestoreResult[]> {
  const results: RestoreResult[] = [];
  for (const key of tables) {
    opts.onProgress?.(`${key} পুনরুদ্ধার হচ্ছে...`);
    try {
      const rows = await readTableJson(zip, key);
      if (rows.length === 0) {
        results.push({ table: key, inserted: 0, updated: 0, processed: 0 });
        continue;
      }

      // Determine existing ids to split inserted vs updated
      const ids = rows.map((r) => r.id).filter(Boolean);
      const existing = new Set<string>();
      const idChunk = 500;
      for (let i = 0; i < ids.length; i += idChunk) {
        const slice = ids.slice(i, i + idChunk);
        const { data, error } = await supabase
          .from(key as any)
          .select("id")
          .in("id", slice);
        if (!error && data) {
          for (const r of data as any[]) existing.add(r.id);
        }
      }

      // Chunked upsert
      const chunkSize = 200;
      let processed = 0;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase
          .from(key as any)
          .upsert(chunk as any, { onConflict: "id" });
        if (error) throw error;
        processed += chunk.length;
      }

      const updated = rows.filter((r) => r.id && existing.has(r.id)).length;
      const inserted = processed - updated;
      results.push({ table: key, inserted, updated, processed });
    } catch (e: any) {
      console.error(`restore ${key} failed`, e);
      results.push({
        table: key,
        inserted: 0,
        updated: 0,
        processed: 0,
        error: e?.message || "ব্যর্থ",
      });
    }
  }
  return results;
}

export interface LogRestoreArgs {
  source_url: string;
  source_filename: string;
  tables: TableKey[];
  results: RestoreResult[];
  pre_backup_url?: string | null;
  error?: string | null;
}

export async function logRestoreRun(args: LogRestoreArgs): Promise<void> {
  try {
    const { data: u } = await supabase.auth.getUser();
    const total = args.results.reduce((s, r) => s + r.processed, 0);
    const success =
      args.results.length > 0 && args.results.every((r) => !r.error);
    await supabase.from("restore_history" as any).insert({
      user_id: u?.user?.id ?? null,
      user_email: u?.user?.email ?? null,
      source_url: args.source_url,
      source_filename: args.source_filename,
      tables: args.tables as unknown as string[],
      results: args.results as any,
      total_processed: total,
      pre_backup_url: args.pre_backup_url ?? null,
      success,
      error: args.error ?? null,
    });
  } catch (e) {
    console.warn("logRestoreRun failed", e);
  }
}
