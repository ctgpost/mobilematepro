import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useShopSettings } from "@/hooks/useShopSettings";
import { MobileDashboardWidget } from "./MobileDashboardWidget";
import { fetchAll } from "@/lib/fetchAll";
import { PageHeader } from "./PageHeader";

interface DashboardProps {
  onNavigateToPOS?: () => void;
  onNavigateToProducts?: () => void;
}

export function Dashboard({ onNavigateToPOS, onNavigateToProducts }: DashboardProps = {}) {
  const { settings, logoSrc } = useShopSettings();

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["products", "dashboard-all"],
    queryFn: async () => fetchAll<any>("products", "*"),
  });

  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ["sales", "dashboard-all"],
    queryFn: async () =>
      fetchAll<any>("sales", "*, sale_items(*, products(condition))"),
  });

  const { data: completedReturns } = useQuery({
    queryKey: ["returns", "dashboard-all"],
    queryFn: async () => {
      const { data } = await supabase.from("returns").select("refund_amount, created_at, status").eq("status", "completed");
      return data || [];
    },
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
      <div className="flex-1 overflow-y-auto pb-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-32" />
                </div>
                <Skeleton className="w-12 h-12 rounded-xl" />
              </div>
            </Card>
          ))}
        </div>
        <Card className="p-6">
          <Skeleton className="h-6 w-48 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6">
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
        icon={<img src={logoSrc} alt={settings.shop_name} className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 shrink-0 object-contain" />}
      />

      <div className="flex-1 overflow-y-auto pb-6 space-y-4 sm:space-y-6 pt-3">
        <MobileDashboardWidget 
          onNavigateToPOS={onNavigateToPOS}
          onNavigateToProducts={onNavigateToProducts}
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {stats.map((stat, index) => (
          <Card key={index} className="p-4 sm:p-6 card-hover border-border bg-card">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                <p className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">{stat.value}</p>
              </div>
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-2xl`}>
                {stat.icon}
              </div>
            </div>
          </Card>
        ))}
        </div>

      {outOfStockProducts > 0 && (
        <Card className="p-6 border-red-200 bg-red-50 dark:bg-red-950/20">
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

      <Card className="p-6 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-200/60">
        <h2 className="text-xl font-semibold mb-6 text-foreground flex items-center">
          <span className="text-2xl mr-2">💰</span>
          মোট বিনিয়োগ বিশ্লেষণ
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 bg-green-50 dark:bg-green-950/20 border-green-200">
            <div className="flex items-center space-x-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <p className="text-sm font-medium text-muted-foreground">নতুন প্রোডাক্ট বিনিয়োগ</p>
            </div>
            <p className="text-xl sm:text-2xl md:text-3xl font-bold text-green-600">৳{newProductsInvestment.toLocaleString('bn-BD')}</p>
            <p className="text-xs text-muted-foreground mt-2">{newProducts}টি প্রোডাক্ট • {newProductsStock}টি ইউনিট</p>
          </Card>
          
          <Card className="p-6 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
            <div className="flex items-center space-x-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <p className="text-sm font-medium text-muted-foreground">ব্যবহৃত প্রোডাক্ট বিনিয়োগ</p>
            </div>
            <p className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-600">৳{usedProductsInvestment.toLocaleString('bn-BD')}</p>
            <p className="text-xs text-muted-foreground mt-2">{usedProducts}টি প্রোডাক্ট • {usedProductsStock}টি ইউনিট</p>
          </Card>
          
          <Card className="p-6 bg-amber-50 dark:bg-amber-950/20 border-amber-200/60">
            <div className="flex items-center space-x-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <p className="text-sm font-medium text-muted-foreground">সর্বমোট বিনিয়োগ</p>
            </div>
            <p className="text-xl sm:text-2xl md:text-3xl font-bold text-amber-600">৳{totalInvestment.toLocaleString('bn-BD')}</p>
            <p className="text-xs text-muted-foreground mt-2">{newProducts + usedProducts}টি প্রোডাক্ট • {newProductsStock + usedProductsStock}টি ইউনিট</p>
          </Card>
        </div>
        
        <div className="mt-6 grid grid-cols-2 gap-4">
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

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-6 text-foreground">প্রোডাক্ট অবস্থা বিশ্লেষণ</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <h3 className="text-lg font-semibold text-foreground">নতুন প্রোডাক্ট</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Card className="p-4 bg-green-50 dark:bg-green-950/20 border-green-200">
                <p className="text-sm text-muted-foreground">প্রোডাক্ট</p>
                <p className="text-2xl font-bold text-green-600">{newProducts}</p>
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
                <p className="text-2xl font-bold text-blue-600">{usedProducts}</p>
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

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4 text-foreground">সাম্প্রতিক কার্যক্রম</h2>
        <div className="space-y-4">
          {sales?.slice(0, 5).map((sale) => (
            <div key={sale.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <div>
                <p className="font-medium text-foreground">বিক্রয় #{sale.id.slice(0, 8)}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(sale.created_at).toLocaleDateString('bn-BD')}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-foreground">৳{Number(sale.total_amount).toLocaleString('bn-BD')}</p>
                <p className="text-sm text-muted-foreground">
                  {sale.payment_method === 'cash' ? 'নগদ' : sale.payment_method === 'card' ? 'কার্ড' : 'মোবাইল'}
                </p>
              </div>
            </div>
          ))}
          {(!sales || sales.length === 0) && (
            <p className="text-center text-muted-foreground py-8">এখনো কোনো বিক্রয় নেই। বিক্রয় শুরু করুন!</p>
          )}
        </div>
      </Card>
      </div>
    </div>
  );
}
