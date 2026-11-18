import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("dashboard current inventory value section uses consistent Bangla labels", async () => {
  const source = await read("../src/components/Dashboard.tsx");
  const section = source.slice(source.indexOf("বর্তমান মজুতের ক্রয়মূল্য"), source.indexOf("প্রোডাক্ট অবস্থা বিশ্লেষণ"));
  assert.match(section, /নতুন মোবাইলের মজুতমূল্য/);
  assert.match(section, /ব্যবহৃত মোবাইলের মজুতমূল্য/);
  assert.match(section, /সর্বমোট মজুতমূল্য/);
  assert.doesNotMatch(section, /Current Stock|New Products|Used Products|প্রোডাক্ট শেয়ার/);
});

test("opening product dialogs closes every expanded product card first", async () => {
  const source = await read("../src/components/Products.tsx");
  assert.match(source, /const closeExpandedProductCards = \(\) => setExpandedProductCards\(\{\}\)/);
  assert.match(source, /const startEdit = \(product: any\) => \{\s*closeExpandedProductCards\(\)/);
  assert.match(source, /closeExpandedProductCards\(\);\s*setDetailProduct\(product\)/);
  assert.match(source, /closeExpandedProductCards\(\);\s*setHistoryProduct/);
  assert.match(source, /closeExpandedProductCards\(\);\s*setLabelProduct/);
});

test("profit and loss metrics expose source breakdown dialogs", async () => {
  const source = await read("../src/components/Reports.tsx");
  assert.match(source, /setDrilldownMetric\(item.key\)/);
  assert.match(source, /<Dialog open=\{!!drilldownMetric\}/);
  assert.match(source, /saleCostHistory/);
  assert.match(source, /accounting_journal_lines/);
  assert.match(source, /Income record/);
});

test("reports do not present gross or net profit as final when cost snapshots are missing", async () => {
  const calculations = await read("../src/lib/financialCalculations.mjs");
  const reports = await read("../src/components/Reports.tsx");
  assert.match(calculations, /grossProfit: isCostComplete \? knownGrossProfit : null/);
  assert.match(reports, /profit\.isCostComplete \? profit\.grossProfit : null/);
  assert.match(reports, /netProfitBeforeOtherAdjustments = profit\.isCostComplete/);
});
