import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAll } from "@/lib/fetchAll";
import { calculateGrossProfit } from "@/lib/financialCalculations.mjs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useReactToPrint } from "react-to-print";
import * as XLSX from "xlsx";
import { PageHeader } from "./PageHeader";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function Reports() {
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [drilldownMetric, setDrilldownMetric] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const { data: sales } = useQuery({
    queryKey: ["sales", "all-reports"],
    queryFn: async () => {
      const rows = await fetchAll<any>(
        "sales",
        "*, sale_items(*, products(name, archived_at, condition)), customers(name)",
        (q) => q.order("created_at", { ascending: false })
      );
      return rows;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products", "all-reports"],
    queryFn: async () => (await fetchAll<any>("products", "*")).filter((product) => !product.archived_at),
  });

  const { data: completedReturns } = useQuery({
    queryKey: ["returns", "all-reports"],
    queryFn: async () => {
      return fetchAll<any>("returns", "sale_id, sale_item_id, quantity, refund_amount, created_at, status", (q) => q.eq("status", "completed"));
    },
  });

  const { data: saleCostHistory } = useQuery({
    queryKey: ["sale-cost-history", "all-reports"],
    queryFn: async () => fetchAll<any>("product_transaction_history", "transaction_id, source_key, unit_cost, quantity, created_at", (q) => q.eq("transaction_type", "sale")),
  });

  const { data: expenseJournalRows = [] } = useQuery({
    queryKey: ["accounting", "expense-journals"],
    queryFn: () => fetchAll<any>("accounting_journal_entries", "id, entry_date, source_type, accounting_journal_lines(debit, credit, accounting_accounts(account_code))", (q) => q.order("entry_date", { ascending: false })),
  });

  const { data: investmentIncomeRows = [] } = useQuery({
    queryKey: ["investment-incomes", "profit-loss"],
    queryFn: () => fetchAll<any>("investment_incomes", "id, income_date, amount", (q) => q.order("income_date", { ascending: false })),
  });

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      // Unlimited fetch — no 1000-row cap
      return fetchAll<any>("customers", "*", (q) => q.order("name"));
    },
  });

  const matchingSales = (sales || []).filter((sale: any) =>
    (filterCustomer === "all" || sale.customer_id === filterCustomer) &&
    (filterPaymentMethod === "all" || sale.payment_method === filterPaymentMethod)
  );
  const filteredSales = matchingSales.filter((sale: any) => {
    const saleDate = new Date(sale.created_at);
    const dateFrom = filterDateFrom ? new Date(filterDateFrom + "T00:00:00") : null;
    const dateTo = filterDateTo ? new Date(filterDateTo + "T23:59:59.999") : null;
    return (!dateFrom || saleDate >= dateFrom) && (!dateTo || saleDate <= dateTo);
  });
  const matchingSaleIds = new Set(matchingSales.map((sale: any) => sale.id));
  const filteredReturns = (completedReturns || []).filter((row: any) => {
    if (!matchingSaleIds.has(row.sale_id)) return false;
    const returnDate = new Date(row.created_at);
    const dateFrom = filterDateFrom ? new Date(filterDateFrom + "T00:00:00") : null;
    const dateTo = filterDateTo ? new Date(filterDateTo + "T23:59:59.999") : null;
    return (!dateFrom || returnDate >= dateFrom) && (!dateTo || returnDate <= dateTo);
  });
  const relevantSaleIds = new Set([...filteredSales.map((sale: any) => sale.id), ...filteredReturns.map((row: any) => row.sale_id)]);
  const profit = calculateGrossProfit({
    sales: filteredSales || [],
    returns: filteredReturns,
    saleCostHistory: (saleCostHistory || []).filter((row: any) => relevantSaleIds.has(row.transaction_id)),
  });
  const totalRevenue = profit.grossRevenue;
  const totalSales = filteredSales.length;
  const totalRefunds = profit.refunds;
  const netRevenue = profit.netRevenue;
  const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0;
  const inSelectedDateRange = (value: string) => (!filterDateFrom || value >= filterDateFrom) && (!filterDateTo || value <= filterDateTo);
  const operatingExpenses = (expenseJournalRows || []).filter((entry: any) => inSelectedDateRange(entry.entry_date)).flatMap((entry: any) => entry.accounting_journal_lines || []).filter((line: any) => String(line.accounting_accounts?.account_code || "").startsWith("6")).reduce((sum: number, line: any) => sum + Number(line.debit || 0) - Number(line.credit || 0), 0);
  const investmentIncome = (investmentIncomeRows || []).filter((row: any) => inSelectedDateRange(row.income_date)).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
  const netProfitBeforeOtherAdjustments = profit.isCostComplete ? Number(profit.grossProfit) - operatingExpenses + investmentIncome : null;

  // Top selling products
  const productSales = new Map();
  filteredSales?.forEach(sale => {
    sale.sale_items?.forEach((item: any) => {
      const productId = item.product_id;
      const current = productSales.get(productId) || { name: item.products?.name || "Unknown", quantity: 0, revenue: 0 };
      productSales.set(productId, {
        ...current,
        quantity: current.quantity + item.quantity,
        revenue: current.revenue + Number(item.total_price)
      });
    });
  });

  const topProducts = Array.from(productSales.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  // Calculate new and used mobile statistics
  const newProducts = products?.filter(p => p.condition === 'new').length || 0;
  const usedProducts = products?.filter(p => p.condition === 'used').length || 0;
  const newProductsStock = products?.filter(p => p.condition === 'new').reduce((sum, p) => sum + p.stock_quantity, 0) || 0;
  const usedProductsStock = products?.filter(p => p.condition === 'used').reduce((sum, p) => sum + p.stock_quantity, 0) || 0;
  
  // Calculate investment (cost * stock_quantity)
  const newProductsInvestment = products?.filter(p => p.condition === 'new').reduce((sum, p) => sum + (Number(p.cost) * p.stock_quantity), 0) || 0;
  const usedProductsInvestment = products?.filter(p => p.condition === 'used').reduce((sum, p) => sum + (Number(p.cost) * p.stock_quantity), 0) || 0;
  const totalInvestment = newProductsInvestment + usedProductsInvestment;
  
  // Calculate sales by condition from filtered sales
  let newSalesRevenue = 0;
  let usedSalesRevenue = 0;
  let newSalesCount = 0;
  let usedSalesCount = 0;
  
  filteredSales?.forEach(sale => {
    sale.sale_items?.forEach((item: any) => {
      const condition = item.products?.condition || item.condition;
      if (condition === 'new') {
        newSalesRevenue += Number(item.total_price);
        newSalesCount += item.quantity;
      } else if (condition === 'used') {
        usedSalesRevenue += Number(item.total_price);
        usedSalesCount += item.quantity;
      }
    });
  });

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Sales Report - ${new Date().toLocaleDateString()}`,
  });

  const handleExportExcel = () => {
    const exportData = filteredSales?.map(sale => ({
      Date: new Date(sale.created_at).toLocaleString(),
      Customer: sale.customers?.name || "Walk-in",
      "Payment Method": sale.payment_method,
      "Total Amount": Number(sale.total_amount).toFixed(2),
      Items: sale.sale_items?.length || 0,
      Notes: sale.notes || "",
    })) || [];

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales Report");
    XLSX.writeFile(wb, `Sales_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const clearFilters = () => {
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterCustomer("all");
    setFilterPaymentMethod("all");
  };

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      <PageHeader
        storageKey="reports"
        title="Reports & Analytics"
        subtitle="Track your business performance"
        actions={
          <>
            <Button onClick={handlePrint} variant="outline" className="text-sm md:text-base">
              <span className="hidden sm:inline">📄 Export PDF</span>
              <span className="sm:hidden">📄 PDF</span>
            </Button>
            <Button onClick={handleExportExcel} variant="outline" className="text-sm md:text-base">
              <span className="hidden sm:inline">📊 Export Excel</span>
              <span className="sm:hidden">📊 Excel</span>
            </Button>
          </>
        }
      />
      <div className="space-y-4 pt-3">

        <Card className="min-w-0 overflow-hidden p-4 md:p-4">
          <div className="flex items-center justify-between mb-4">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-left"
            >
              <h2 className="text-base md:text-lg font-semibold text-foreground">Filter Sales</h2>
              <span className="text-sm text-muted-foreground ml-2">
                {showFilters ? "▼" : "▶"}
              </span>
            </button>
          </div>
          {showFilters && (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground">From Date</label>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground">To Date</label>
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground">Customer</label>
            <Select value={filterCustomer} onValueChange={setFilterCustomer}>
              <SelectTrigger>
                <SelectValue placeholder="All Customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {customers?.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-foreground">Payment Method</label>
            <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder="All Methods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
          <div className="mt-4">
            <Button onClick={clearFilters} variant="ghost" size="sm">
              Clear Filters
            </Button>
          </div>
          </>
          )}
        </Card>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pb-6 space-y-4 md:space-y-4">
        <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-3 md:gap-4">
          <Card className="min-w-0 overflow-hidden p-4 md:p-4">
            <h3 className="text-xs md:text-sm font-medium text-muted-foreground mb-2">Total Revenue</h3>
            <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1.1rem,2vw,1.875rem)] font-bold leading-tight tabular-nums text-primary">৳{totalRevenue.toLocaleString('bn-BD')}</p>
          </Card>
          <Card className="min-w-0 overflow-hidden p-4 md:p-4">
            <h3 className="text-xs md:text-sm font-medium text-muted-foreground mb-2">Total Returns</h3>
            <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1.1rem,2vw,1.875rem)] font-bold leading-tight tabular-nums text-red-600">−৳{totalRefunds.toLocaleString('bn-BD')}</p>
          </Card>
          <Card className="min-w-0 overflow-hidden p-4 md:p-4">
            <h3 className="text-xs md:text-sm font-medium text-muted-foreground mb-2">Net Revenue</h3>
            <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1.1rem,2vw,1.875rem)] font-bold leading-tight tabular-nums text-emerald-600">৳{netRevenue.toLocaleString('bn-BD')}</p>
          </Card>
          <Card className="min-w-0 overflow-hidden p-4 md:p-4">
            <h3 className="text-xs md:text-sm font-medium text-muted-foreground mb-2">Total Sales</h3>
            <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1.1rem,2vw,1.875rem)] font-bold leading-tight tabular-nums text-accent">{totalSales}</p>
          </Card>
          <Card className="min-w-0 overflow-hidden p-4 md:p-4">
            <h3 className="text-xs md:text-sm font-medium text-muted-foreground mb-2">Average Sale</h3>
            <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1.1rem,2vw,1.875rem)] font-bold leading-tight tabular-nums text-foreground">৳{averageSale.toLocaleString('bn-BD', { maximumFractionDigits: 0 })}</p>
          </Card>
        </div>

      <Card className="min-w-0 overflow-hidden p-4 md:p-5 border-primary/20">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">Profit & Loss (Accrual Basis)</h2>
          <p className="text-xs text-muted-foreground">বিক্রির তারিখে Revenue/COGS, Return সম্পন্ন হওয়ার তারিখে Refund এবং Expense Date অনুযায়ী পরিচালন ব্যয় গণনা করা হয়েছে।</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {[
            { key: "revenue", label: "Net Revenue", value: profit.netRevenue },
            { key: "cogs", label: "Net COGS", value: profit.netCogs },
            { key: "gross", label: "Gross Profit", value: profit.isCostComplete ? profit.grossProfit : null },
            { key: "expenses", label: "Operating Expenses", value: operatingExpenses },
            { key: "investment", label: "Investment Income", value: investmentIncome },
            { key: "net", label: "Net Profit (Known Items)", value: netProfitBeforeOtherAdjustments },
          ].map((item) => (
            <button key={item.key} type="button" onClick={() => setDrilldownMetric(item.key)} className="rounded-lg bg-muted/50 p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={"text-xl font-bold tabular-nums " + (item.value !== null && item.value < 0 ? "text-destructive" : "text-foreground")}>{item.value === null ? "Incomplete" : `৳${item.value.toLocaleString("bn-BD")}`}</p>
              <p className="mt-1 text-[11px] text-primary">View breakdown ↗</p>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Net Profit (Known Items) = Gross Profit − recorded operating expenses + recorded investment income. এটি পূর্ণাঙ্গ statutory P&L নয়, যতক্ষণ না অন্যান্য আয়-ব্যয়, finance charges, depreciation, tax এবং opening adjustments অন্তর্ভুক্ত হচ্ছে।</p>
        {!profit.isCostComplete && <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">সতর্কতা: {profit.missingCostLines}টি বিক্রয় লাইনের এবং {profit.missingReturnCostLines}টি রিটার্ন লাইনের ঐতিহাসিক ক্রয়মূল্য পাওয়া যায়নি। Gross Profit এবং Net Profit নির্ভরযোগ্যভাবে দেখানো যাচ্ছে না। আগে অনুপস্থিত ক্রয়মূল্য পূরণ করুন।</p>}
      </Card>

      <Dialog open={!!drilldownMetric} onOpenChange={(open) => !open && setDrilldownMetric(null)}>
        <DialogContent className="max-h-[85vh] w-[95vw] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{({
              revenue: "Net Revenue Breakdown",
              cogs: "Cost of Goods Sold Breakdown",
              gross: "Gross Profit Breakdown",
              expenses: "Operating Expense Breakdown",
              investment: "Investment Income Breakdown",
              net: "Net Profit Breakdown",
            } as Record<string, string>)[drilldownMetric || ""] || "Financial Breakdown"}</DialogTitle>
            <DialogDescription>প্রতিটি হিসাবের উৎস রেকর্ড ও সংশ্লিষ্ট লেনদেনের সারাংশ</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(() => {
              const costByItem = new Map((saleCostHistory || []).map((row: any) => [String(row.source_key || "").replace(/^sale-item:/, ""), row]));
              let rows: any[] = [];
              if (drilldownMetric === "revenue" || drilldownMetric === "gross" || drilldownMetric === "cogs" || drilldownMetric === "net") {
                rows = filteredSales.flatMap((sale: any) => (sale.sale_items || []).map((line: any) => {
                  const cost: any = costByItem.get(line.id);
                  const quantity = Number(line.quantity || 0);
                  const revenue = Number(line.total_price || 0);
                  const unitCost = cost ? Number(cost.unit_cost || 0) : null;
                  return { id: sale.id, date: sale.created_at, name: line.products?.name || "Product", detail: `Invoice #${String(sale.id).slice(0, 8)} · Qty ${quantity} · ${unitCost === null ? "Historical cost missing" : `Unit cost ৳${unitCost.toLocaleString("en-US")}`}`, amount: drilldownMetric === "cogs" ? (unitCost === null ? null : unitCost * quantity) : drilldownMetric === "gross" ? (unitCost === null ? null : revenue - unitCost * quantity) : revenue });
                }));
              }
              if (drilldownMetric === "revenue") rows = rows.filter((row) => row.amount !== null);
              if (drilldownMetric === "cogs") rows = rows.filter((row) => row.amount !== null);
              if (drilldownMetric === "gross") rows = rows.filter((row) => row.amount !== null);
              if (drilldownMetric === "expenses") rows = (expenseJournalRows || []).filter((entry: any) => inSelectedDateRange(entry.entry_date)).flatMap((entry: any) => (entry.accounting_journal_lines || []).filter((line: any) => String(line.accounting_accounts?.account_code || "").startsWith("6")).map((line: any) => ({ id: entry.id, date: entry.entry_date, name: line.accounting_accounts?.account_code || "Expense", detail: `Journal #${String(entry.id).slice(0, 8)} · ${entry.source_type || "Expense"}`, amount: Number(line.debit || 0) - Number(line.credit || 0) })));
              if (drilldownMetric === "investment") rows = (investmentIncomeRows || []).filter((row: any) => inSelectedDateRange(row.income_date)).map((row: any) => ({ id: row.id, date: row.income_date, name: "Investment income", detail: `Income record #${String(row.id).slice(0, 8)}`, amount: Number(row.amount || 0) }));
              if (drilldownMetric === "net") rows = [
                { id: "gross-profit", date: "", name: "Gross Profit", detail: "Sales revenue less cost of goods sold", amount: profit.grossProfit },
                { id: "expenses", date: "", name: "Operating Expenses", detail: "Posted expense journal lines", amount: -operatingExpenses },
                { id: "investment-income", date: "", name: "Investment Income", detail: "Recorded investment income", amount: investmentIncome },
              ];
              if (drilldownMetric === "revenue") rows = rows.concat(filteredReturns.map((row: any) => ({ id: row.sale_id, date: row.created_at, name: "Completed sales return", detail: `Return against invoice #${String(row.sale_id).slice(0, 8)}`, amount: -Number(row.refund_amount || 0) })));
              return rows.length ? rows.map((row, index) => (
                <div key={`${row.id}-${index}`} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{row.name}</p>
                    <p className="break-all text-xs text-muted-foreground">{row.detail}</p>
                    {row.date && <p className="text-xs text-muted-foreground">{new Date(row.date).toLocaleString()}</p>}
                  </div>
                  <p className={"shrink-0 font-semibold tabular-nums " + (row.amount < 0 ? "text-destructive" : "")}>{row.amount === null ? "Cost unavailable" : `৳${Number(row.amount).toLocaleString("en-US")}`}</p>
                </div>
              )) : <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">এই সময়সীমায় প্রদর্শনের মতো উৎস রেকর্ড পাওয়া যায়নি।</p>;
            })()}
          </div>
          {!profit.isCostComplete && (drilldownMetric === "cogs" || drilldownMetric === "gross" || drilldownMetric === "net") && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">ঐতিহাসিক ক্রয়মূল্য অনুপস্থিত এমন বিক্রয় লাইন রয়েছে। সংশ্লিষ্ট উৎস ক্রয় রেকর্ড যাচাই না করা পর্যন্ত এই হিসাব অসম্পূর্ণ।</p>}
        </DialogContent>
      </Dialog>

      {/* Investment Analysis Section */}
      <Card className="min-w-0 overflow-hidden p-4 md:p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border-purple-200">
        <h2 className="text-lg md:text-xl font-semibold mb-4 md:mb-4 text-foreground flex items-center">
          <span className="text-xl md:text-2xl mr-2">💰</span>
          Estimated Current Inventory Cost
        </h2>
        <div className="grid min-w-0 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          <Card className="min-w-0 overflow-hidden p-4 md:p-4 bg-green-50 dark:bg-green-950/20 border-green-200">
            <div className="flex min-w-0 flex-wrap items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <p className="text-xs md:text-sm font-medium text-muted-foreground">New Products Stock Cost</p>
            </div>
            <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1.1rem,2vw,1.875rem)] font-bold leading-tight tabular-nums text-green-600">৳{newProductsInvestment.toLocaleString("bn-BD")}</p>
            <p className="text-xs text-muted-foreground mt-2">{newProducts} products • {newProductsStock} units</p>
          </Card>
          
          <Card className="min-w-0 overflow-hidden p-4 md:p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
            <div className="flex min-w-0 flex-wrap items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <p className="text-xs md:text-sm font-medium text-muted-foreground">Used Products Stock Cost</p>
            </div>
            <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1.1rem,2vw,1.875rem)] font-bold leading-tight tabular-nums text-blue-600">৳{usedProductsInvestment.toLocaleString("bn-BD")}</p>
            <p className="text-xs text-muted-foreground mt-2">{usedProducts} products • {usedProductsStock} units</p>
          </Card>
          
          <Card className="min-w-0 overflow-hidden p-4 md:p-4 bg-purple-50 dark:bg-purple-950/20 border-purple-200">
            <div className="flex min-w-0 flex-wrap items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-purple-500"></div>
              <p className="text-xs md:text-sm font-medium text-muted-foreground">Total Current Stock Cost</p>
            </div>
            <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1.1rem,2vw,1.875rem)] font-bold leading-tight tabular-nums text-purple-600">৳{totalInvestment.toLocaleString("bn-BD")}</p>
            <p className="text-xs text-muted-foreground mt-2">{newProducts + usedProducts} products • {newProductsStock + usedProductsStock} units</p>
          </Card>
        </div>
        
        {/* Inventory Cost Breakdown */}
        <div className="mt-4 md:mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">New Products Share</p>
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full" 
                  style={{ width: `${totalInvestment > 0 ? (newProductsInvestment / totalInvestment * 100) : 0}%` }}
                ></div>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-green-600">
                {totalInvestment > 0 ? ((newProductsInvestment / totalInvestment * 100).toFixed(1)) : 0}%
              </p>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Used Products Share</p>
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full" 
                  style={{ width: `${totalInvestment > 0 ? (usedProductsInvestment / totalInvestment * 100) : 0}%` }}
                ></div>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-blue-600">
                {totalInvestment > 0 ? ((usedProductsInvestment / totalInvestment * 100).toFixed(1)) : 0}%
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* 360 Degree Report - New vs Used Mobiles */}
      <Card className="min-w-0 overflow-hidden p-4 md:p-4">
        <h2 className="text-lg md:text-xl font-semibold mb-4 md:mb-4 text-foreground">Product Condition Analysis</h2>
        <div className="grid min-w-0 grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {/* New Products Section */}
          <div className="space-y-3 md:space-y-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2 mb-3 md:mb-4">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <h3 className="text-base md:text-lg font-semibold text-foreground">New Products</h3>
            </div>
            <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <Card className="min-w-0 overflow-hidden p-3 md:p-4 bg-green-50 dark:bg-green-950/20 border-green-200">
                <p className="text-xs md:text-sm text-muted-foreground">Products</p>
                <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1rem,1.7vw,1.5rem)] font-bold leading-tight tabular-nums text-green-600">{newProducts}</p>
              </Card>
              <Card className="min-w-0 overflow-hidden p-3 md:p-4 bg-green-50 dark:bg-green-950/20 border-green-200">
                <p className="text-xs md:text-sm text-muted-foreground">Total Stock</p>
                <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1rem,1.7vw,1.5rem)] font-bold leading-tight tabular-nums text-green-600">{newProductsStock}</p>
              </Card>
              <Card className="min-w-0 overflow-hidden p-3 md:p-4 bg-green-50 dark:bg-green-950/20 border-green-200">
                <p className="text-xs md:text-sm text-muted-foreground">Units Sold</p>
                <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1rem,1.7vw,1.5rem)] font-bold leading-tight tabular-nums text-green-600">{newSalesCount}</p>
              </Card>
              <Card className="min-w-0 overflow-hidden p-3 md:p-4 bg-green-50 dark:bg-green-950/20 border-green-200">
                <p className="text-xs md:text-sm text-muted-foreground">Revenue</p>
                <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1rem,1.7vw,1.5rem)] font-bold leading-tight tabular-nums text-green-600">৳{newSalesRevenue.toLocaleString("bn-BD")}</p>
              </Card>
            </div>
          </div>

          {/* Used Products Section */}
          <div className="space-y-3 md:space-y-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2 mb-3 md:mb-4">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <h3 className="text-base md:text-lg font-semibold text-foreground">Used Products</h3>
            </div>
            <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <Card className="min-w-0 overflow-hidden p-3 md:p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                <p className="text-xs md:text-sm text-muted-foreground">Products</p>
                <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1rem,1.7vw,1.5rem)] font-bold leading-tight tabular-nums text-blue-600">{usedProducts}</p>
              </Card>
              <Card className="min-w-0 overflow-hidden p-3 md:p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                <p className="text-xs md:text-sm text-muted-foreground">Total Stock</p>
                <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1rem,1.7vw,1.5rem)] font-bold leading-tight tabular-nums text-blue-600">{usedProductsStock}</p>
              </Card>
              <Card className="min-w-0 overflow-hidden p-3 md:p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                <p className="text-xs md:text-sm text-muted-foreground">Units Sold</p>
                <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1rem,1.7vw,1.5rem)] font-bold leading-tight tabular-nums text-blue-600">{usedSalesCount}</p>
              </Card>
              <Card className="min-w-0 overflow-hidden p-3 md:p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                <p className="text-xs md:text-sm text-muted-foreground">Revenue</p>
                <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1rem,1.7vw,1.5rem)] font-bold leading-tight tabular-nums text-blue-600">৳{usedSalesRevenue.toLocaleString("bn-BD")}</p>
              </Card>
            </div>
          </div>
        </div>
      </Card>

      <Card className="min-w-0 overflow-hidden p-4 md:p-4">
        <h2 className="text-lg md:text-xl font-semibold mb-4 text-foreground">Top Selling Products</h2>
        <div className="space-y-4">
          {topProducts.map((product, index) => (
            <div key={index} className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <div>
                <p className="font-medium text-foreground">{product.name}</p>
                <p className="text-sm text-muted-foreground">{product.quantity} units sold</p>
              </div>
              <p className="min-w-0 break-words [overflow-wrap:anywhere] font-semibold tabular-nums text-primary">৳{product.revenue.toLocaleString("bn-BD")}</p>
            </div>
          ))}
          {topProducts.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No sales data available yet</p>
          )}
        </div>
        </Card>

        <div ref={printRef}>
          <Card className="min-w-0 overflow-hidden p-4 md:p-4">
          <h2 className="text-lg md:text-xl font-semibold mb-4 text-foreground">Recent Sales</h2>
          <div className="space-y-4">
            {filteredSales?.slice(0, 10).map((sale) => (
            <Card key={sale.id} className="min-w-0 overflow-hidden p-3 sm:p-4 hover:bg-muted/50">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <p className="min-w-0 break-words [overflow-wrap:anywhere] font-semibold tabular-nums text-foreground">
                    {sale.customers?.name || "Walk-in Customer"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(sale.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="min-w-0 break-words [overflow-wrap:anywhere] text-lg sm:text-xl font-bold leading-tight tabular-nums text-primary">
                    ৳{Number(sale.total_amount).toLocaleString("bn-BD")}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {sale.payment_method}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Items:</p>
                {sale.sale_items?.map((item: any, index: number) => (
                  <div key={index} className="flex min-w-0 flex-wrap justify-between items-center gap-2 text-sm bg-muted/30 p-2 rounded">
                    <div className="min-w-0 flex-1">
                      <p className="break-words [overflow-wrap:anywhere] font-medium text-foreground">{item.products?.name || "Product"}</p>
                      <p className="text-xs text-muted-foreground">
                        Qty: {item.quantity} × ৳{Number(item.unit_price).toLocaleString("bn-BD")}
                        {item.condition && <span className="ml-2">• {item.condition}</span>}
                      </p>
                    </div>
                    <p className="font-semibold text-foreground">
                      ৳{Number(item.total_price).toLocaleString("bn-BD")}
                    </p>
                  </div>
                ))}
              </div>
              {sale.notes && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Note:</span> {sale.notes}
                  </p>
                </div>
              )}
            </Card>
            ))}
            {(!filteredSales || filteredSales.length === 0) && (
              <p className="text-center text-muted-foreground py-8">No sales data available with current filters</p>
            )}
          </div>
        </Card>
        </div>
      </div>
    </div>
  );
}
