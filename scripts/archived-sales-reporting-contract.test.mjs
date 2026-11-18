import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("legacy active-product filter remains isolated from financial reporting", async () => {
  const helper = await read("../src/lib/activeSales.ts");
  assert.match(helper, /filterSalesWithActiveProducts/);
  const financialScreens = [
    "../src/components/Sales.tsx",
    "../src/components/Dashboard.tsx",
    "../src/components/Reports.tsx",
    "../src/components/CustomerLedger.tsx",
    "../src/components/StaffPerformanceReport.tsx",
    "../src/components/DueCollectionPage.tsx",
  ];
  for (const path of financialScreens) {
    const source = await read(path);
    assert.doesNotMatch(source, /filterSalesWithActiveProducts|__activeItemsRatio/);
  }
});

test("sales, dashboard, reports, customer ledger and staff performance preserve original invoices", async () => {
  const sales = await read("../src/components/Sales.tsx");
  const dashboard = await read("../src/components/Dashboard.tsx");
  const reports = await read("../src/components/Reports.tsx");
  const ledger = await read("../src/components/CustomerLedger.tsx");
  const staff = await read("../src/components/StaffPerformanceReport.tsx");
  assert.match(sales, /sale_items: sale\.sale_items \|\| \[\]/);
  assert.match(dashboard, /await fetchAll<any>\("sales"/);
  assert.match(reports, /return rows;/);
  assert.match(ledger, /return rows;/);
  assert.match(staff, /return data \|\| \[\]/);
  assert.match(staff, /perf\.salesAmount \+= Number\(sale\.total_amount\)/);
  assert.match(staff, /perf\.salesCount\+\+/);
});
