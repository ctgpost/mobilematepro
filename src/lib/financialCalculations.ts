export type FinancialSale = {
  id: string;
  total_amount?: number | string | null;
  sale_items?: Array<{ id: string; quantity?: number | string | null }>;
};

export type FinancialReturn = {
  sale_item_id?: string | null;
  quantity?: number | string | null;
  refund_amount?: number | string | null;
  status?: string | null;
};

export type SaleCostHistory = {
  source_key?: string | null;
  unit_cost?: number | string | null;
};

const amount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Computes accrual-basis gross profit from immutable sale-item cost snapshots.
 * Archived product status is intentionally irrelevant to historical financials.
 * Returns reduce revenue and reverse COGS only when completed.
 */
export function calculateGrossProfit(input: {
  sales: FinancialSale[];
  returns: FinancialReturn[];
  saleCostHistory: SaleCostHistory[];
}) {
  const sales = input.sales || [];
  const completedReturns = (input.returns || []).filter((row) => row.status === "completed");
  const historyByItem = new Map<string, number>();
  for (const row of input.saleCostHistory || []) {
    const match = /^sale-item:(.+)$/.exec(row.source_key || "");
    if (match && row.unit_cost !== null && row.unit_cost !== undefined) {
      historyByItem.set(match[1], amount(row.unit_cost));
    }
  }

  const grossRevenue = money(sales.reduce((sum, sale) => sum + amount(sale.total_amount), 0));
  const refunds = money(completedReturns.reduce((sum, row) => sum + amount(row.refund_amount), 0));
  const netRevenue = money(grossRevenue - refunds);

  let soldCogs = 0;
  let returnedCogs = 0;
  let missingCostLines = 0;
  let missingReturnCostLines = 0;
  const soldQuantityByItem = new Map<string, number>();

  for (const sale of sales) {
    for (const item of sale.sale_items || []) {
      const quantity = Math.max(0, amount(item.quantity));
      soldQuantityByItem.set(item.id, quantity);
      const unitCost = historyByItem.get(item.id);
      if (unitCost === undefined) {
        missingCostLines += 1;
      } else {
        soldCogs += unitCost * quantity;
      }
    }
  }

  for (const row of completedReturns) {
    const itemId = row.sale_item_id || "";
    const unitCost = historyByItem.get(itemId);
    if (!itemId || unitCost === undefined) {
      missingReturnCostLines += 1;
      continue;
    }
    const soldQty = soldQuantityByItem.get(itemId);
    if (soldQty === undefined) {
      missingReturnCostLines += 1;
      continue;
    }
    const returnedQty = Math.max(0, Math.min(amount(row.quantity), soldQty));
    returnedCogs += unitCost * returnedQty;
  }

  const netCogs = money(Math.max(0, soldCogs - returnedCogs));
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
