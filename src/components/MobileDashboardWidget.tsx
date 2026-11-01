import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Package, DollarSign, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileDashboardWidgetProps {
  onNavigateToPOS?: () => void;
  onNavigateToProducts?: () => void;
}

export function MobileDashboardWidget({ onNavigateToPOS, onNavigateToProducts }: MobileDashboardWidgetProps) {
  const { data: sales } = useQuery({
    queryKey: ["today-sales"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Paginated fetch so daily totals stay accurate past the 1000-row API cap
      return fetchAll<any>(
        "sales",
        "*, sale_items(quantity, total_price)",
        (q) => q.gte("created_at", today.toISOString()).order("created_at", { ascending: false })
      );
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products-count"],
    queryFn: async () => {
      // Paginated fetch so product/stock counts stay accurate past the 1000-row cap
      return fetchAll<any>("products", "id, stock_quantity, low_stock_threshold");
    },
  });

  const todaySalesCount = sales?.length || 0;
  const todayRevenue = sales?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
  const todayItemsSold = sales?.reduce((sum, sale) => {
    return sum + (sale.sale_items?.reduce((itemSum: number, item: any) => itemSum + item.quantity, 0) || 0);
  }, 0) || 0;
  const outOfStockCount = products?.filter(p => p.stock_quantity <= 0).length || 0;

  return (
    <Card className="lg:hidden mb-6 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Today's Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Sales</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{todaySalesCount}</div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-accent" />
              <span className="text-xs text-muted-foreground">Revenue</span>
            </div>
            <div className="text-2xl font-bold text-accent">৳{todayRevenue.toLocaleString()}</div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-secondary" />
              <span className="text-xs text-muted-foreground">Items Sold</span>
            </div>
            <div className="text-2xl font-bold text-secondary">{todayItemsSold}</div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground">Out of Stock</span>
            </div>
            <div className="text-2xl font-bold text-destructive">{outOfStockCount}</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button 
            onClick={onNavigateToPOS}
            className="w-full"
            size="sm"
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            New Sale
          </Button>
          <Button 
            onClick={onNavigateToProducts}
            variant="outline"
            className="w-full"
            size="sm"
          >
            <Package className="h-4 w-4 mr-2" />
            Products
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
