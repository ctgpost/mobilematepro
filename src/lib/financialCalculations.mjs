const amount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Computes accrual-basis gross profit from immutable sale-item cost snapshots.
 * Archived product status is intentionally irrelevant to historical financials.
 * Returns reduce revenue and reverse COGS only when completed.
 */
export function calculateGrossProfit(input) {
  const sales = input.sales || [];
  const completedReturns = (input.returns || []).filter((row) => row.status === "completed");
  const historyByItem = new Map();
  for (const row of input.saleCostHistory || []) {
    const match = /^sale-item:(.+)$/.exec(row.source_key || "");
    if (match && row.unit_cost !== null && row.unit_cost !== undefined) {
      historyByItem.set(match[1], { unitCost: amount(row.unit_cost), quantity: amount(row.quantity) });
    }
  }

  const grossRevenue = money(sales.reduce((sum, sale) => sum + amount(sale.total_amount), 0));
  const refunds = money(completedReturns.reduce((sum, row) => sum + amount(row.refund_amount), 0));
  const netRevenue = money(grossRevenue - refunds);

  let soldCogs = 0;
  let returnedCogs = 0;
  let missingCostLines = 0;
  let missingReturnCostLines = 0;
  const soldQuantityByItem = new Map();

  for (const sale of sales) {
    for (const item of sale.sale_items || []) {
      const quantity = Math.max(0, amount(item.quantity));
      soldQuantityByItem.set(item.id, quantity);
      const history = historyByItem.get(item.id);
      if (history === undefined) {
        missingCostLines += 1;
      } else {
        soldCogs += history.unitCost * quantity;
      }
    }
  }

  for (const row of completedReturns) {
    const itemId = row.sale_item_id || "";
    const history = historyByItem.get(itemId);
    if (!itemId || history === undefined) {
      missingReturnCostLines += 1;
      continue;
    }
    const soldQty = soldQuantityByItem.get(itemId) ?? history.quantity;
    if (soldQty === undefined) {
      missingReturnCostLines += 1;
      continue;
    }
    const returnedQty = Math.max(0, Math.min(amount(row.quantity), soldQty));
    returnedCogs += history.unitCost * returnedQty;
  }

  const netCogs = money(soldCogs - returnedCogs);
  const knownGrossProfit = money(netRevenue - netCogs);
  const isCostComplete = missingCostLines === 0 && missingReturnCostLines === 0;

  return {
    grossRevenue,
    refunds,
    netRevenue,
    soldCogs: money(soldCogs),
    returnedCogs: money(returnedCogs),
    netCogs,
    grossProfit: knownGrossProfit,
    grossMarginPercent: netRevenue > 0 ? money((knownGrossProfit / netRevenue) * 100) : 0,
    missingCostLines,
    missingReturnCostLines,
    isCostComplete,
  };
}
