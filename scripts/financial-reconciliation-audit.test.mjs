import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("financial reports preserve original archived-product invoices and use historical cost snapshots", async () => {
  const reports = await read("../src/components/Reports.tsx");
  assert.doesNotMatch(reports, /filterSalesWithActiveProducts/);
  assert.match(reports, /calculateGrossProfit/);
  assert.match(reports, /product_transaction_history/);
  assert.match(reports, /sale_item_id, quantity, refund_amount, created_at, status/);
});

test("dashboard and due collection do not prorate or hide archived invoice balances", async () => {
  const dashboard = await read("../src/components/Dashboard.tsx");
  const duePage = await read("../src/components/DueCollectionPage.tsx");
  assert.doesNotMatch(dashboard, /filterSalesWithActiveProducts|activeSaleRatios/);
  assert.doesNotMatch(duePage, /filterSalesWithActiveProducts|activeSales/);
});

test("customer ledger does not double-count due payments already included in paid_amount", async () => {
  const ledger = await read("../src/components/CustomerLedger.tsx");
  assert.match(ledger, /collectedBySale/);
  assert.match(ledger, /paid_amount[\s\S]*collectedBySale/);
  assert.match(ledger, /credit: initialPayment/);
  assert.doesNotMatch(ledger, /__activeItemsRatio/);
});

test("supplier reconciliation excludes legacy purchase rows with unknown payment status", async () => {
  const report = await read("../src/components/returns/ReconciliationReport.tsx");
  assert.match(report, /transaction_type !== "historical_purchase"/);
});

test("investment dashboard labels income yield as ROI rather than accounting profit", async () => {
  const investments = await read("../src/components/Investments.tsx");
  assert.match(investments, /grandIncomeRate/);
  assert.match(investments, /আয়ের হার/);
  assert.doesNotMatch(investments, /grandProfit|s\.profit/);
});
