import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("IMEI lifecycle migration creates a unique per-device registry and append-only event log", async () => {
  const sql = await read("../supabase/migrations/20261113000500_imei_360_lifecycle.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.imei_registry/i);
  assert.match(sql, /imei text NOT NULL UNIQUE/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.imei_lifecycle_events/i);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE UPDATE, DELETE ON public\.imei_lifecycle_events FROM authenticated/i);
  assert.match(sql, /register_imei_device/i);
  assert.match(sql, /record_imei_lifecycle_event/i);
  assert.match(sql, /ALTER TABLE public\.sale_items ADD COLUMN IF NOT EXISTS imei/i);
  assert.match(sql, /ALTER TABLE public\.returns ADD COLUMN IF NOT EXISTS imei/i);
});

test("IMEI lifecycle captures sale and completed return references without guessing bulk IMEIs", async () => {
  const sql = await read("../supabase/migrations/20261113000500_imei_360_lifecycle.sql");
  assert.match(sql, /IF NEW\.quantity <> 1 THEN[\s\S]*?RETURN NEW/i);
  assert.match(sql, /AFTER INSERT ON public\.sale_items/i);
  assert.match(sql, /AFTER UPDATE OF status ON public\.returns/i);
  assert.match(sql, /'sale', NEW\.sale_id/i);
  assert.match(sql, /'return', NEW\.id/i);
  assert.match(sql, /IMEI belongs to a different product/i);
  assert.match(sql, /COALESCE\(NEW\.imei, v_product\.imei\)/i);
});

test("IMEI lifecycle popup is available from the application header and searches barcode/IMEI", async () => {
  const header = await read("../src/components/PageHeader.tsx");
  const component = await read("../src/components/ImeiLifecycle.tsx");
  assert.match(header, /<ImeiLifecycle\s*\/>/);
  assert.match(component, /eq\("imei"/);
  assert.match(component, /eq\("barcode"/);
  assert.match(component, /<BarcodeScanner/);
  assert.match(component, /imei-lifecycle-timeline/);
  assert.match(component, /purchase_items/);
  assert.match(component, /from\("returns"\)/);
  const pos = await read("../src/components/POS.tsx");
  assert.match(pos, /imei: item\.imei \|\| null/);
  assert.match(pos, /IMEI ট্র্যাক করা ডিভাইস বিক্রির জন্য অনলাইন সংযোগ/);
});
