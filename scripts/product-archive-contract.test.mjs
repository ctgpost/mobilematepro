import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("product archive migration preserves product rows and blocks archived products from sale items", async () => {
  const sql = await read("../supabase/migrations/20261114000300_product_archive_soft_delete.sql");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS archived_at timestamptz/i);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF product_id\s+ON public\.sale_items/i);
  assert.match(sql, /Archived products cannot be sold/i);
  assert.match(sql, /SECURITY INVOKER/i);
  assert.doesNotMatch(sql, /DELETE FROM public\.products|ON DELETE CASCADE/i);
});

test("Products screen archives and restores instead of deleting product rows", async () => {
  const products = await read("../src/components/Products.tsx");
  assert.match(products, /values: \{ archived_at: new Date\(\)\.toISOString\(\) \}/);
  assert.match(products, /values: \{ archived_at: null \}/);
  assert.match(products, /showArchivedProducts/);
  assert.match(products, /প্রোডাক্ট Restore করুন/);
  assert.doesNotMatch(products, /offlineMutate\("products", "delete"/);
});

test("POS excludes archived products and the database remains the final sale guard", async () => {
  const pos = await read("../src/components/POS.tsx");
  assert.match(pos, /is\("archived_at", null\)/);
  const sql = await read("../supabase/migrations/20261114000300_product_archive_soft_delete.sql");
  assert.match(sql, /CREATE TRIGGER trg_reject_archived_product_sale/i);
});
