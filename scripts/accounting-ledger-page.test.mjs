import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("accounting ledger page provides account-level trial balance and journal drilldown", async () => {
  const page = await read("../src/components/AccountingLedger.tsx");
  assert.match(page, /accounting_accounts/);
  assert.match(page, /accounting_journal_entries/);
  assert.match(page, /accounting_journal_lines/);
  assert.match(page, /Trial Balance/);
  assert.match(page, /Journal Register/);
  assert.match(page, /selectedAccount/);
  assert.match(page, /selectedJournal/);
  assert.match(page, /source_id/);
});

test("accounting ledger is reachable from report-authorized navigation", async () => {
  const page = await read("../src/pages/Index.tsx");
  assert.match(page, /AccountingLedger/);
  assert.match(page, /accounting-ledger/);
  assert.match(page, /canAccessReports/);
});

test("accounting ledger clearly warns that unposted sources and opening balances are excluded", async () => {
  const page = await read("../src/components/AccountingLedger.tsx");
  assert.match(page, /Opening balances are not included yet/);
  assert.match(page, /Sales, purchases, returns, collections, supplier payments and investment movements/);
});
