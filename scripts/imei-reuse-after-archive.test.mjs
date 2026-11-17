import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("IMEI registry can be reassigned after archive, zero stock, or completed device sale", async () => {
  const sql = await read("../supabase/migrations/20261118000100_allow_archived_imei_reuse.sql");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.sync_product_imei_registry/i);
  assert.match(sql, /v_previous_product\.archived_at IS NULL/i);
  assert.match(sql, /COALESCE\(v_previous_product\.stock_quantity,0\) > 0/i);
  assert.match(sql, /v_registry\.status NOT IN \('sold','returned'\)/i);
  assert.match(sql, /SET product_id = NEW\.id/i);
  assert.match(sql, /previous_product_archived_at/i);
  assert.match(sql, /previous_product_stock/i);
  assert.match(sql, /INSERT INTO public\.imei_lifecycle_events/i);
});

test("product form duplicate guard only blocks active, non-archived in-stock IMEIs", async () => {
  const products = await read("../src/components/Products.tsx");
  assert.match(products, /\.is\("archived_at", null\)/);
  assert.match(products, /!p\.archived_at/);
  assert.match(products, /\.gt\("stock_quantity", 0\)/);
});
