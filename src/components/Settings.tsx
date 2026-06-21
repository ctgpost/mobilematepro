import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useShopSettings } from "@/hooks/useShopSettings";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserManagement } from "@/components/UserManagement";
import { ActivityLog } from "@/components/ActivityLog";
import { StockSyncCheck } from "@/components/StockSyncCheck";
import { StaffPerformanceReport } from "@/components/StaffPerformanceReport";
import { useUserRole } from "@/hooks/useUserRole";
import { ActivityLogger } from "@/hooks/useActivityLog";
import { BrandingSettings } from "@/components/BrandingSettings";
import { PrinterSettings } from "@/components/PrinterSettings";
import { CloudinarySettings } from "@/components/CloudinarySettings";
import { ProductFormSettings } from "@/components/ProductFormSettings";
import { BackupExportSettings } from "@/components/BackupExportSettings";
import { OfflineDiagnostics } from "@/components/OfflineDiagnostics";
import { PageHeader } from "@/components/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function Settings() {
  const navigate = useNavigate();
  const { settings, logoSrc } = useShopSettings();
  const { isAdmin } = useUserRole();
  // Branding settings now directly visible for admin users

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isClearingSales, setIsClearingSales] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<any | null>(null);
  const [dryRunReport, setDryRunReport] = useState<{
    counts: Record<string, number>;
    issues: string[];
    summary: string;
  } | null>(null);
  const [validationReport, setValidationReport] = useState<{
    rows: Array<{ table: string; backup: number; restored: number; ok: boolean }>;
    allOk: boolean;
  } | null>(null);
  const [resetStats, setResetStats] = useState<{
    sales: number;
    saleItems: number;
    returns: number;
    purchases: number;
    purchaseItems: number;
    products: number;
    customers: number;
    suppliers: number;
    categories: number;
    totalRevenue: number;
  } | null>(null);
  const [salesStats, setSalesStats] = useState<{
    sales: number;
    saleItems: number;
    returns: number;
    totalRevenue: number;
  } | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showClearSalesDialog, setShowClearSalesDialog] = useState(false);
  const [profitDateFrom, setProfitDateFrom] = useState<Date | undefined>(undefined);
  const [profitDateTo, setProfitDateTo] = useState<Date | undefined>(undefined);
  const [activePeriod, setActivePeriod] = useState<string>("all");

  // Get database stats (counts only)
  const { data: stats } = useQuery({
    queryKey: ["database-stats"],
    queryFn: async () => {
      const [products, categories, customers, suppliers, sales, purchases, saleItems, purchaseItems, returns] = await Promise.all([
        supabase.from("products").select("*", { count: "exact", head: true }),
        supabase.from("categories").select("*", { count: "exact", head: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase.from("suppliers").select("*", { count: "exact", head: true }),
        supabase.from("sales").select("*", { count: "exact", head: true }),
        supabase.from("purchases").select("*", { count: "exact", head: true }),
        supabase.from("sale_items").select("*", { count: "exact", head: true }),
        supabase.from("purchase_items").select("*", { count: "exact", head: true }),
        supabase.from("returns").select("*", { count: "exact", head: true }),
      ]);

      return {
        products: products.count || 0,
        categories: categories.count || 0,
        customers: customers.count || 0,
        suppliers: suppliers.count || 0,
        sales: sales.count || 0,
        purchases: purchases.count || 0,
        saleItems: saleItems.count || 0,
        purchaseItems: purchaseItems.count || 0,
        returns: returns.count || 0,
      };
    },
  });

  // Get profit stats with date filtering
  const { data: profitStats } = useQuery({
    queryKey: ["profit-stats", profitDateFrom?.toISOString(), profitDateTo?.toISOString()],
    queryFn: async () => {
      let query = supabase.from("sale_items").select("unit_price, quantity, created_at, products(cost, condition)");
      
      if (profitDateFrom) {
        query = query.gte("created_at", startOfDay(profitDateFrom).toISOString());
      }
      if (profitDateTo) {
        query = query.lte("created_at", endOfDay(profitDateTo).toISOString());
      }
      
      const { data } = await query;

      let newMobileProfit = 0;
      let usedMobileProfit = 0;

      data?.forEach((item: any) => {
        const salePrice = Number(item.unit_price || 0);
        const costPrice = Number(item.products?.cost || 0);
        const quantity = Number(item.quantity || 1);
        const profit = (salePrice - costPrice) * quantity;
        // Use product condition instead of sale_items condition
        const productCondition = item.products?.condition || 'new';

        if (productCondition === 'new') {
          newMobileProfit += profit;
        } else {
          usedMobileProfit += profit;
        }
      });

      return {
        newMobileProfit,
        usedMobileProfit,
        totalProfit: newMobileProfit + usedMobileProfit,
      };
    },
  });

  const setPeriod = (period: string) => {
    setActivePeriod(period);
    const today = new Date();
    
    switch (period) {
      case "today":
        setProfitDateFrom(startOfDay(today));
        setProfitDateTo(endOfDay(today));
        break;
      case "week":
        setProfitDateFrom(startOfWeek(today, { weekStartsOn: 0 }));
        setProfitDateTo(endOfWeek(today, { weekStartsOn: 0 }));
        break;
      case "month":
        setProfitDateFrom(startOfMonth(today));
        setProfitDateTo(endOfMonth(today));
        break;
      case "all":
      default:
        setProfitDateFrom(undefined);
        setProfitDateTo(undefined);
        break;
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Failed to sign out");
    } else {
      toast.success("Signed out successfully");
      navigate("/auth");
    }
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      toast.info("ব্যাকআপ শুরু হয়েছে...");

      // Fetch ALL data tables (full 360° coverage)
      const [
        products,
        categories,
        customers,
        suppliers,
        sales,
        saleItems,
        purchases,
        purchaseItems,
        returns,
        duePayments,
        customerLedger,
        supplierReturns,
        investmentSectors,
        investmentEntries,
        investmentIncomes,
        activityLogs,
        shopSettings,
      ] = await Promise.all([
        supabase.from("products").select("*"),
        supabase.from("categories").select("*"),
        supabase.from("customers").select("*"),
        supabase.from("suppliers").select("*"),
        supabase.from("sales").select("*"),
        supabase.from("sale_items").select("*"),
        supabase.from("purchases").select("*"),
        supabase.from("purchase_items").select("*"),
        supabase.from("returns").select("*"),
        supabase.from("due_payments").select("*"),
        supabase.from("customer_ledger_entries").select("*"),
        supabase.from("supplier_returns").select("*"),
        supabase.from("investment_sectors").select("*"),
        supabase.from("investment_entries").select("*"),
        supabase.from("investment_incomes").select("*"),
        supabase.from("activity_logs").select("*"),
        supabase.from("shop_settings").select("*"),
      ]);

      const backup = {
        version: "2.0",
        timestamp: new Date().toISOString(),
        data: {
          products: products.data || [],
          categories: categories.data || [],
          customers: customers.data || [],
          suppliers: suppliers.data || [],
          sales: sales.data || [],
          sale_items: saleItems.data || [],
          purchases: purchases.data || [],
          purchase_items: purchaseItems.data || [],
          returns: returns.data || [],
          due_payments: duePayments.data || [],
          customer_ledger_entries: customerLedger.data || [],
          supplier_returns: supplierReturns.data || [],
          investment_sectors: investmentSectors.data || [],
          investment_entries: investmentEntries.data || [],
          investment_incomes: investmentIncomes.data || [],
          activity_logs: activityLogs.data || [],
          shop_settings: shopSettings.data || [],
        },
      };

      // Counts summary
      const counts = Object.fromEntries(
        Object.entries(backup.data).map(([k, v]: any) => [k, v.length])
      );
      console.log("Backup counts:", counts);

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `applestore-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const total = Object.values(counts).reduce((a: number, b: any) => a + b, 0);
      toast.success(`ব্যাকআপ সম্পন্ন! মোট ${total} রেকর্ড সংরক্ষিত`);
      await ActivityLogger.dataBackup();
    } catch (error: any) {
      toast.error("ব্যাকআপ ব্যর্থ: " + error.message);
    } finally {
      setIsBackingUp(false);
    }
  };

  // ----- Restore: file → dry-run → confirm → execute → validation report -----
  const TABLES = [
    "categories", "suppliers", "customers", "investment_sectors", "products",
    "sales", "purchases", "sale_items", "purchase_items", "due_payments",
    "customer_ledger_entries", "supplier_returns", "returns",
    "investment_entries", "investment_incomes", "activity_logs", "shop_settings",
  ] as const;

  const performDryRun = (backup: any) => {
    const data = backup.data || {};
    const counts: Record<string, number> = {};
    const issues: string[] = [];

    for (const t of TABLES) counts[t] = (data[t] || []).length;

    // FK consistency checks
    const idSet = (rows: any[]) => new Set((rows || []).map((r: any) => r.id));
    const categoryIds = idSet(data.categories);
    const supplierIds = idSet(data.suppliers);
    const customerIds = idSet(data.customers);
    const productIds = idSet(data.products);
    const saleIds = idSet(data.sales);
    const purchaseIds = idSet(data.purchases);
    const saleItemIds = idSet(data.sale_items);
    const sectorIds = idSet(data.investment_sectors);

    const check = (rows: any[] | undefined, fkField: string, parentSet: Set<any>, table: string, parent: string) => {
      (rows || []).forEach((r: any) => {
        const v = r[fkField];
        if (v && !parentSet.has(v)) {
          issues.push(`${table}.${fkField} → ${parent} এ পাওয়া যায়নি (id=${v})`);
        }
      });
    };

    check(data.products, "category_id", categoryIds, "products", "categories");
    check(data.products, "supplier_id", supplierIds, "products", "suppliers");
    check(data.sales, "customer_id", customerIds, "sales", "customers");
    check(data.purchases, "supplier_id", supplierIds, "purchases", "suppliers");
    check(data.sale_items, "sale_id", saleIds, "sale_items", "sales");
    check(data.sale_items, "product_id", productIds, "sale_items", "products");
    check(data.purchase_items, "purchase_id", purchaseIds, "purchase_items", "purchases");
    check(data.purchase_items, "product_id", productIds, "purchase_items", "products");
    check(data.due_payments, "sale_id", saleIds, "due_payments", "sales");
    check(data.customer_ledger_entries, "customer_id", customerIds, "customer_ledger_entries", "customers");
    check(data.supplier_returns, "supplier_id", supplierIds, "supplier_returns", "suppliers");
    check(data.supplier_returns, "product_id", productIds, "supplier_returns", "products");
    check(data.returns, "sale_id", saleIds, "returns", "sales");
    check(data.returns, "sale_item_id", saleItemIds, "returns", "sale_items");
    check(data.returns, "product_id", productIds, "returns", "products");
    check(data.investment_entries, "sector_id", sectorIds, "investment_entries", "investment_sectors");
    check(data.investment_incomes, "sector_id", sectorIds, "investment_incomes", "investment_sectors");

    // Required-field checks
    (data.products || []).forEach((p: any) => {
      if (!p.name) issues.push(`products: name অনুপস্থিত (id=${p.id})`);
    });
    (data.customers || []).forEach((c: any) => {
      if (!c.name) issues.push(`customers: name অনুপস্থিত (id=${c.id})`);
    });

    // Backup version sanity
    if (!backup.version) issues.push("backup.version নেই");
    if (!backup.timestamp) issues.push("backup.timestamp নেই");

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const summary = `মোট ${total} রেকর্ড — ${issues.length} সমস্যা সনাক্ত`;
    return { counts, issues, summary };
  };

  const handleRestoreFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsDryRunning(true);
    setDryRunReport(null);
    setValidationReport(null);
    setPendingBackup(null);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup.version || !backup.data) throw new Error("Invalid backup file format");
      const report = performDryRun(backup);
      setPendingBackup(backup);
      setDryRunReport(report);
      toast.success(`ড্রাই-রান সম্পন্ন: ${report.summary}`);
    } catch (error: any) {
      toast.error("ড্রাই-রান ব্যর্থ: " + error.message);
    } finally {
      setIsDryRunning(false);
      event.target.value = "";
    }
  };

  const executeRestore = async () => {
    if (!pendingBackup) return;
    if (!confirm("⚠️ পুনরুদ্ধার করলে বর্তমান সব ডেটা মুছে যাবে! আপনি কি নিশ্চিত?")) return;

    setIsRestoring(true);
    setValidationReport(null);
    try {
      toast.info("পুনরুদ্ধার শুরু হয়েছে...");
      const backup = pendingBackup;
      const SENTINEL = "00000000-0000-0000-0000-000000000000";
      const del = (table: string) =>
        supabase.from(table as any).delete().neq("id", SENTINEL);

      await Promise.all([
        del("returns"), del("due_payments"), del("customer_ledger_entries"),
        del("supplier_returns"), del("activity_logs"),
        del("investment_entries"), del("investment_incomes"),
      ]);
      await Promise.all([del("sale_items"), del("purchase_items")]);
      await Promise.all([del("sales"), del("purchases")]);
      await del("products");
      await Promise.all([del("customers"), del("suppliers"), del("categories"), del("investment_sectors")]);

      const data = backup.data;
      const tryInsert = async (table: string, rows: any[] | undefined) => {
        if (!rows?.length) return;
        const { error } = await supabase.from(table as any).insert(rows);
        if (error) console.warn(`[restore] ${table}:`, error.message);
      };

      await Promise.all([
        tryInsert("categories", data.categories),
        tryInsert("suppliers", data.suppliers),
        tryInsert("customers", data.customers),
        tryInsert("investment_sectors", data.investment_sectors),
      ]);
      await tryInsert("products", data.products);
      await Promise.all([tryInsert("sales", data.sales), tryInsert("purchases", data.purchases)]);
      await Promise.all([
        tryInsert("sale_items", data.sale_items),
        tryInsert("purchase_items", data.purchase_items),
        tryInsert("due_payments", data.due_payments),
        tryInsert("customer_ledger_entries", data.customer_ledger_entries),
        tryInsert("supplier_returns", data.supplier_returns),
        tryInsert("returns", data.returns),
        tryInsert("investment_entries", data.investment_entries),
        tryInsert("investment_incomes", data.investment_incomes),
        tryInsert("activity_logs", data.activity_logs),
      ]);

      if (data.shop_settings?.length) {
        const row = data.shop_settings[0];
        const { data: existing } = await supabase
          .from("shop_settings").select("id").limit(1).maybeSingle();
        if (existing?.id) {
          await supabase.from("shop_settings").update({ ...row, id: existing.id }).eq("id", existing.id);
        } else {
          await supabase.from("shop_settings").insert(row);
        }
      }

      // Validation report — count actual rows after restore
      toast.info("ভ্যালিডেশন চলছে...");
      const rows: Array<{ table: string; backup: number; restored: number; ok: boolean }> = [];
      for (const t of TABLES) {
        const expected = (data[t] || []).length;
        const { count } = await supabase.from(t as any).select("*", { count: "exact", head: true });
        const actual = count || 0;
        rows.push({ table: t, backup: expected, restored: actual, ok: actual === expected });
      }
      const allOk = rows.every((r) => r.ok);
      setValidationReport({ rows, allOk });

      if (allOk) {
        toast.success("ডেটা পুনরুদ্ধার সম্পন্ন — সব রেকর্ড মিলে গেছে");
      } else {
        toast.warning("পুনরুদ্ধার সম্পন্ন তবে কিছু রেকর্ড মেলেনি — রিপোর্ট দেখুন");
      }
      await ActivityLogger.dataRestore();
      setPendingBackup(null);
      setDryRunReport(null);
    } catch (error: any) {
      toast.error("পুনরুদ্ধার ব্যর্থ: " + error.message);
    } finally {
      setIsRestoring(false);
    }
  };

  const fetchResetStats = async () => {
    try {
      const [salesRes, saleItemsRes, returnsRes, purchasesRes, purchaseItemsRes, productsRes, customersRes, suppliersRes, categoriesRes] = await Promise.all([
        supabase.from("sales").select("total_amount", { count: "exact" }),
        supabase.from("sale_items").select("*", { count: "exact", head: true }),
        supabase.from("returns").select("*", { count: "exact", head: true }),
        supabase.from("purchases").select("*", { count: "exact", head: true }),
        supabase.from("purchase_items").select("*", { count: "exact", head: true }),
        supabase.from("products").select("*", { count: "exact", head: true }),
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase.from("suppliers").select("*", { count: "exact", head: true }),
        supabase.from("categories").select("*", { count: "exact", head: true }),
      ]);

      const totalRevenue = salesRes.data?.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0) || 0;

      setResetStats({
        sales: salesRes.count || 0,
        saleItems: saleItemsRes.count || 0,
        returns: returnsRes.count || 0,
        purchases: purchasesRes.count || 0,
        purchaseItems: purchaseItemsRes.count || 0,
        products: productsRes.count || 0,
        customers: customersRes.count || 0,
        suppliers: suppliersRes.count || 0,
        categories: categoriesRes.count || 0,
        totalRevenue,
      });
      setShowResetDialog(true);
    } catch (error: any) {
      toast.error("Failed to fetch statistics: " + error.message);
    }
  };

  const fetchSalesStats = async () => {
    try {
      const [salesRes, saleItemsRes, returnsRes] = await Promise.all([
        supabase.from("sales").select("total_amount", { count: "exact" }),
        supabase.from("sale_items").select("*", { count: "exact", head: true }),
        supabase.from("returns").select("*", { count: "exact", head: true }),
      ]);

      const totalRevenue = salesRes.data?.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0) || 0;

      setSalesStats({
        sales: salesRes.count || 0,
        saleItems: saleItemsRes.count || 0,
        returns: returnsRes.count || 0,
        totalRevenue,
      });
      setShowClearSalesDialog(true);
    } catch (error: any) {
      toast.error("Failed to fetch sales statistics: " + error.message);
    }
  };

  const handleClearSalesData = async () => {
    setIsClearingSales(true);
    setShowClearSalesDialog(false);
    try {
      toast.info("Clearing sales data...");

      // Delete in correct order respecting foreign keys
      // 1. Delete returns first (references sale_items)
      toast.info("Clearing returns...");
      const returnsResult = await supabase.from("returns").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (returnsResult.error) throw returnsResult.error;
      
      // 2. Delete sale_items
      toast.info("Clearing sale items...");
      const saleItemsResult = await supabase.from("sale_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (saleItemsResult.error) throw saleItemsResult.error;
      
      // 3. Delete sales
      toast.info("Clearing sales records...");
      const salesResult = await supabase.from("sales").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (salesResult.error) throw salesResult.error;

      toast.success("Sales data cleared successfully! Refreshing...");
      await ActivityLogger.dataReset();
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      toast.error("Clear sales failed: " + error.message);
      console.error("Clear sales error:", error);
    } finally {
      setIsClearingSales(false);
      setSalesStats(null);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    setShowResetDialog(false);
    try {
      toast.info("Resetting database...");

      // Delete in correct order respecting foreign keys
      // 1. Delete returns first (references sale_items)
      toast.info("Clearing returns...");
      const returnsResult = await supabase.from("returns").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (returnsResult.error) throw returnsResult.error;
      
      // 2. Delete sale_items and purchase_items (all transaction details)
      toast.info("Clearing sale items and purchase items...");
      const [saleItemsResult, purchaseItemsResult] = await Promise.all([
        supabase.from("sale_items").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("purchase_items").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);
      if (saleItemsResult.error) throw saleItemsResult.error;
      if (purchaseItemsResult.error) throw purchaseItemsResult.error;
      
      // 3. Delete sales and purchases (all sales reports data)
      toast.info("Clearing all sales and purchase records...");
      const [salesResult, purchasesResult] = await Promise.all([
        supabase.from("sales").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("purchases").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);
      if (salesResult.error) throw salesResult.error;
      if (purchasesResult.error) throw purchasesResult.error;

      // 4. Delete products (references categories)
      toast.info("Clearing products...");
      const productsResult = await supabase.from("products").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (productsResult.error) throw productsResult.error;

      // 5. Delete base tables (customers, suppliers, categories)
      toast.info("Clearing customers, suppliers, and categories...");
      const [customersResult, suppliersResult, categoriesResult] = await Promise.all([
        supabase.from("customers").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("suppliers").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("categories").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ]);
      if (customersResult.error) throw customersResult.error;
      if (suppliersResult.error) throw suppliersResult.error;
      if (categoriesResult.error) throw categoriesResult.error;

      toast.success("All data including sales reports completely reset! Refreshing...");
      await ActivityLogger.dataReset();
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: any) {
      toast.error("Reset failed: " + error.message);
      console.error("Reset error:", error);
    } finally {
      setIsResetting(false);
      setResetStats(null);
    }
  };

  const totalRecords = stats
    ? stats.products + stats.categories + stats.customers + stats.suppliers + stats.sales + stats.purchases + stats.saleItems + stats.purchaseItems + stats.returns
    : 0;

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      <PageHeader
        storageKey="settings"
        title="সেটিংস"
        subtitle="অ্যাকাউন্ট ও সিস্টেম ডেটা ব্যবস্থাপনা"
        icon={
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-muted flex items-center justify-center shadow-lg">
            <img src={logoSrc} alt={settings.shop_name} className="w-10 h-10 sm:w-14 sm:h-14 object-contain" />
          </div>
        }
      />

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pb-6 space-y-6">
        {/* Database Statistics */}
        <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-foreground">📊 Database Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-primary/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Products</p>
            <p className="text-2xl font-bold text-primary">{stats?.products || 0}</p>
          </div>
          <div className="bg-accent/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Categories</p>
            <p className="text-2xl font-bold text-accent">{stats?.categories || 0}</p>
          </div>
          <div className="bg-primary/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Customers</p>
            <p className="text-2xl font-bold text-primary">{stats?.customers || 0}</p>
          </div>
          <div className="bg-accent/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Suppliers</p>
            <p className="text-2xl font-bold text-accent">{stats?.suppliers || 0}</p>
          </div>
          <div className="bg-primary/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Sales</p>
            <p className="text-2xl font-bold text-primary">{stats?.sales || 0}</p>
          </div>
          <div className="bg-accent/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Purchases</p>
            <p className="text-2xl font-bold text-accent">{stats?.purchases || 0}</p>
          </div>
        </div>

        {/* Profit Statistics with Date Filter */}
        <div className="mt-6 pt-6 border-t border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h3 className="text-lg font-semibold text-foreground">💰 Profit Statistics</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={activePeriod === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod("all")}
              >
                All Time
              </Button>
              <Button
                variant={activePeriod === "today" ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod("today")}
              >
                Today
              </Button>
              <Button
                variant={activePeriod === "week" ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod("week")}
              >
                This Week
              </Button>
              <Button
                variant={activePeriod === "month" ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod("month")}
              >
                This Month
              </Button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !profitDateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {profitDateFrom ? format(profitDateFrom, "PPP") : "From date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={profitDateFrom}
                  onSelect={(date) => { setProfitDateFrom(date); setActivePeriod("custom"); }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal", !profitDateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {profitDateTo ? format(profitDateTo, "PPP") : "To date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={profitDateTo}
                  onSelect={(date) => { setProfitDateTo(date); setActivePeriod("custom"); }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {(profitDateFrom || profitDateTo) && (
              <Button variant="ghost" size="sm" onClick={() => setPeriod("all")}>
                Clear
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-green-500/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">নতুন মোবাইল লাভ</p>
              <p className="text-2xl font-bold text-green-600">৳{(profitStats?.newMobileProfit || 0).toLocaleString('bn-BD')}</p>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">ব্যবহৃত মোবাইল লাভ</p>
              <p className="text-2xl font-bold text-blue-600">৳{(profitStats?.usedMobileProfit || 0).toLocaleString('bn-BD')}</p>
            </div>
            <div className="bg-emerald-500/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">মোট লাভ</p>
              <p className="text-2xl font-bold text-emerald-600">৳{(profitStats?.totalProfit || 0).toLocaleString('bn-BD')}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="bg-primary/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">বিক্রয় আইটেম</p>
            <p className="text-2xl font-bold text-primary">{stats?.saleItems || 0}</p>
          </div>
          <div className="bg-accent/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">ক্রয় আইটেম</p>
            <p className="text-2xl font-bold text-accent">{stats?.purchaseItems || 0}</p>
          </div>
          <div className="bg-primary/5 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">রিটার্ন</p>
            <p className="text-2xl font-bold text-primary">{stats?.returns || 0}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            মোট রেকর্ড: <span className="font-bold text-foreground">{totalRecords}</span>
          </p>
          <StockSyncCheck />
        </div>
        </Card>

        {/* Staff Performance Report */}
        <StaffPerformanceReport />

        {/* User Management */}
        <UserManagement />

        {/* Activity Log */}
        <ActivityLog />

      {/* Backup & Restore — admin only */}
      {isAdmin && (
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-foreground">💾 Backup & Restore</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-medium mb-2">Backup Database</h3>
            <p className="text-sm text-muted-foreground mb-3">
              সব টেবিলের পরিপূর্ণ JSON ব্যাকআপ ডাউনলোড করুন।
            </p>
            <Button onClick={handleBackup} disabled={isBackingUp} className="w-full md:w-auto">
              {isBackingUp ? "⏳ Creating Backup..." : "📥 Download Backup"}
            </Button>
          </div>

          <div className="pt-4 border-t border-border">
            <h3 className="font-medium mb-2">Restore Database (Dry-run + Validation)</h3>
            <p className="text-sm text-muted-foreground mb-3">
              ১) ফাইল সিলেক্ট করলে আগে <b>ড্রাই-রান</b> চলবে — কোনো ডেটা পরিবর্তন হবে না, শুধু FK ও ফিল্ড যাচাই।
              ২) রিপোর্ট দেখে সন্তুষ্ট হলে <b>Confirm Restore</b> চাপুন।
              ৩) রিস্টোর শেষে প্রতিটি টেবিলের কাউন্ট ব্যাকআপের সাথে মিলিয়ে রিপোর্ট দেখাবে।
            </p>
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreFileSelect}
              disabled={isDryRunning || isRestoring}
              className="hidden"
              id="restore-file"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => document.getElementById("restore-file")?.click()}
                disabled={isDryRunning || isRestoring}
                variant="outline"
              >
                {isDryRunning ? "⏳ Dry-run চলছে..." : "🔍 Dry-run + ফাইল সিলেক্ট"}
              </Button>
              {pendingBackup && dryRunReport && (
                <Button
                  onClick={executeRestore}
                  disabled={isRestoring}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isRestoring ? "⏳ Restoring..." : `✅ Confirm Restore (${dryRunReport.issues.length} issues)`}
                </Button>
              )}
              {pendingBackup && (
                <Button
                  variant="ghost"
                  onClick={() => { setPendingBackup(null); setDryRunReport(null); }}
                  disabled={isRestoring}
                >
                  বাতিল
                </Button>
              )}
            </div>

            {/* Dry-run report */}
            {dryRunReport && (
              <div className="mt-4 p-4 rounded-lg border border-border bg-muted/30 text-sm space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="font-semibold">🔍 Dry-run Report</p>
                  <span className={dryRunReport.issues.length === 0 ? "text-green-600 font-semibold" : "text-orange-600 font-semibold"}>
                    {dryRunReport.summary}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(dryRunReport.counts).map(([t, c]) => (
                    <div key={t} className="flex justify-between bg-background/50 rounded px-2 py-1">
                      <span className="text-muted-foreground">{t}</span>
                      <span className="font-semibold">{c}</span>
                    </div>
                  ))}
                </div>
                {dryRunReport.issues.length > 0 && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded p-2 max-h-48 overflow-y-auto">
                    <p className="font-semibold text-destructive mb-1">⚠️ সমস্যা ({dryRunReport.issues.length})</p>
                    <ul className="list-disc list-inside text-xs space-y-0.5 text-destructive">
                      {dryRunReport.issues.slice(0, 50).map((i, idx) => <li key={idx}>{i}</li>)}
                      {dryRunReport.issues.length > 50 && <li>... আরও {dryRunReport.issues.length - 50} টি</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Validation report (post-restore) */}
            {validationReport && (
              <div className="mt-4 p-4 rounded-lg border border-border bg-muted/30 text-sm space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="font-semibold">📊 Restore Validation Report</p>
                  <span className={validationReport.allOk ? "text-green-600 font-semibold" : "text-orange-600 font-semibold"}>
                    {validationReport.allOk ? "✅ সব রেকর্ড মিলে গেছে" : "⚠️ কিছু রেকর্ড মেলেনি"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-1 pr-2">টেবিল</th>
                        <th className="py-1 pr-2 text-right">Backup</th>
                        <th className="py-1 pr-2 text-right">Restored</th>
                        <th className="py-1 pr-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationReport.rows.map((r) => (
                        <tr key={r.table} className="border-b border-border/40">
                          <td className="py-1 pr-2 font-medium">{r.table}</td>
                          <td className="py-1 pr-2 text-right">{r.backup}</td>
                          <td className="py-1 pr-2 text-right">{r.restored}</td>
                          <td className={`py-1 pr-2 text-right ${r.ok ? "text-green-600" : "text-destructive"}`}>
                            {r.ok ? "✓ OK" : `✗ ${r.restored - r.backup > 0 ? "+" : ""}${r.restored - r.backup}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setValidationReport(null); window.location.reload(); }}
                >
                  🔄 রিফ্রেশ
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>
      )}

      {/* Reset Database */}
      <Card className="p-6 border-destructive/50">
        <h2 className="text-xl font-semibold mb-4 text-destructive">⚠️ Danger Zone</h2>
        <div className="space-y-4">
          {/* Clear Sales Data Only */}
          <div>
            <h3 className="font-medium mb-2">Clear Sales Data Only</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Delete only sales records, sale items, and returns. Products, customers, suppliers, and categories will be kept intact.
            </p>
            <Button 
              variant="outline" 
              disabled={isClearingSales} 
              className="w-full md:w-auto border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
              onClick={fetchSalesStats}
            >
              {isClearingSales ? "⏳ Clearing..." : "🧹 Clear Sales Data"}
            </Button>
            
            <AlertDialog open={showClearSalesDialog} onOpenChange={setShowClearSalesDialog}>
              <AlertDialogContent className="max-w-xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-2xl">⚠️ Clear Sales Data</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-4">
                    <p className="text-base font-semibold">
                      The following sales data will be permanently deleted:
                    </p>
                    
                    {salesStats && (
                      <div className="space-y-3 bg-muted p-4 rounded-lg">
                        <div className="space-y-2">
                          <h4 className="font-semibold text-foreground">Sales & Transactions</h4>
                          <div className="space-y-1 text-sm">
                            <p className="flex justify-between">
                              <span>Sales Records:</span>
                              <span className="font-semibold text-destructive">{salesStats.sales}</span>
                            </p>
                            <p className="flex justify-between">
                              <span>Sale Items:</span>
                              <span className="font-semibold text-destructive">{salesStats.saleItems}</span>
                            </p>
                            <p className="flex justify-between">
                              <span>Total Revenue:</span>
                              <span className="font-semibold text-destructive">৳{salesStats.totalRevenue.toLocaleString()}</span>
                            </p>
                            <p className="flex justify-between">
                              <span>Returns:</span>
                              <span className="font-semibold text-destructive">{salesStats.returns}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3 rounded-lg">
                      <p className="text-sm text-green-700 dark:text-green-400 font-semibold">
                        ✅ Products, Customers, Suppliers, and Categories will remain unchanged
                      </p>
                    </div>

                    <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 p-3 rounded-lg">
                      <p className="text-sm text-orange-700 dark:text-orange-400 font-semibold">
                        ⚠️ This action cannot be undone. Make sure you have a backup if needed.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearSalesData} className="bg-orange-600 text-white hover:bg-orange-700">
                    Clear Sales Data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="font-medium mb-2">Reset Database</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Permanently delete ALL data from the database. This action cannot be undone!
            </p>
            <Button 
              variant="destructive" 
              disabled={isResetting} 
              className="w-full md:w-auto"
              onClick={fetchResetStats}
            >
              {isResetting ? "⏳ Resetting..." : "🗑️ Reset All Data"}
            </Button>
            
            <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
              <AlertDialogContent className="max-w-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-2xl">⚠️ Confirm Database Reset</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-4">
                    <p className="text-base font-semibold">
                      The following data will be permanently deleted:
                    </p>
                    
                    {resetStats && (
                      <div className="space-y-3 bg-muted p-4 rounded-lg">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <h4 className="font-semibold text-foreground">Sales & Transactions</h4>
                            <div className="space-y-1 text-sm">
                              <p className="flex justify-between">
                                <span>Sales Records:</span>
                                <span className="font-semibold text-destructive">{resetStats.sales}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Sale Items:</span>
                                <span className="font-semibold text-destructive">{resetStats.saleItems}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Total Revenue:</span>
                                <span className="font-semibold text-destructive">৳{resetStats.totalRevenue.toLocaleString()}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Returns:</span>
                                <span className="font-semibold text-destructive">{resetStats.returns}</span>
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h4 className="font-semibold text-foreground">Inventory & Data</h4>
                            <div className="space-y-1 text-sm">
                              <p className="flex justify-between">
                                <span>Products:</span>
                                <span className="font-semibold text-destructive">{resetStats.products}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Customers:</span>
                                <span className="font-semibold text-destructive">{resetStats.customers}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Suppliers:</span>
                                <span className="font-semibold text-destructive">{resetStats.suppliers}</span>
                              </p>
                              <p className="flex justify-between">
                                <span>Categories:</span>
                                <span className="font-semibold text-destructive">{resetStats.categories}</span>
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-border">
                          <div className="space-y-1 text-sm">
                            <p className="flex justify-between">
                              <span>Purchases:</span>
                              <span className="font-semibold text-destructive">{resetStats.purchases}</span>
                            </p>
                            <p className="flex justify-between">
                              <span>Purchase Items:</span>
                              <span className="font-semibold text-destructive">{resetStats.purchaseItems}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="bg-destructive/10 border border-destructive/30 p-3 rounded-lg">
                      <p className="text-sm text-destructive font-semibold">
                        ⚠️ This action cannot be undone! Make sure you have a backup before proceeding.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Yes, Delete Everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </Card>

      {/* Account */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-foreground">👤 Account</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">You are currently signed in</p>
            <Button
              variant="destructive"
              onClick={handleSignOut}
              className="w-full md:w-auto"
            >
              🚪 Sign Out
            </Button>
          </div>
        </div>
      </Card>

      {/* About */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-foreground">ℹ️ About</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="font-semibold text-lg text-foreground">{settings.shop_name}</p>
          <p>Shop Management System v1.0</p>
          <p>A comprehensive shop management solution for mobile phone businesses</p>
          <p className="pt-2 text-xs">
            Features: Products, Categories, POS, Customers, Suppliers, Purchase Orders, Reports, Backup & Restore
          </p>
        </div>
      </Card>

      {/* Full Backup & Auto Export */}
      <BackupExportSettings />

      {/* Offline Diagnostics & Management */}
      <OfflineDiagnostics />

      {/* Product Form Settings - admin only */}
      {isAdmin && <ProductFormSettings />}

      {/* Printer & Barcode Settings - visible for admin users */}
      {isAdmin && <PrinterSettings />}
      {isAdmin && <CloudinarySettings />}

      {/* Branding Settings - visible for admin users */}
      {isAdmin && <BrandingSettings />}
      </div>
    </div>
  );
}
