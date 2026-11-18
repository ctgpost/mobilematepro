import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("expense schema uses categories, positive amounts, paid amount bounds and immutable journal source keys", async () => {
  const sql = await read("../supabase/migrations/20261118000300_expense_management_accounting_ledger.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.expenses/);
  assert.match(sql, /CHECK \(amount > 0\)/);
  assert.match(sql, /CHECK \(paid_amount <= amount\)/);
  assert.match(sql, /UNIQUE \(source_type, source_id\)/);
  assert.match(sql, /accounting_journal_lines/);
});

test("expense RPC posts balanced debit and credit lines atomically and restricts roles", async () => {
  const sql = await read("../supabase/migrations/20261118000300_expense_management_accounting_ledger.sql");
  assert.match(sql, /create_expense_atomic\(p_expense jsonb\)/);
  assert.match(sql, /Only admin or manager can record expenses/);
  assert.match(sql, /VALUES\(v_journal_id,v_expense_account\.id,1,v_amount,0/);
  assert.match(sql, /VALUES\(v_journal_id,v_cash_account\.id,2,0,v_paid/);
  assert.match(sql, /'Unpaid expense payable'/);
  assert.match(sql, /SECURITY INVOKER/);
});

test("expense cancellation preserves the original and posts a reversal journal", async () => {
  const sql = await read("../supabase/migrations/20261118000300_expense_management_accounting_ledger.sql");
  assert.match(sql, /void_expense_atomic/);
  assert.match(sql, /is_reversal,reversal_of/);
  assert.match(sql, /SELECT v_reversal_id,account_id,line_number,credit,debit/);
  assert.match(sql, /voided_at=now\(\)/);
});

test("expense page uses atomic RPCs and does not hard-delete posted records", async () => {
  const page = await read("../src/components/Expenses.tsx");
  assert.match(page, /create_expense_atomic/);
  assert.match(page, /void_expense_atomic/);
  assert.match(page, /বিপরীত হিসাব পোস্ট/);
  assert.doesNotMatch(page, /\.from\(["']expenses["']\)\.delete/);
});

test("expense menu permission is restricted to admin and manager", async () => {
  const roles = await read("../src/hooks/useUserRole.ts");
  const page = await read("../src/pages/Index.tsx");
  assert.match(roles, /admin:[\s\S]*?canManageExpenses: true/);
  assert.match(roles, /manager:[\s\S]*?canManageExpenses: true/);
  assert.match(roles, /staff:[\s\S]*?canManageExpenses: false/);
  assert.match(page, /canManageExpenses/);
});

test("reports subtract recorded operating expenses and add investment income in the selected period", async () => {
  const report = await read("../src/components/Reports.tsx");
  assert.match(report, /fetchAll<any>\("accounting_journal_entries"/);
  assert.match(report, /fetchAll<any>\("investment_incomes"/);
  assert.match(report, /accounting_journal_lines/);
  assert.match(report, /account_code \|\| ""/);
  assert.match(report, /profit\.isCostComplete \? Number\(profit\.grossProfit\) - operatingExpenses \+ investmentIncome/);
  assert.match(report, /Net Profit \(Known Items\)/);
});
