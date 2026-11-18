import test from "node:test";
import assert from "node:assert/strict";
import { calculateGrossProfit } from "../src/lib/financialCalculations.mjs";

test("gross profit uses immutable item cost and subtracts only completed returns", () => {
  const result = calculateGrossProfit({
    sales: [{ id: "s1", total_amount: 1000, sale_items: [{ id: "i1", quantity: 2 }] }],
    returns: [
      { sale_item_id: "i1", quantity: 1, refund_amount: 400, status: "completed" },
      { sale_item_id: "i1", quantity: 1, refund_amount: 400, status: "pending" },
    ],
    saleCostHistory: [{ source_key: "sale-item:i1", unit_cost: 300 }],
  });
  assert.equal(result.grossRevenue, 1000);
  assert.equal(result.refunds, 400);
  assert.equal(result.netRevenue, 600);
  assert.equal(result.soldCogs, 600);
  assert.equal(result.returnedCogs, 300);
  assert.equal(result.netCogs, 300);
  assert.equal(result.grossProfit, 300);
  assert.equal(result.isCostComplete, true);
});

test("archived products do not affect financial totals and missing historical costs are explicit", () => {
  const result = calculateGrossProfit({
    sales: [{ id: "s1", total_amount: 500, sale_items: [{ id: "archived-item", quantity: 1 }] }],
    returns: [],
    saleCostHistory: [],
  });
  assert.equal(result.grossRevenue, 500);
  assert.equal(result.grossProfit, 500);
  assert.equal(result.missingCostLines, 1);
  assert.equal(result.isCostComplete, false);
});

test("return cost reversal is capped at sold quantity", () => {
  const result = calculateGrossProfit({
    sales: [{ id: "s1", total_amount: 500, sale_items: [{ id: "i1", quantity: 1 }] }],
    returns: [{ sale_item_id: "i1", quantity: 3, refund_amount: 500, status: "completed" }],
    saleCostHistory: [{ source_key: "sale-item:i1", unit_cost: 200 }],
  });
  assert.equal(result.returnedCogs, 200);
  assert.equal(result.netCogs, 0);
});
