import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useReactToPrint } from "react-to-print";
import * as XLSX from "xlsx";
import { PageHeader } from "./PageHeader";

export function Reports() {
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("all");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const { data: sales } = useQuery({
    queryKey: ["sales", "all-reports"],
    queryFn: async () => {
      const rows = await fetchAll<any>(
        "sales",
        "*, sale_items(*, products(name)), customers(name)",
        (q) => q.order("created_at", { ascending: false })
      );
      return rows;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products", "all-reports"],
    queryFn: async () => fetchAll<any>("products", "*"),
  });

  const { data: completedReturns } = useQuery({
    queryKey: ["returns", "all-reports"],
    queryFn: async () => {
      const { data } = await supabase.from("returns").select("sale_id, refund_amount, created_at, status").eq("status", "completed");
      return data || [];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      // Unlimited fetch — no 1000-row cap
      return fetchAll<any>("customers", "*", (q) => q.order("name"));
    },
  });

  // Filter sales based on selected filters
  const filteredSales = sales?.filter(sale => {
    const saleDate = new Date(sale.created_at);
    const dateFrom = filterDateFrom ? new Date(filterDateFrom) : null;
    const dateTo = filterDateTo ? new Date(filterDateTo) : null;

    if (dateFrom && saleDate < dateFrom) return false;
    if (dateTo) {
      dateTo.setHours(23, 59, 59, 999);
      if (saleDate > dateTo) return false;
    }
    if (filterCustomer !== "all" && sale.customer_id !== filterCustomer) return false;
    if (filterPaymentMethod !== "all" && sale.payment_method !== filterPaymentMethod) return false;

    return true;
  });

  const totalRevenue = filteredSales?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
  const totalSales = filteredSales?.length || 0;
  // Net = total sales − completed returns refunds within the same period
  const filteredSaleIds = new Set((filteredSales || []).map((s: any) => s.id));
  const totalRefunds = (completedReturns || [])
    .filter((r: any) => filteredSaleIds.has(r.sale_id))
    .reduce((sum: number, r: any) => sum + Number(r.refund_amount || 0), 0);
  const netRevenue = totalRevenue - totalRefunds;
  const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0;

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

      {/* Investment Analysis Section */}
      <Card className="min-w-0 overflow-hidden p-4 md:p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border-purple-200">
        <h2 className="text-lg md:text-xl font-semibold mb-4 md:mb-4 text-foreground flex items-center">
          <span className="text-xl md:text-2xl mr-2">💰</span>
          Total Investment Analysis
        </h2>
        <div className="grid min-w-0 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          <Card className="min-w-0 overflow-hidden p-4 md:p-4 bg-green-50 dark:bg-green-950/20 border-green-200">
            <div className="flex min-w-0 flex-wrap items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <p className="text-xs md:text-sm font-medium text-muted-foreground">New Products Investment</p>
            </div>
            <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1.1rem,2vw,1.875rem)] font-bold leading-tight tabular-nums text-green-600">${newProductsInvestment.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-2">{newProducts} products • {newProductsStock} units</p>
          </Card>
          
          <Card className="min-w-0 overflow-hidden p-4 md:p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
            <div className="flex min-w-0 flex-wrap items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <p className="text-xs md:text-sm font-medium text-muted-foreground">Used Products Investment</p>
            </div>
            <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1.1rem,2vw,1.875rem)] font-bold leading-tight tabular-nums text-blue-600">${usedProductsInvestment.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-2">{usedProducts} products • {usedProductsStock} units</p>
          </Card>
          
          <Card className="min-w-0 overflow-hidden p-4 md:p-4 bg-purple-50 dark:bg-purple-950/20 border-purple-200">
            <div className="flex min-w-0 flex-wrap items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-purple-500"></div>
              <p className="text-xs md:text-sm font-medium text-muted-foreground">Total Investment</p>
            </div>
            <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1.1rem,2vw,1.875rem)] font-bold leading-tight tabular-nums text-purple-600">${totalInvestment.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-2">{newProducts + usedProducts} products • {newProductsStock + usedProductsStock} units</p>
          </Card>
        </div>
        
        {/* Investment Breakdown Percentage */}
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
                <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1rem,1.7vw,1.5rem)] font-bold leading-tight tabular-nums text-green-600">${newSalesRevenue.toFixed(2)}</p>
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
                <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1rem,1.7vw,1.5rem)] font-bold leading-tight tabular-nums text-blue-600">${usedSalesRevenue.toFixed(2)}</p>
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
              <p className="min-w-0 break-words [overflow-wrap:anywhere] font-semibold tabular-nums text-primary">${product.revenue.toFixed(2)}</p>
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
            <Card key={sale.id} className="p-4 hover:bg-muted/50">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-semibold text-foreground">
                    {sale.customers?.name || "Walk-in Customer"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(sale.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="min-w-0 break-words [overflow-wrap:anywhere] text-lg sm:text-xl font-bold leading-tight tabular-nums text-primary">
                    ${Number(sale.total_amount).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {sale.payment_method}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Items:</p>
                {sale.sale_items?.map((item: any, index: number) => (
                  <div key={index} className="flex justify-between items-center text-sm bg-muted/30 p-2 rounded">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">{item.products?.name || "Product"}</p>
                      <p className="text-xs text-muted-foreground">
                        Qty: {item.quantity} × ${Number(item.unit_price).toFixed(2)}
                        {item.condition && <span className="ml-2">• {item.condition}</span>}
                      </p>
                    </div>
                    <p className="font-semibold text-foreground">
                      ${Number(item.total_price).toFixed(2)}
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
