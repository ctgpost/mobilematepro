import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("IMEI device stock is constrained to zero or one", async () => {
  const sql = await read("../supabase/migrations/20261118000200_safe_imei_restore_and_single_unit_stock.sql");
  assert.match(sql, /stock_quantity,0\) NOT IN \(0,1\)/);
  assert.match(sql, /trg_enforce_single_imei_device_stock/);
});

test("safe restore is atomic, authenticated, and rejects active IMEI stock conflicts", async () => {
  const sql = await read("../supabase/migrations/20261118000200_safe_imei_restore_and_single_unit_stock.sql");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.restore_archived_product_safe/);
  assert.match(sql, /Authentication required/);
  assert.match(sql, /archived_at IS NULL/);
  assert.match(sql, /COALESCE\(stock_quantity,0\) > 0/);
  assert.match(sql, /IMEI % is already in stock/);
  assert.match(sql, /stock_quantity = CASE WHEN v_imei ~ '\^\[0-9\]\{15\}\$' THEN 0/);
  assert.match(sql, /INSERT INTO public\.imei_lifecycle_events/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.restore_archived_product_safe/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.restore_archived_product_safe\(uuid\) TO authenticated/);
});

test("product archive restore uses the atomic server function and blocks offline restore", async () => {
  const products = await read("../src/components/Products.tsx");
  assert.match(products, /supabase\.rpc\("restore_archived_product_safe"/);
  assert.match(products, /নিরাপদ Restore করতে ইন্টারনেট সংযোগ প্রয়োজন/);
  assert.match(products, /পুরোনো Stock স্বয়ংক্রিয়ভাবে ০ হবে/);
});
