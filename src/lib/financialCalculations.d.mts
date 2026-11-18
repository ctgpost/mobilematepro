export interface FinancialSale {
  id: string;
  total_amount?: number | string | null;
  sale_items?: Array<{ id: string; quantity?: number | string | null }>;
}
export interface FinancialReturn {
  sale_item_id?: string | null;
  quantity?: number | string | null;
  refund_amount?: number | string | null;
  status?: string | null;
}
export interface SaleCostHistory {
  source_key?: string | null;
  unit_cost?: number | string | null;
  quantity?: number | string | null;
}
export function calculateGrossProfit(input: {
  sales: FinancialSale[];
  returns: FinancialReturn[];
  saleCostHistory: SaleCostHistory[];
}): {
  grossRevenue:number; refunds:number; netRevenue:number; soldCogs:number; returnedCogs:number;
  netCogs:number; grossProfit:number; grossMarginPercent:number; missingCostLines:number;
  missingReturnCostLines:number; isCostComplete:boolean;
};
