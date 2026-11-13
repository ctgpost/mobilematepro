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

const REQUIRED_FIELDS: Partial<Record<TableKey, string[]>> = {
  products: ["name", "price", "stock_quantity"], categories: ["name"],
  customers: ["name"], suppliers: ["name"], sales: ["user_id", "total_amount"],
  sale_items: ["sale_id", "product_id", "quantity", "unit_price", "total_price"],
  due_payments: ["sale_id", "amount"],
  returns: ["sale_id", "sale_item_id", "product_id", "quantity", "refund_amount", "reason_code"],
  supplier_returns: ["product_id", "quantity", "return_amount"],
  customer_ledger_entries: ["customer_id", "amount", "entry_type"],
  investment_entries: ["sector_id", "amount", "entry_type"],
  investment_incomes: ["sector_id", "amount"], investment_sectors: ["name"],
  activity_logs: ["action", "action_type"], shop_settings: ["shop_name"],
};
const NUMERIC_FIELDS = new Set([
  "price","cost","stock_quantity","quantity","unit_price","total_price","total_amount",
  "paid_amount","due_amount","amount","refund_amount","return_amount","due_adjusted",
  "cash_refunded","customer_credit",
]);
function validateRestoreRows(key: TableKey, rows: any[]): void {
  if (!Array.isArray(rows)) throw new Error(`${key}: JSON root must be an array`);
  const ids = new Set<string>();
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`${key}: record ${index + 1} is not an object`);
    for (const field of REQUIRED_FIELDS[key] || []) {
      if (row[field] === undefined || row[field] === null || row[field] === "") throw new Error(`${key}: record ${index + 1} missing '${field}'`);
    }
    if (row.id != null) {
      if (typeof row.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id)) throw new Error(`${key}: invalid UUID at record ${index + 1}`);
      if (ids.has(row.id)) throw new Error(`${key}: duplicate id ${row.id}`);
      ids.add(row.id);
    }
    for (const [field, value] of Object.entries(row)) {
      if (NUMERIC_FIELDS.has(field) && value != null && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`${key}: field '${field}' must be a finite number at record ${index + 1}`);
    }
  });
}
async function readTableJson(zip: JSZip, key: TableKey): Promise<any[]> {
  const file = zip.file(`json/${key}.json`);
  if (!file) throw new Error(`Backup is missing json/${key}.json`);
  let parsed: unknown;
  try { parsed = JSON.parse(await file.async("string")); }
  catch (error: any) { throw new Error(`${key}: invalid JSON: ${error?.message || "parse error"}`); }
  if (!Array.isArray(parsed)) throw new Error(`${key}: JSON root must be an array`);
  validateRestoreRows(key, parsed);
  return parsed;
}
/**
 * Inspect a ZIP before allowing a restore. Invalid table files fail the analysis.
 */
export async function analyzeBackup(zip: JSZip): Promise<BackupAnalysis> {
  const present: { table: TableKey; count: number }[] = [];
  const missing: TableKey[] = [];
  for (const table of ALL_TABLES) {
    if (!zip.file(`json/${table.key}.json`)) {
      missing.push(table.key);
      continue;
    }
    const rows = await readTableJson(zip, table.key);
    present.push({ table: table.key, count: rows.length });
  }
  return { present, missing };
}

/**
 * Restore selected tables only after validating their complete JSON payload.
 * Existing-ID lookup failures are fatal for that table, never treated as inserts.
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
      if (!ALL_TABLES.some((table) => table.key === key)) throw new Error("Unsupported restore table");
      const rows = await readTableJson(zip, key);
      if (!rows.length) {
        results.push({ table: key, inserted: 0, updated: 0, processed: 0 });
        continue;
      }
      const ids = rows.map((row) => row.id).filter(Boolean);
      const existing = new Set<string>();
      for (let i = 0; i < ids.length; i += 500) {
        const { data, error } = await supabase.from(key as any).select("id").in("id", ids.slice(i, i + 500));
        if (error) throw new Error(`Existing ID lookup failed for ${key}: ${error.message}`);
        for (const row of (data as any[]) || []) existing.add(row.id);
      }
      let processed = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from(key as any).upsert(rows.slice(i, i + 200) as any, { onConflict: "id" });
        if (error) throw error;
        processed += Math.min(200, rows.length - i);
      }
      const updated = rows.filter((row) => row.id && existing.has(row.id)).length;
      results.push({ table: key, inserted: processed - updated, updated, processed });
    } catch (error: any) {
      results.push({ table: key, inserted: 0, updated: 0, processed: 0, error: error?.message || "Restore failed" });
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
    const { data: { user } } = await supabase.auth.getUser();
    const total = args.results.reduce((sum, row) => sum + row.processed, 0);
    const success = args.results.length > 0 && args.results.every((row) => !row.error);
    const { error } = await supabase.from("restore_history" as any).insert({
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      source_url: args.source_url,
      source_filename: args.source_filename,
      tables: args.tables as unknown as string[],
      results: args.results as any,
      total_processed: total,
      pre_backup_url: args.pre_backup_url ?? null,
      success,
      error: args.error ?? null,
    });
    if (error) console.warn("logRestoreRun failed", error.message);
  } catch (error) {
    console.warn("logRestoreRun failed", error);
  }
}

const ALL_TABLE_KEYS: string[] = ALL_TABLES.map((table) => table.key);
const TABLE_FINGERPRINTS: { table: TableKey; required: string[]; score?: number }[] = [
  { table: "sale_items", required: ["sale_id", "product_id", "quantity"], score: 5 },
  { table: "sales", required: ["total_amount", "paid_amount"], score: 4 },
  { table: "returns", required: ["sale_id", "refund_amount", "sale_item_id"], score: 4 },
  { table: "supplier_returns", required: ["supplier_id", "return_amount"], score: 4 },
  { table: "due_payments", required: ["sale_id", "amount"], score: 3 },
  { table: "customer_ledger_entries", required: ["customer_id", "amount", "entry_type"], score: 3 },
  { table: "investment_incomes", required: ["sector_id", "income_date"], score: 4 },
  { table: "investment_entries", required: ["sector_id", "entry_date"], score: 4 },
  { table: "investment_sectors", required: ["name"], score: 2 },
  { table: "products", required: ["name", "price", "stock_quantity"], score: 3 },
  { table: "customers", required: ["name", "phone"], score: 2 },
  { table: "suppliers", required: ["name", "phone"], score: 2 },
  { table: "categories", required: ["name"], score: 1 },
  { table: "activity_logs", required: ["action", "action_type"], score: 3 },
  { table: "shop_settings", required: ["shop_name"], score: 3 },
];
function inferTableFromFilename(filename: string): TableKey | null {
  const base = (filename || "").toLowerCase().replace(/\\.json$/, "");
  for (const key of ALL_TABLE_KEYS) {
    if (base === key || base.endsWith(`/${key}`) || base.endsWith(`_${key}`) || base.includes(key)) return key as TableKey;
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
  sourceFiles?: string[];
  sampleRow?: any;
}

export interface JsonAnalysis {
  groups: JsonGroup[];
  unknown: { rows: any[] }; // rows we couldn't classify
  warnings: string[];
}

export interface PerFileAnalysis {
  file: string;
  size: number;
  analysis: JsonAnalysis;
  error?: string;
}

export interface MergedGroupPreview {
  table: TableKey;
  rows: any[];
  sources: string[]; // filenames contributing rows
  confidences: JsonGroup["confidence"][];
  sampleRow: any;
  willInsert: number;
  willUpdate: number;
  duplicateIds: number; // ids that appeared more than once across files
}

export interface MultiFileAnalysis {
  perFile: PerFileAnalysis[];
  merged: MergedGroupPreview[];
  unknown: { file: string; rows: any[] }[];
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
      validateRestoreRows(g.table, rows);
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
        if (error) throw new Error(`Existing ID lookup failed for ${g.table}: ${error.message}`);
        for (const r of (data as any[]) || []) existing.add(r.id);
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

/**
 * Parse many JSON files in parallel, classify rows per file, then merge groups
 * across files (same target table = one merged group). Finally, query the DB
 * to estimate how many rows will be inserted vs updated.
 */
export async function analyzeJsonFiles(files: File[]): Promise<MultiFileAnalysis> {
  const perFile: PerFileAnalysis[] = await Promise.all(
    files.map(async (f) => {
      try {
        const txt = await f.text();
        const parsed = JSON.parse(txt);
        return {
          file: f.name,
          size: f.size,
          analysis: analyzeJsonPayload(parsed, f.name),
        };
      } catch (e: any) {
        return {
          file: f.name,
          size: f.size,
          analysis: { groups: [], unknown: { rows: [] }, warnings: [] },
          error: e?.message || "পার্স ব্যর্থ",
        };
      }
    }),
  );

  // Merge per-table across files
  const mergedMap = new Map<TableKey, MergedGroupPreview>();
  const unknown: { file: string; rows: any[] }[] = [];
  const warnings: string[] = [];

  for (const pf of perFile) {
    if (pf.error) warnings.push(`${pf.file}: ${pf.error}`);
    for (const g of pf.analysis.groups) {
      const existing = mergedMap.get(g.table);
      if (existing) {
        // Detect duplicate ids being introduced by this file
        const existingIds = new Set(existing.rows.map((r) => r?.id).filter(Boolean));
        for (const r of g.rows) {
          if (r?.id && existingIds.has(r.id)) existing.duplicateIds += 1;
        }
        // Preserve duplicates so restore validation rejects ambiguous conflicting records.
        existing.rows.push(...g.rows);
        if (!existing.sources.includes(pf.file)) existing.sources.push(pf.file);
        existing.confidences.push(g.confidence);
      } else {
        mergedMap.set(g.table, {
          table: g.table,
          rows: [...g.rows],
          sources: [pf.file],
          confidences: [g.confidence],
          sampleRow: g.rows.find((r) => r && typeof r === "object") || g.rows[0],
          willInsert: 0,
          willUpdate: 0,
          duplicateIds: 0,
        });
      }
    }
    if (pf.analysis.unknown.rows.length) {
      unknown.push({ file: pf.file, rows: pf.analysis.unknown.rows });
    }
    for (const w of pf.analysis.warnings) {
      // de-dupe identical warnings across files
      const tagged = `${pf.file}: ${w}`;
      if (!warnings.includes(tagged)) warnings.push(tagged);
    }
  }

  const merged = Array.from(mergedMap.values());

  // DB lookup: existing ids per table → compute willInsert/willUpdate
  for (const m of merged) {
    const ids = m.rows.map((r) => r?.id).filter(Boolean);
    if (!ids.length) {
      m.willInsert = m.rows.length;
      m.willUpdate = 0;
      continue;
    }
    const existing = new Set<string>();
    const chunk = 500;
    for (let i = 0; i < ids.length; i += chunk) {
      const slice = ids.slice(i, i + chunk);
      const { data, error } = await supabase
        .from(m.table as any)
        .select("id")
        .in("id", slice);
      if (error) throw new Error(`Existing ID lookup failed for ${m.table}: ${error.message}`);
      for (const r of (data as any[]) || []) existing.add(r.id);
    }
    m.willUpdate = m.rows.filter((r) => r?.id && existing.has(r.id)).length;
    m.willInsert = m.rows.length - m.willUpdate;

    if (m.duplicateIds > 0) {
      warnings.push(
        `${m.table}: ${m.duplicateIds} টি একই id একাধিক ফাইলে — শেষ ফাইলেরটি প্রাধান্য পাবে`,
      );
    }
  }

  return { perFile, merged, unknown, warnings };
}
