import { useState, useMemo, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { Search, Calendar, User, CreditCard, Package, Filter, X, FileDown, FileSpreadsheet, Phone, MessageSquare, Mail, Eye, Share2, Copy, ScanBarcode, Loader2 } from "lucide-react";
import { SwipeableRow, swipeIntents } from "./SwipeableRow";
import { BarcodeScanner } from "./BarcodeScanner";
import { toast } from "sonner";
import { useReactToPrint } from "react-to-print";
import * as XLSX from "xlsx";
import { DueCollection } from "./DueCollection";
import { PhotoZoom } from "./PhotoZoom";
import { PageHeader } from "./PageHeader";

interface SaleDetail {
  id: string;
  created_at: string;
  total_amount: number;
  payment_method: string;
  status: string;
  notes: string | null;
  customer_id: string | null;
  instant_customer_name: string | null;
  instant_customer_phone: string | null;
  customer_photo_url: string | null;
  paid_amount: number;
  due_amount: number;
  customers: {
    name: string;
    phone: string | null;
    email: string | null;
    photo_url: string | null;
  } | null;
  sale_items: Array<{
    quantity: number;
    unit_price: number;
    total_price: number;
    condition: string;
    products: {
      name: string;
      sku: string | null;
      imei: string | null;
      brand: string | null;
      model: string | null;
    };
  }>;
}

export function Sales() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [searchTerm, setSearchTerm] = useState(initialQ);
  const [debouncedSearch, setDebouncedSearch] = useState(initialQ);
  const [showSalesScanner, setShowSalesScanner] = useState(false);
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterCustomer, setFilterCustomer] = useState<string>("all");
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const itemsPerPage = 10;
  const printRef = useRef<HTMLDivElement>(null);

  // Debounce search input (300ms) so typing / repeated scans don't over-render.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Sync search term with URL query (?q=...) so refresh / back-forward preserve it.
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    const next = debouncedSearch.trim();
    if (current === next) return;
    const params = new URLSearchParams(searchParams);
    if (next) params.set("q", next);
    else params.delete("q");
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Respond to external URL changes (back/forward).
  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    if (q !== searchTerm) {
      setSearchTerm(q);
      setDebouncedSearch(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const isSearchPending = searchTerm.trim() !== debouncedSearch;

  // Helper: does a sale match the active search term (used for highlight)?
  const searchLowerActive = debouncedSearch.toLowerCase();
  const saleMatchesSearch = (sale: SaleDetail) => {
    if (!debouncedSearch) return false;
    return (
      sale.id.toLowerCase().includes(searchLowerActive) ||
      sale.customers?.name?.toLowerCase().includes(searchLowerActive) ||
      (sale.sale_items || []).some(
        (item) =>
          item?.products?.name?.toLowerCase().includes(searchLowerActive) ||
          item?.products?.imei?.toLowerCase().includes(searchLowerActive) ||
          item?.products?.brand?.toLowerCase().includes(searchLowerActive)
      )
    );
  };

  // Fetch sales data
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales", "all"],
    queryFn: async () => {
      const data = await fetchAll<any>(
        "sales",
        `*, customers (name, phone, email, photo_url), sale_items ( quantity, unit_price, total_price, condition, products (name, sku, imei, brand, model) )`,
        (q) => q.order("created_at", { ascending: false })
      );
      return data.map((sale: any) => ({
        ...sale,
        sale_items: sale.sale_items || [],
      })) as SaleDetail[];
    },
  });

  // Fetch customers for filter
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Filter and search logic
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      // Search filter
      const searchLower = debouncedSearch.toLowerCase();
      const matchesSearch =
        !debouncedSearch ||
        sale.id.toLowerCase().includes(searchLower) ||
        sale.customers?.name.toLowerCase().includes(searchLower) ||
        (sale.sale_items || []).some(
          (item) =>
            item?.products?.name?.toLowerCase().includes(searchLower) ||
            item?.products?.imei?.toLowerCase().includes(searchLower) ||
            item?.products?.brand?.toLowerCase().includes(searchLower)
        );

      // Payment method filter
      const matchesPaymentMethod =
        filterPaymentMethod === "all" || sale.payment_method === filterPaymentMethod;

      // Customer filter
      const matchesCustomer =
        filterCustomer === "all" || sale.customer_id === filterCustomer;

      // Date filters
      const saleDate = new Date(sale.created_at);
      const matchesDateFrom =
        !filterDateFrom || saleDate >= new Date(filterDateFrom);
      const matchesDateTo =
        !filterDateTo || saleDate <= new Date(filterDateTo + "T23:59:59");

      return (
        matchesSearch &&
        matchesPaymentMethod &&
        matchesCustomer &&
        matchesDateFrom &&
        matchesDateTo
      );
    });
  }, [sales, debouncedSearch, filterPaymentMethod, filterCustomer, filterDateFrom, filterDateTo]);

  // Pagination
  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);
  const paginatedSales = filteredSales.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Stats
  const totalSales = filteredSales.length;
  const totalRevenue = filteredSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const averageSale = totalSales > 0 ? totalRevenue / totalSales : 0;

  const clearFilters = () => {
    setSearchTerm("");
    setFilterPaymentMethod("all");
    setFilterCustomer("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchTerm ||
    filterPaymentMethod !== "all" ||
    filterCustomer !== "all" ||
    filterDateFrom ||
    filterDateTo;

  // PDF Export
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Sales_Report_${format(new Date(), "yyyy-MM-dd")}`,
  });

  // Excel Export
  const handleExportExcel = () => {
    const exportData = filteredSales.map((sale) => {
      const items = (sale.sale_items || []).map((item) => ({
        "Sale ID": sale.id.slice(0, 8),
        "Date": format(new Date(sale.created_at), "dd MMM yyyy"),
        "Time": format(new Date(sale.created_at), "hh:mm a"),
        "Customer": sale.customers?.name || "Walk-in",
        "Product": item?.products?.name || "N/A",
        "Brand": item?.products?.brand || "N/A",
        "Model": item?.products?.model || "N/A",
        "IMEI": item?.products?.imei || "N/A",
        "Condition": item?.condition || "N/A",
        "Quantity": item?.quantity || 0,
        "Unit Price": item?.unit_price || 0,
        "Total Price": item?.total_price || 0,
        "Payment Method": sale.payment_method,
        "Sale Total": sale.total_amount,
      }));
      return items;
    }).flat();

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales");

    // Auto-size columns
    const maxWidth = 20;
    const columns = Object.keys(exportData[0] || {});
    worksheet["!cols"] = columns.map(() => ({ wch: maxWidth }));

    XLSX.writeFile(workbook, `Sales_Report_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading sales data...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      <PageHeader
        storageKey="sales"
        title="Sales History"
        subtitle="View and manage all sales transactions"
        actions={
          <>
            <Button
              onClick={handlePrint}
              variant="outline"
              className="gap-2 text-sm md:text-base"
              disabled={filteredSales.length === 0}
            >
              <FileDown className="h-4 w-4" />
              <span className="hidden sm:inline">Export PDF</span>
              <span className="sm:hidden">PDF</span>
            </Button>
            <Button
              onClick={handleExportExcel}
              variant="outline"
              className="gap-2 text-sm md:text-base"
              disabled={filteredSales.length === 0}
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden sm:inline">Export Excel</span>
              <span className="sm:hidden">Excel</span>
            </Button>
          </>
        }
      />
      <div className="space-y-4 pt-3">

        {/* Stats Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        <Card className="card-hover">
          <CardHeader className="pb-3 p-4 md:p-6">
            <CardDescription className="text-xs md:text-sm">Total Sales</CardDescription>
            <CardTitle className="text-2xl md:text-3xl text-primary">{totalSales}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="card-hover hidden lg:block">
          <CardHeader className="pb-3 p-4 md:p-6">
            <CardDescription className="text-xs md:text-sm">Total Revenue</CardDescription>
            <CardTitle className="text-2xl md:text-3xl text-accent">৳{totalRevenue.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="card-hover hidden lg:block">
          <CardHeader className="pb-3 p-4 md:p-6">
            <CardDescription className="text-xs md:text-sm">Average Sale</CardDescription>
            <CardTitle className="text-2xl md:text-3xl text-secondary">৳{averageSale.toFixed(0)}</CardTitle>
          </CardHeader>
        </Card>
        </div>

        {/* Filters */}
        <Card>
        <CardHeader className="p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-left"
            >
              <Filter className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              <CardTitle className="text-base md:text-lg">Filters & Search</CardTitle>
              <span className="text-sm text-muted-foreground ml-2">
                {showFilters ? "▼" : "▶"}
              </span>
            </button>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-destructive hover:text-destructive text-sm self-start sm:self-auto"
              >
                <X className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Clear Filters</span>
                <span className="sm:hidden">Clear</span>
              </Button>
            )}
          </div>
        </CardHeader>
        {showFilters && (
        <CardContent className="p-4 md:p-6 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
            {/* Search */}
            <div className="sm:col-span-2 lg:col-span-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="ID, কাস্টমার, প্রোডাক্ট বা IMEI দিয়ে খুঁজুন..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 text-sm md:text-base"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowSalesScanner(true)}
                  disabled={showSalesScanner}
                  title="IMEI / বারকোড স্ক্যান করে খুঁজুন"
                  aria-label="IMEI / বারকোড স্ক্যান করে খুঁজুন"
                >
                  {showSalesScanner ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ScanBarcode className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <BarcodeScanner
                isOpen={showSalesScanner}
                onClose={() => setShowSalesScanner(false)}
                onScan={(code) => {
                  const clean = code.replace(/[\s\-_.]/g, "").replace(/\D/g, "");
                  const value = clean || code.trim();
                  setSearchTerm(value);
                  // Auto-submit: bypass debounce so filter applies immediately.
                  setDebouncedSearch(value);
                  setCurrentPage(1);
                  setShowSalesScanner(false);
                  toast.success(`স্ক্যান সফল: ${value}`);
                }}
                onError={(msg) => {
                  toast.error(msg || "স্ক্যান ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
                }}
              />
            </div>

            {/* Date From */}
            <div>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                placeholder="From Date"
                className="text-sm md:text-base"
              />
            </div>

            {/* Date To */}
            <div>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                placeholder="To Date"
                className="text-sm md:text-base"
              />
            </div>

            {/* Customer Filter */}
            <div>
              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger className="text-sm md:text-base">
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Method Filter */}
            <div>
              <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
                <SelectTrigger className="text-sm md:text-base">
                  <SelectValue placeholder="All Payment Methods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="mobile">Mobile Banking</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
        )}
        </Card>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pb-6 space-y-4 md:space-y-6">
        {/* Sales List */}
        <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">
            Sales List ({filteredSales.length} {filteredSales.length === 1 ? "sale" : "sales"})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          {paginatedSales.length === 0 ? (
            <div className="text-center py-8 md:py-12 text-muted-foreground">
              <Package className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 md:mb-4 opacity-50" />
              <p className="text-sm md:text-base">No sales found</p>
              {hasActiveFilters && (
                <Button variant="link" onClick={clearFilters} className="mt-2 text-sm md:text-base">
                  Clear filters to see all sales
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2 md:space-y-3">
              {paginatedSales.map((sale) => {
                const phone = (sale as any).customers?.phone || (sale as any).instant_customer_phone || "";
                const email = (sale as any).customers?.email || "";
                const custName = (sale as any).customers?.name || (sale as any).instant_customer_name || "Walk-in";
                return (
                  <SwipeableRow
                    key={sale.id}
                    className="rounded-lg"
                    leftActions={[
                      { label: "কল", icon: Phone, color: "bg-green-600", onAction: () => phone ? swipeIntents.call(phone) : toast.error("ফোন নেই") },
                      { label: "SMS", icon: MessageSquare, color: "bg-sky-600", onAction: () => phone ? swipeIntents.sms(phone, `ইনভয়েস #${sale.id.slice(0,8)} — ৳${Number(sale.total_amount).toLocaleString()}`) : toast.error("ফোন নেই") },
                      { label: "ইমেইল", icon: Mail, color: "bg-indigo-600", onAction: () => email ? swipeIntents.email(email, `ইনভয়েস #${sale.id.slice(0,8)}`) : toast.error("ইমেইল নেই") },
                    ]}
                    rightActions={[
                      { label: "ভিউ", icon: Eye, color: "bg-amber-600", onAction: () => setSelectedSale(sale) },
                      { label: "শেয়ার", icon: Share2, color: "bg-slate-600", onAction: () => swipeIntents.share({ title: `Invoice #${sale.id.slice(0,8)}`, text: `${custName} — ৳${Number(sale.total_amount).toLocaleString()}` }) },
                      { label: "কপি", icon: Copy, color: "bg-primary", onAction: async () => { try { await navigator.clipboard.writeText(`#${sale.id.slice(0,8)} • ${custName} • ৳${Number(sale.total_amount).toLocaleString()}`); toast.success("কপি হয়েছে"); } catch {} } },
                    ]}
                  >
                    <div
                      onClick={() => setSelectedSale(sale)}
                      className="border border-border rounded-lg p-3 md:p-4 hover:border-primary hover:bg-accent/5 cursor-pointer transition-all card-hover bg-card"
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                            <span className="font-mono text-xs md:text-sm font-semibold text-primary">
                              #{sale.id.slice(0, 8)}
                            </span>
                            <Badge variant={sale.status === "completed" ? "default" : "secondary"} className="text-xs">
                              {sale.status}
                            </Badge>
                            <Badge variant="outline" className="capitalize text-xs">
                              {sale.payment_method}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm text-muted-foreground flex-wrap">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 md:h-3.5 md:w-3.5" />
                              <span className="hidden sm:inline">{format(new Date(sale.created_at), "dd MMM yyyy, hh:mm a")}</span>
                              <span className="sm:hidden">{format(new Date(sale.created_at), "dd MMM yyyy")}</span>
                            </div>
                            {(sale.customers || sale.instant_customer_name) && (
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3 md:h-3.5 md:w-3.5" />
                                {sale.customers?.name || sale.instant_customer_name}
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <Package className="h-3 w-3 md:h-3.5 md:w-3.5" />
                              {(sale.sale_items || []).length} {(sale.sale_items || []).length === 1 ? "item" : "items"}
                            </div>
                          </div>
                        </div>

                        <div className="text-right border-t border-border pt-2 md:border-0 md:pt-0">
                          <div className="text-xl md:text-2xl font-bold text-accent">
                            ৳{Number(sale.total_amount).toLocaleString()}
                          </div>
                          {Number((sale as any).due_amount) > 0 && (
                            <div className="text-xs font-semibold text-destructive">
                              বাকি: ৳{Number((sale as any).due_amount).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </SwipeableRow>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 md:mt-6 pt-4 md:pt-6 border-t">
              <div className="text-xs md:text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="text-xs md:text-sm"
                >
                  <span className="hidden sm:inline">Previous</span>
                  <span className="sm:hidden">Prev</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="text-xs md:text-sm"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
        </Card>
      </div>

      {/* Sale Detail Dialog */}
      <Dialog open={!!selectedSale} onOpenChange={() => setSelectedSale(null)}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-2xl">Sale Details</DialogTitle>
            <DialogDescription className="text-sm">
              Complete information about this transaction
            </DialogDescription>
          </DialogHeader>

          {selectedSale && (
            <div className="space-y-4 md:space-y-6">
              {/* Sale Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <Card>
                  <CardHeader className="pb-3 p-3 md:p-6">
                    <CardDescription className="text-xs md:text-sm">Sale ID</CardDescription>
                    <CardTitle className="text-sm md:text-base font-mono break-all">#{selectedSale.id}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3 p-3 md:p-6">
                    <CardDescription className="text-xs md:text-sm">Date & Time</CardDescription>
                    <CardTitle className="text-sm md:text-base">
                      <span className="hidden sm:inline">{format(new Date(selectedSale.created_at), "dd MMM yyyy, hh:mm a")}</span>
                      <span className="sm:hidden">{format(new Date(selectedSale.created_at), "dd MMM yyyy")}</span>
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3 p-3 md:p-6">
                    <CardDescription className="text-xs md:text-sm">Payment Method</CardDescription>
                    <CardTitle className="text-sm md:text-base capitalize">{selectedSale.payment_method}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3 p-3 md:p-6">
                    <CardDescription className="text-xs md:text-sm">Status</CardDescription>
                    <CardTitle className="text-sm md:text-base">
                      <Badge variant={selectedSale.status === "completed" ? "default" : "secondary"} className="text-xs">
                        {selectedSale.status}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {/* Customer Info */}
              {(selectedSale.customers || selectedSale.instant_customer_name) && (
                <Card>
                  <CardHeader className="p-3 md:p-6">
                    <CardTitle className="text-base md:text-lg flex items-center gap-2">
                      <User className="h-4 w-4 md:h-5 md:w-5" />
                      Customer Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 p-3 md:p-6 pt-0">
                    <div className="flex items-start gap-4">
                      <PhotoZoom
                        url={selectedSale.customers?.photo_url || selectedSale.customer_photo_url}
                        alt={selectedSale.customers?.name || selectedSale.instant_customer_name || "ক্রেতা"}
                        size="md"
                        fallbackInitials={(selectedSale.customers?.name || selectedSale.instant_customer_name || "?").charAt(0)}
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                          <span className="text-xs md:text-sm text-muted-foreground">Name:</span>
                          <span className="text-sm md:text-base font-semibold">
                            {selectedSale.customers?.name || selectedSale.instant_customer_name}
                          </span>
                        </div>
                        {(selectedSale.customers?.phone || selectedSale.instant_customer_phone) && (
                          <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                            <span className="text-xs md:text-sm text-muted-foreground">Phone:</span>
                            <span className="text-sm md:text-base">
                              {selectedSale.customers?.phone || selectedSale.instant_customer_phone}
                            </span>
                          </div>
                        )}
                        {selectedSale.customers?.email && (
                          <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                            <span className="text-xs md:text-sm text-muted-foreground">Email:</span>
                            <span className="text-sm md:text-base">{selectedSale.customers.email}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Products */}
              <Card>
                <CardHeader className="p-3 md:p-6">
                  <CardTitle className="text-base md:text-lg flex items-center gap-2">
                    <Package className="h-4 w-4 md:h-5 md:w-5" />
                    Products Sold
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 md:p-6 pt-0">
                  <div className="space-y-3 md:space-y-4">
                    {(selectedSale.sale_items || []).map((item, index) => (
                      <div key={index}>
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4">
                          <div className="flex-1 space-y-1">
                            <div className="text-sm md:text-base font-semibold">{item.products.name}</div>
                            <div className="text-xs md:text-sm text-muted-foreground space-y-0.5">
                              {item.products.brand && (
                                <div>Brand: {item.products.brand}</div>
                              )}
                              {item.products.model && (
                                <div>Model: {item.products.model}</div>
                              )}
                              {item.products.imei && (
                                <div className="break-all">IMEI: {item.products.imei}</div>
                              )}
                              {item.products.sku && (
                                <div className="break-all">SKU: {item.products.sku}</div>
                              )}
                              <div>Condition: <Badge variant="outline" className="capitalize text-xs">{item.condition}</Badge></div>
                            </div>
                          </div>
                          <div className="text-right space-y-1 border-t sm:border-0 pt-2 sm:pt-0">
                            <div className="text-xs md:text-sm text-muted-foreground">
                              {item.quantity} × ৳{Number(item.unit_price).toLocaleString()}
                            </div>
                            <div className="text-sm md:text-base font-semibold text-accent">
                              ৳{Number(item.total_price).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        {index < (selectedSale.sale_items || []).length - 1 && (
                          <Separator className="mt-3 md:mt-4" />
                        )}
                      </div>
                    ))}
                  </div>

                  <Separator className="my-3 md:my-4" />

                  {/* Total */}
                  <div className="flex justify-between items-center">
                    <span className="text-base md:text-lg font-semibold">Total Amount:</span>
                    <span className="text-xl md:text-2xl font-bold text-accent">
                      ৳{Number(selectedSale.total_amount).toLocaleString()}
                    </span>
                  </div>
                  {Number((selectedSale as any).paid_amount) > 0 && (
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-sm text-muted-foreground">Paid:</span>
                      <span className="text-sm">৳{Number((selectedSale as any).paid_amount).toLocaleString()}</span>
                    </div>
                  )}
                  {Number((selectedSale as any).due_amount) > 0 && (
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-sm font-semibold text-destructive">Due:</span>
                      <span className="text-sm font-bold text-destructive">৳{Number((selectedSale as any).due_amount).toLocaleString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Due Collection */}
              {Number((selectedSale as any).due_amount) > 0 && (
                <DueCollection
                  saleId={selectedSale.id}
                  currentDue={Number((selectedSale as any).due_amount)}
                />
              )}

              {/* Notes */}
              {selectedSale.notes && (
                <Card>
                  <CardHeader className="p-3 md:p-6">
                    <CardTitle className="text-base md:text-lg">Notes</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 md:p-6 pt-0">
                    <p className="text-xs md:text-sm text-muted-foreground">{selectedSale.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden Print Component */}
      <div className="hidden">
        <div ref={printRef} className="p-8 bg-white text-black">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Sales Report</h1>
            <p className="text-gray-600">Generated on {format(new Date(), "dd MMMM yyyy, hh:mm a")}</p>
            {hasActiveFilters && (
              <div className="mt-4 text-sm text-gray-600">
                <p className="font-semibold">Applied Filters:</p>
                {searchTerm && <p>Search: {searchTerm}</p>}
                {filterPaymentMethod !== "all" && <p>Payment Method: {filterPaymentMethod}</p>}
                {filterCustomer !== "all" && <p>Customer: {customers.find(c => c.id === filterCustomer)?.name}</p>}
                {filterDateFrom && <p>From: {format(new Date(filterDateFrom), "dd MMM yyyy")}</p>}
                {filterDateTo && <p>To: {format(new Date(filterDateTo), "dd MMM yyyy")}</p>}
              </div>
            )}
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8 pb-4 border-b-2 border-gray-300">
            <div className="text-center">
              <p className="text-gray-600 text-sm">Total Sales</p>
              <p className="text-2xl font-bold">{totalSales}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-600 text-sm">Total Revenue</p>
              <p className="text-2xl font-bold">৳{totalRevenue.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-600 text-sm">Average Sale</p>
              <p className="text-2xl font-bold">৳{averageSale.toFixed(0)}</p>
            </div>
          </div>

          {/* Sales Table */}
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left p-2 text-sm font-semibold">Date</th>
                <th className="text-left p-2 text-sm font-semibold">Sale ID</th>
                <th className="text-left p-2 text-sm font-semibold">Customer</th>
                <th className="text-left p-2 text-sm font-semibold">Products</th>
                <th className="text-left p-2 text-sm font-semibold">Payment</th>
                <th className="text-right p-2 text-sm font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="border-b border-gray-200">
                  <td className="p-2 text-xs">{format(new Date(sale.created_at), "dd MMM yyyy")}</td>
                  <td className="p-2 text-xs font-mono">#{sale.id.slice(0, 8)}</td>
                  <td className="p-2 text-xs">{sale.customers?.name || "Walk-in"}</td>
                  <td className="p-2 text-xs">
                    {(sale.sale_items || []).map((item, idx) => (
                      <div key={idx}>
                        {item?.products?.name} ({item?.quantity}x)
                        {item?.products?.imei && <span className="text-gray-500"> - {item.products.imei}</span>}
                      </div>
                    ))}
                  </td>
                  <td className="p-2 text-xs capitalize">{sale.payment_method}</td>
                  <td className="p-2 text-xs text-right font-semibold">৳{Number(sale.total_amount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-8 pt-4 border-t-2 border-gray-300 text-right">
            <p className="text-lg font-bold">Total: ৳{totalRevenue.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
