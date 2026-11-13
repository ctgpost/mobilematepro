import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("return settlement is guarded by row locks and one database function", async () => {
  const sql = await read("../supabase/migrations/20261113000400_atomic_returns.sql");
  assert.match(sql, /FROM public\.returns WHERE id = p_return_id FOR UPDATE/i);
  assert.match(sql, /FROM public\.sales WHERE id = v_return\.sale_id FOR UPDATE/i);
  assert.match(sql, /UPDATE public\.products[\s\S]*last_stock_reason = 'return'/i);
  assert.match(sql, /INSERT INTO public\.return_audit_logs/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.process_return_atomic/i);
});

test("completed returns cannot be deleted through the UI RPC", async () => {
  const sql = await read("../supabase/migrations/20261113000400_atomic_returns.sql");
  assert.match(sql, /v_return\.status NOT IN \('pending','rejected'\)/);
  assert.match(sql, /Approved or completed returns cannot be deleted/);
});

test("backup restore rejects malformed JSON and duplicate ids", async () => {
  const source = await read("../src/lib/backupRestore.ts");
  assert.match(source, /JSON root must be an array/);
  assert.match(source, /duplicate id/);
  assert.match(source, /Existing ID lookup failed/);
  assert.match(source, /validateRestoreRows\(g\.table, rows\)/);
});

test("offline outbox is scoped to its owning authenticated user", async () => {
  const db = await read("../src/lib/offlineDB.ts");
  const sync = await read("../src/lib/offlineMutate.ts");
  assert.match(db, /userId: string/);
  assert.match(db, /filter\(\(item\) => item\.userId === userId\)/);
  assert.match(sync, /item\.userId !== session\.user\.id/);
});
