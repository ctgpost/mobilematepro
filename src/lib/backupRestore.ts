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

// ============================================================
// Arbitrary-JSON restore: detect target table from any JSON shape
// ============================================================

/**
 * Field "fingerprints" used to infer which table a row belongs to when the
 * JSON doesn't carry table metadata or filename. The most specific markers
 * are listed first.
 */
const TABLE_FINGERPRINTS: { table: TableKey; required: string[]; score?: number }[] = [
  { table: "sale_items", required: ["sale_id", "product_id", "quantity"], score: 5 },
  { table: "purchase_items", required: ["purchase_id", "product_id", "quantity"] as any, score: 5 } as any,
  { table: "sales", required: ["total_amount", "paid_amount"], score: 4 },
  { table: "purchases", required: ["supplier_id", "total_amount"] as any, score: 4 } as any,
  { table: "returns", required: ["sale_id", "return_amount"], score: 4 },
  { table: "supplier_returns", required: ["supplier_id", "return_amount"], score: 4 },
  { table: "due_payments", required: ["sale_id", "amount"], score: 3 },
  { table: "customer_ledger_entries", required: ["customer_id", "entry_date"], score: 3 },
  { table: "investment_incomes", required: ["sector_id", "income_date"], score: 4 },
  { table: "investment_entries", required: ["sector_id", "entry_date"], score: 4 },
  { table: "investment_sectors", required: ["name", "target_amount"] as any, score: 2 } as any,
  { table: "products", required: ["name", "price", "stock_quantity"], score: 3 },
  { table: "customers", required: ["name", "phone"], score: 2 },
  { table: "suppliers", required: ["name", "phone"], score: 2 },
  { table: "categories", required: ["name"], score: 1 },
  { table: "activity_logs", required: ["action", "entity_type"], score: 3 },
  { table: "shop_settings", required: ["shop_name"], score: 3 },
  { table: "profiles", required: ["email", "full_name"] as any, score: 2 } as any,
];

const ALL_TABLE_KEYS: string[] = ALL_TABLES.map((t) => t.key);

function inferTableFromFilename(filename: string): TableKey | null {
  const base = (filename || "").toLowerCase().replace(/\.json$/, "");
  // Exact match
  for (const k of ALL_TABLE_KEYS) {
    if (base === k || base.endsWith(`/${k}`) || base.endsWith(`_${k}`)) return k as TableKey;
  }
  // Contains
  for (const k of ALL_TABLE_KEYS) {
    if (base.includes(k)) return k as TableKey;
  }
  return null;
}

function inferTableFromRow(row: any): TableKey | null {
  if (!row || typeof row !== "object") return null;
  const keys = new Set(Object.keys(row));
  let best: { table: TableKey; score: number } | null = null;
  for (const fp of TABLE_FINGERPRINTS) {
    const matched = fp.required.every((r) => keys.has(r));
    if (!matched) continue;
    const score = (fp.score || 1) + fp.required.length;
    if (!best || score > best.score) best = { table: fp.table, score };
  }
  return best?.table ?? null;
}

export interface JsonGroup {
  table: TableKey;
  rows: any[];
  confidence: "filename" | "explicit" | "fingerprint" | "manual";
}

export interface JsonAnalysis {
  groups: JsonGroup[];
  unknown: { rows: any[] }; // rows we couldn't classify
  warnings: string[];
}

/**
 * Inspect any parsed JSON payload and group its rows by target table.
 * Supports these shapes:
 *   - Array of row objects
 *   - Single row object
 *   - { table: "products", rows: [...] }  OR  { table: "products", data: [...] }
 *   - { products: [...], sales: [...], ... }  (multi-table object)
 *   - { json: { products: [...] } }           (backup-manifest-ish nesting)
 */
export function analyzeJsonPayload(
  payload: any,
  filename = "",
): JsonAnalysis {
  const warnings: string[] = [];
  const groups: JsonGroup[] = [];
  const unknownRows: any[] = [];

  const pushGroup = (table: TableKey, rows: any[], confidence: JsonGroup["confidence"]) => {
    if (!rows.length) return;
    const existing = groups.find((g) => g.table === table);
    if (existing) existing.rows.push(...rows);
    else groups.push({ table, rows, confidence });
  };

  const classifyArray = (arr: any[], hintTable: TableKey | null) => {
    if (hintTable) {
      pushGroup(hintTable, arr, "filename");
      return;
    }
    // Try to fingerprint a sample row
    const sample = arr.find((r) => r && typeof r === "object") || arr[0];
    const guess = inferTableFromRow(sample);
    if (guess) {
      pushGroup(guess, arr, "fingerprint");
    } else {
      unknownRows.push(...arr);
    }
  };

  if (Array.isArray(payload)) {
    classifyArray(payload, inferTableFromFilename(filename));
  } else if (payload && typeof payload === "object") {
    // { table, rows | data }
    if (typeof payload.table === "string" && ALL_TABLE_KEYS.includes(payload.table)) {
      const rows = Array.isArray(payload.rows)
        ? payload.rows
        : Array.isArray(payload.data)
          ? payload.data
          : [];
      pushGroup(payload.table as TableKey, rows, "explicit");
    } else {
      // Multi-table object: any top-level key matching a table name
      const tableLikeKeys = Object.keys(payload).filter((k) =>
        ALL_TABLE_KEYS.includes(k) && Array.isArray(payload[k]),
      );
      if (tableLikeKeys.length) {
        for (const k of tableLikeKeys) {
          pushGroup(k as TableKey, payload[k], "explicit");
        }
        // Also check nested "json"/"tables" containers
      } else if (payload.json && typeof payload.json === "object") {
        return analyzeJsonPayload(payload.json, filename);
      } else if (payload.tables && typeof payload.tables === "object") {
        return analyzeJsonPayload(payload.tables, filename);
      } else {
        // Treat as a single row
        const hint = inferTableFromFilename(filename) || inferTableFromRow(payload);
        if (hint) pushGroup(hint, [payload], hint ? "fingerprint" : "manual");
        else unknownRows.push(payload);
      }
    }
  } else {
    warnings.push("সাপোর্টেড JSON অবজেক্ট বা অ্যারে পাওয়া যায়নি");
  }

  if (unknownRows.length) {
    warnings.push(`${unknownRows.length} টি রেকর্ড কোন টেবিলের সাথে মেলেনি — ম্যানুয়ালি টেবিল বেছে দিন`);
  }

  return { groups, unknown: { rows: unknownRows }, warnings };
}

/**
 * Upsert pre-classified groups into Supabase. Each group's rows are upserted
 * on its target table using `id` as conflict key (rows without id are inserted).
 */
export async function restoreFromJsonGroups(
  groups: JsonGroup[],
  opts: { onProgress?: (msg: string) => void } = {},
): Promise<RestoreResult[]> {
  const results: RestoreResult[] = [];
  for (const g of groups) {
    opts.onProgress?.(`${g.table} পুনরুদ্ধার হচ্ছে... (${g.rows.length})`);
    try {
      const rows = g.rows;
      if (!rows.length) {
        results.push({ table: g.table, inserted: 0, updated: 0, processed: 0 });
        continue;
      }

      // Existing-id detection (only for rows that have an id)
      const ids = rows.map((r) => r?.id).filter(Boolean);
      const existing = new Set<string>();
      const idChunk = 500;
      for (let i = 0; i < ids.length; i += idChunk) {
        const slice = ids.slice(i, i + idChunk);
        const { data, error } = await supabase
          .from(g.table as any)
          .select("id")
          .in("id", slice);
        if (!error && data) {
          for (const r of data as any[]) existing.add(r.id);
        }
      }

      const chunkSize = 200;
      let processed = 0;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase
          .from(g.table as any)
          .upsert(chunk as any, { onConflict: "id" });
        if (error) throw error;
        processed += chunk.length;
      }

      const updated = rows.filter((r) => r?.id && existing.has(r.id)).length;
      const inserted = processed - updated;
      results.push({ table: g.table, inserted, updated, processed });
    } catch (e: any) {
      console.error(`restore ${g.table} (json) failed`, e);
      results.push({
        table: g.table,
        inserted: 0,
        updated: 0,
        processed: 0,
        error: e?.message || "ব্যর্থ",
      });
    }
  }
  return results;
}

/**
 * Convenience: read a File (any .json) and analyze it.
 */
export async function analyzeJsonFile(file: File): Promise<JsonAnalysis & { raw: any }> {
  const txt = await file.text();
  let parsed: any;
  try {
    parsed = JSON.parse(txt);
  } catch (e: any) {
    throw new Error("JSON পার্স করা গেল না: " + (e?.message || "invalid JSON"));
  }
  const a = analyzeJsonPayload(parsed, file.name);
  return { ...a, raw: parsed };
}
