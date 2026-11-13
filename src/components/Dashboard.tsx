import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useShopSettings } from "@/hooks/useShopSettings";
import { MobileDashboardWidget } from "./MobileDashboardWidget";
import { fetchAll } from "@/lib/fetchAll";
import { PageHeader } from "./PageHeader";
import { LanguageSwitch } from "./LanguageProvider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, CreditCard, Eye, Package, UserRound, Truck } from "lucide-react";

interface DashboardProps {
  onNavigateToPOS?: () => void;
  onNavigateToProducts?: () => void;
}

export function Dashboard({ onNavigateToPOS, onNavigateToProducts }: DashboardProps = {}) {
  const { settings, logoSrc } = useShopSettings();
  const [activityFilter, setActivityFilter] = useState<"all" | "sale" | "purchase">("all");
  const [selectedActivity, setSelectedActivity] = useState<any>(null);

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["products", "dashboard-all"],
    queryFn: async () => fetchAll<any>("products", "*"),
  });

  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ["sales", "dashboard-all"],
    queryFn: async () =>
      fetchAll<any>("sales", "*, customers(name, phone), sale_items(*, products(name, sku, condition, imei))", (q) => q.order("created_at", { ascending: false })),
  });

  const { data: purchaseEntries = [], isLoading: purchasesLoading } = useQuery({
    queryKey: ["dashboard", "recent-purchases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("supplier_ledger_entries").select("*")
        .eq("transaction_type", "purchase").order("created_at", { ascending: false }).limit(40);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: completedReturns } = useQuery({
    queryKey: ["returns", "dashboard-all"],
    // Unlimited fetch — no 1000-row cap
    queryFn: async () =>
      fetchAll<any>("returns", "refund_amount, created_at, status", (q) => q.eq("status", "completed")),
  });

  const totalProducts = products?.length || 0;
  const outOfStockProducts = products?.filter(p => p.stock_quantity <= 0).length || 0;
  const totalSales = sales?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
  const totalReturnsAmount = (completedReturns || []).reduce((s: number, r: any) => s + Number(r.refund_amount || 0), 0);
  const netSales = totalSales - totalReturnsAmount;
  const isSameDay = (d: Date, ref: Date) => d.toDateString() === ref.toDateString();
  const todayRef = new Date();
  const startOfWeek = new Date(); startOfWeek.setDate(todayRef.getDate() - 7);
  const startOfMonth = new Date(); startOfMonth.setMonth(todayRef.getMonth() - 1);
  const todayReturns = (completedReturns || []).filter((r: any) => isSameDay(new Date(r.created_at), todayRef)).reduce((s: number, r: any) => s + Number(r.refund_amount || 0), 0);
  const weekReturns = (completedReturns || []).filter((r: any) => new Date(r.created_at) >= startOfWeek).reduce((s: number, r: any) => s + Number(r.refund_amount || 0), 0);
  const monthReturns = (completedReturns || []).filter((r: any) => new Date(r.created_at) >= startOfMonth).reduce((s: number, r: any) => s + Number(r.refund_amount || 0), 0);
  const todaySales = sales?.filter(s => 
    new Date(s.created_at).toDateString() === new Date().toDateString()
  ).length || 0;

  const newProducts = products?.filter(p => p.condition === 'new').length || 0;
  const usedProducts = products?.filter(p => p.condition === 'used').length || 0;
  const newProductsStock = products?.filter(p => p.condition === 'new').reduce((sum, p) => sum + p.stock_quantity, 0) || 0;
  const usedProductsStock = products?.filter(p => p.condition === 'used').reduce((sum, p) => sum + p.stock_quantity, 0) || 0;
  
  const newProductsInvestment = products?.filter(p => p.condition === 'new').reduce((sum, p) => sum + (Number(p.cost) * p.stock_quantity), 0) || 0;
  const usedProductsInvestment = products?.filter(p => p.condition === 'used').reduce((sum, p) => sum + (Number(p.cost) * p.stock_quantity), 0) || 0;
  const totalInvestment = newProductsInvestment + usedProductsInvestment;
  
  let newSalesRevenue = 0;
  let usedSalesRevenue = 0;
  let newSalesCount = 0;
  let usedSalesCount = 0;
  
  sales?.forEach(sale => {
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

  const stats = [
    { label: "মোট প্রোডাক্ট", value: totalProducts, icon: "📦", color: "from-amber-500 to-orange-600" },
    { label: "আউট অফ স্টক", value: outOfStockProducts, icon: "🚫", color: "from-rose-500 to-red-600" },
    { label: "মোট বিক্রয়", value: `৳${totalSales.toLocaleString('bn-BD')}`, icon: "💰", color: "from-emerald-500 to-teal-600" },
    { label: "আজকের বিক্রয়", value: todaySales, icon: "📈", color: "from-sky-500 to-indigo-600" },
  ];

  const isLoading = productsLoading || salesLoading;

  const LoadingSkeleton = () => (
    <div className="flex flex-col h-screen animate-fade-in">
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border pb-4">
        <div className="flex items-start justify-between">
          <div>
            <Skeleton className="h-9 w-48 mb-2" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="w-20 h-20 rounded-lg" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-32" />
                </div>
                <Skeleton className="w-10 h-10 rounded-lg" />
              </div>
            </Card>
          ))}
        </div>
        <Card className="p-4">
          <Skeleton className="h-6 w-48 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-32 mb-3" />
                <Skeleton className="h-8 w-24" />
              </Card>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      <PageHeader
        storageKey="dashboard"
        title="ড্যাশবোর্ড"
        subtitle="স্বাগতম! আপনার ব্যবসার সারসংক্ষেপ দেখুন।"
        cornerControl={<LanguageSwitch />}
        icon={<img src={logoSrc} alt={settings.shop_name} className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 shrink-0 object-contain" />}
      />

      <div className="flex-1 overflow-y-auto pb-6 space-y-4 sm:space-y-4 pt-3">
        <MobileDashboardWidget 
          onNavigateToPOS={onNavigateToPOS}
          onNavigateToProducts={onNavigateToProducts}
        />
        <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((stat, index) => (
          <Card key={index} className="min-w-0 overflow-hidden p-3 sm:p-4 card-hover border-border bg-card">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="break-words text-xs sm:text-sm font-medium leading-snug text-muted-foreground">{stat.label}</p>
                <p className="min-w-0 break-words [overflow-wrap:anywhere] text-[clamp(1rem,1.45vw,1.5rem)] font-bold leading-tight tabular-nums text-foreground">{stat.value}</p>
              </div>
              <div className={`h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-lg sm:text-xl`}>
                {stat.icon}
              </div>
            </div>
          </Card>
        ))}
        </div>

      {outOfStockProducts > 0 && (
        <Card className="p-4 border-red-200 bg-red-50 dark:bg-red-950/20">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">🚫</span>
            <div>
              <h3 className="font-semibold text-red-900 dark:text-red-100">আউট অফ স্টক সতর্কতা</h3>
              <p className="text-sm text-red-700 dark:text-red-300">
                {outOfStockProducts}টি প্রোডাক্ট আউট অফ স্টক (বিক্রয় হয়েছে বা অনুপলব্ধ)।
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-200/60">
        <h2 className="text-xl font-semibold mb-6 text-foreground flex items-center">
          <span className="text-2xl mr-2">💰</span>
          মোট বিনিয়োগ বিশ্লেষণ
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 bg-green-50 dark:bg-green-950/20 border-green-200">
            <div className="flex items-center space-x-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <p className="text-sm font-medium text-muted-foreground">নতুন প্রোডাক্ট বিনিয়োগ</p>
            </div>
            <p className="min-w-0 break-words [overflow-wrap:anywhere] text-xl sm:text-2xl md:text-3xl font-bold leading-tight tabular-nums text-green-600">৳{newProductsInvestment.toLocaleString('bn-BD')}</p>
            <p className="text-xs text-muted-foreground mt-2">{newProducts}টি প্রোডাক্ট • {newProductsStock}টি ইউনিট</p>
          </Card>
          
          <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
            <div className="flex items-center space-x-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <p className="text-sm font-medium text-muted-foreground">ব্যবহৃত প্রোডাক্ট বিনিয়োগ</p>
            </div>
            <p className="min-w-0 break-words [overflow-wrap:anywhere] text-xl sm:text-2xl md:text-3xl font-bold leading-tight tabular-nums text-blue-600">৳{usedProductsInvestment.toLocaleString('bn-BD')}</p>
            <p className="text-xs text-muted-foreground mt-2">{usedProducts}টি প্রোডাক্ট • {usedProductsStock}টি ইউনিট</p>
          </Card>
          
          <Card className="p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200/60">
            <div className="flex items-center space-x-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <p className="text-sm font-medium text-muted-foreground">সর্বমোট বিনিয়োগ</p>
            </div>
            <p className="min-w-0 break-words [overflow-wrap:anywhere] text-xl sm:text-2xl md:text-3xl font-bold leading-tight tabular-nums text-amber-600">৳{totalInvestment.toLocaleString('bn-BD')}</p>
            <p className="text-xs text-muted-foreground mt-2">{newProducts + usedProducts}টি প্রোডাক্ট • {newProductsStock + usedProductsStock}টি ইউনিট</p>
          </Card>
        </div>
        
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">নতুন প্রোডাক্ট শেয়ার</p>
            <div className="flex items-center space-x-2">
              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full" 
                  style={{ width: `${totalInvestment > 0 ? (newProductsInvestment / totalInvestment * 100) : 0}%` }}
                ></div>
              </div>
              <p className="text-sm font-semibold text-green-600">
                {totalInvestment > 0 ? ((newProductsInvestment / totalInvestment * 100).toFixed(1)) : 0}%
              </p>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">ব্যবহৃত প্রোডাক্ট শেয়ার</p>
            <div className="flex items-center space-x-2">
              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full" 
                  style={{ width: `${totalInvestment > 0 ? (usedProductsInvestment / totalInvestment * 100) : 0}%` }}
                ></div>
              </div>
              <p className="text-sm font-semibold text-blue-600">
                {totalInvestment > 0 ? ((usedProductsInvestment / totalInvestment * 100).toFixed(1)) : 0}%
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-xl font-semibold mb-6 text-foreground">প্রোডাক্ট অবস্থা বিশ্লেষণ</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <h3 className="text-lg font-semibold text-foreground">নতুন প্রোডাক্ট</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4 bg-green-50 dark:bg-green-950/20 border-green-200">
                <p className="text-sm text-muted-foreground">প্রোডাক্ট</p>
                <p className="min-w-0 break-words [overflow-wrap:anywhere] text-2xl font-bold leading-tight tabular-nums text-green-600">{newProducts}</p>
              </Card>
              <Card className="p-4 bg-green-50 dark:bg-green-950/20 border-green-200">
                <p className="text-sm text-muted-foreground">মোট স্টক</p>
                <p className="text-2xl font-bold text-green-600">{newProductsStock}</p>
              </Card>
              <Card className="p-4 bg-green-50 dark:bg-green-950/20 border-green-200">
                <p className="text-sm text-muted-foreground">বিক্রয়</p>
                <p className="text-2xl font-bold text-green-600">{newSalesCount}</p>
              </Card>
              <Card className="p-4 bg-green-50 dark:bg-green-950/20 border-green-200">
                <p className="text-sm text-muted-foreground">রেভিনিউ</p>
                <p className="text-2xl font-bold text-green-600">৳{newSalesRevenue.toLocaleString('bn-BD')}</p>
              </Card>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <h3 className="text-lg font-semibold text-foreground">ব্যবহৃত প্রোডাক্ট</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                <p className="text-sm text-muted-foreground">প্রোডাক্ট</p>
                <p className="min-w-0 break-words [overflow-wrap:anywhere] text-2xl font-bold leading-tight tabular-nums text-blue-600">{usedProducts}</p>
              </Card>
              <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                <p className="text-sm text-muted-foreground">মোট স্টক</p>
                <p className="text-2xl font-bold text-blue-600">{usedProductsStock}</p>
              </Card>
              <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                <p className="text-sm text-muted-foreground">বিক্রয়</p>
                <p className="text-2xl font-bold text-blue-600">{usedSalesCount}</p>
              </Card>
              <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                <p className="text-sm text-muted-foreground">রেভিনিউ</p>
                <p className="text-2xl font-bold text-blue-600">৳{usedSalesRevenue.toLocaleString('bn-BD')}</p>
              </Card>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 sm:p-4 border-border/80">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h2 className="text-xl font-semibold text-foreground">সাম্প্রতিক কার্যক্রম</h2>
            <p className="text-sm text-muted-foreground mt-1">সর্বশেষ বিক্রয় ও ক্রয়ের লেনদেন, বিস্তারিত দেখতে কার্ডে ক্লিক করুন</p>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-muted p-1 self-start">
            {([["all", "সব"], ["sale", "বিক্রয়"], ["purchase", "ক্রয়"]] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setActivityFilter(value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activityFilter === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                aria-pressed={activityFilter === value}>{label}</button>
            ))}
          </div>
        </div>
        {(() => {
          const items = [
            ...(sales || []).map((record: any) => ({ kind: "sale" as const, id: record.id, date: record.created_at, amount: Number(record.total_amount || 0), record })),
            ...purchaseEntries.map((record: any) => ({ kind: "purchase" as const, id: record.id, date: record.created_at, amount: Number(record.amount || 0), record })),
          ].filter((item) => activityFilter === "all" || item.kind === activityFilter)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
          if (salesLoading || purchasesLoading) return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>;
          if (!items.length) return <div className="py-10 text-center text-sm text-muted-foreground">এই মুহূর্তে দেখানোর মতো কোনো লেনদেন নেই।</div>;
          return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {items.map(item => {
              const sale = item.kind === "sale" ? item.record : null;
              const person = item.kind === "sale" ? (sale.customers?.name || sale.instant_customer_name || "ওয়াক-ইন ক্রেতা") : (item.record.supplier_name || "অজানা সাপ্লায়ার");
              return <button key={item.kind + item.id} type="button" onClick={() => setSelectedActivity(item)}
                className="group w-full rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${item.kind === "sale" ? "bg-emerald-500/10 text-emerald-600" : "bg-blue-500/10 text-blue-600"}`}>
                      {item.kind === "sale" ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownLeft className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0"><p className="font-semibold text-foreground truncate">{item.kind === "sale" ? "বিক্রয়" : "ক্রয়"} #{item.id.slice(0,8)}</p><p className="text-xs text-muted-foreground truncate">{person}</p></div>
                  </div>
                  <Badge variant={item.kind === "sale" ? "default" : "secondary"}>{item.kind === "sale" ? "বিক্রয়" : "ক্রয়"}</Badge>
                </div>
                <div className="mt-4 flex items-end justify-between gap-2">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{new Date(item.date).toLocaleString("bn-BD",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
                  <p className="text-lg font-bold text-foreground">৳{item.amount.toLocaleString("bn-BD")}</p>
                </div>
                <div className="mt-3 pt-3 border-t border-border/70 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{item.kind === "sale" ? `${sale.sale_items?.length || 0}টি পণ্য` : `${item.record.quantity || 0} ইউনিট · ক্রয়`}</span>
                  <span className="inline-flex items-center gap-1 group-hover:text-primary">বিস্তারিত <Eye className="h-3.5 w-3.5" /></span>
                </div>
              </button>;
            })}
          </div>;
        })()}
      </Card>
      <Dialog open={!!selectedActivity} onOpenChange={(open) => !open && setSelectedActivity(null)}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          {selectedActivity && <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedActivity.kind === "sale" ? <ArrowUpRight className="h-5 w-5 text-emerald-600" /> : <ArrowDownLeft className="h-5 w-5 text-blue-600" />}
                {selectedActivity.kind === "sale" ? "বিক্রয় লেনদেনের বিস্তারিত" : "ক্রয় লেনদেনের বিস্তারিত"}
              </DialogTitle>
              <DialogDescription>রেফারেন্স: #{selectedActivity.id.slice(0,8)} · {new Date(selectedActivity.date).toLocaleString("bn-BD")}</DialogDescription>
            </DialogHeader>
            {selectedActivity.kind === "sale" ? <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">মোট বিল</p><p className="text-lg font-bold">৳{Number(selectedActivity.record.total_amount || 0).toLocaleString("bn-BD")}</p></div>
                <div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">পরিশোধ</p><p className="text-lg font-bold text-emerald-600">৳{Number(selectedActivity.record.paid_amount || 0).toLocaleString("bn-BD")}</p></div>
                <div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">বাকি</p><p className="text-lg font-bold text-destructive">৳{Number(selectedActivity.record.due_amount || 0).toLocaleString("bn-BD")}</p></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <p className="flex items-center gap-2"><UserRound className="h-4 w-4 text-muted-foreground" />{selectedActivity.record.customers?.name || selectedActivity.record.instant_customer_name || "ওয়াক-ইন ক্রেতা"}</p>
                <p className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-muted-foreground" />{selectedActivity.record.payment_method || "উল্লেখ নেই"}</p>
                {(selectedActivity.record.customers?.phone || selectedActivity.record.instant_customer_phone) && <p className="sm:col-span-2">ফোন: {selectedActivity.record.customers?.phone || selectedActivity.record.instant_customer_phone}</p>}
              </div>
              <div><h3 className="font-semibold mb-2">পণ্যসমূহ</h3><div className="rounded-xl border border-border divide-y divide-border">
                {(selectedActivity.record.sale_items || []).map((line: any, index: number) => <div key={line.id || index} className="p-3 flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0"><p className="font-medium">{line.products?.name || "পণ্য"}</p><p className="text-xs text-muted-foreground">SKU: {line.products?.sku || "—"}{line.imei ? ` · IMEI: ${line.imei}` : ""} · {line.quantity} × ৳{Number(line.unit_price || 0).toLocaleString("bn-BD")}</p></div>
                  <p className="font-semibold whitespace-nowrap">৳{Number(line.total_price || 0).toLocaleString("bn-BD")}</p>
                </div>)}
              </div></div>
              {selectedActivity.record.notes && <p className="text-sm text-muted-foreground">নোট: {selectedActivity.record.notes}</p>}
            </div> : <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">ক্রয় মূল্য</p><p className="text-lg font-bold">৳{Number(selectedActivity.record.amount || 0).toLocaleString("bn-BD")}</p></div>
                <div className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">পরিমাণ</p><p className="text-lg font-bold">{selectedActivity.record.quantity || 0} ইউনিট</p></div>
              </div>
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2"><Truck className="h-4 w-4 text-muted-foreground" />সাপ্লায়ার: {selectedActivity.record.supplier_name || "উল্লেখ নেই"}</p>
                <p className="flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" />পণ্য: {selectedActivity.record.product_name || "উল্লেখ নেই"}</p>
                <p>প্রতি ইউনিট ক্রয় মূল্য: ৳{Number(selectedActivity.record.unit_cost || 0).toLocaleString("bn-BD")}</p>
                <p>পেমেন্ট মাধ্যম: {selectedActivity.record.payment_method || "উল্লেখ নেই"}</p>
                {selectedActivity.record.product_imei && <p>IMEI: {selectedActivity.record.product_imei}</p>}
                {selectedActivity.record.purchase_id && <p>ক্রয় রেফারেন্স: #{selectedActivity.record.purchase_id.slice(0,8)}</p>}
                {selectedActivity.record.notes && <p>নোট: {selectedActivity.record.notes}</p>}
              </div>
            </div>}
          </>}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
