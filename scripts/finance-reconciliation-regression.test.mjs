import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(p, import.meta.url), "utf8");

test("supplier returns use atomic RPCs and cannot edit returned quantity", async () => {
  const src = await read("../src/components/Suppliers.tsx");
  assert.match(src, /create_supplier_return_atomic/);
  assert.match(src, /delete_supplier_return_atomic/);
  assert.doesNotMatch(src, /supplier_returns\(\)\.update\(\{\s*quantity:/);
  const migration = await read("../supabase/migrations/20261115000100_atomic_supplier_returns.sql");
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /stock_quantity=stock_quantity-p_quantity/);
  assert.match(migration, /stock_quantity=stock_quantity\+v_return.quantity/);
});

test("investment withdrawal creation is guarded by locked sector balance RPC", async () => {
  const src = await read("../src/components/Investments.tsx");
  assert.match(src, /create_investment_withdrawal_atomic/);
  const migration = await read("../supabase/migrations/20261115000200_atomic_investment_withdrawal.sql");
  assert.match(migration, /investment_sectors WHERE id=p_sector_id FOR UPDATE/);
  assert.match(migration, /p_amount > v_balance/);
});

test("reconciliation distinguishes completed refund allocations from pending returns", async () => {
  const src = await read("../src/components/returns/ReconciliationReport.tsx");
  assert.match(src, /r\.status === "completed"/);
  assert.match(src, /settlementMismatchCount/);
  assert.match(src, /pendingReturns/);
  const returns = await read("../src/components/Returns.tsx");
  assert.match(returns, /filteredReturns\.filter\(\(r\) => r\.status === "completed"\)/);
});
