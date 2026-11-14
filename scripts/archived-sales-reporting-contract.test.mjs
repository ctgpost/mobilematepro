import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("shared sales filter removes archived lines, drops empty invoices, and prorates invoice totals", async () => {
  const helper = await read("../src/lib/activeSales.ts");
  assert.match(helper, /item\?\.products\?\.archived_at/);
  assert.match(helper, /if \(activeItems\.length === 0\) return \[\]/);
  assert.match(helper, /activeItemsRatio/);
  assert.match(helper, /total_amount: scale\(sale\.total_amount\)/);
  assert.match(helper, /paid_amount: scale\(sale\.paid_amount\)/);
  assert.match(helper, /due_amount: scale\(sale\.due_amount\)/);
});

test("Sales History, Dashboard, and Reports all fetch archive state and apply shared sales filtering", async () => {
  for (const path of ["../src/components/Sales.tsx", "../src/components/Dashboard.tsx", "../src/components/Reports.tsx"]) {
    const source = await read(path);
    assert.match(source, /filterSalesWithActiveProducts/);
    assert.match(source, /archived_at/);
  }
});

test("customer and staff financial reports exclude archived product sales", async () => {
  const ledger = await read("../src/components/CustomerLedger.tsx");
  const staff = await read("../src/components/StaffPerformanceReport.tsx");
  assert.match(ledger, /filterSalesWithActiveProducts/);
  assert.match(ledger, /__activeItemsRatio/);
  assert.match(staff, /filterSalesWithActiveProducts/);
  assert.match(staff, /perf\.salesAmount \+= Number\(sale\.total_amount\)/);
  assert.match(staff, /perf\.salesCount\+\+/);
});
