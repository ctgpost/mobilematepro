import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("due collection selects sale item product archive marker and normalizes active sales", async () => {
  const source = await readFile(new URL("../src/components/DueCollectionPage.tsx", import.meta.url), "utf8");
  assert.match(source, /filterSalesWithActiveProducts/);
  assert.match(source, /sale_items\(total_price, products\(archived_at\)\)/);
  assert.match(source, /const activeSales = filterSalesWithActiveProducts\(sales\)/);
  assert.match(source, /activeSales\.filter/);
});

test("investment entries and incomes reject invalid or non-positive amounts", async () => {
  const source = await readFile(new URL("../src/components/Investments.tsx", import.meta.url), "utf8");
  assert.match(source, /Number\.isFinite\(amount\) \|\| amount <= 0/);
  assert.match(source, /বিনিয়োগ খাত নির্বাচন করুন/);
  assert.match(source, /আয়ের পরিমাণ শূন্যের বেশি হতে হবে/);
});
