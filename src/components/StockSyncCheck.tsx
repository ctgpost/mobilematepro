import { fetchAll } from "@/lib/fetchAll";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Package,
  ArrowRight,
  Loader2
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface StockDiscrepancy {
  productId: string;
  productName: string;
  imei: string | null;
  currentStock: number;
  expectedStock: number;
  difference: number;
  totalSold: number;
  totalReturned: number;
}

export function StockSyncCheck() {
  const [isOpen, setIsOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [discrepancies, setDiscrepancies] = useState<StockDiscrepancy[]>([]);
  const [hasChecked, setHasChecked] = useState(false);

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      return (await fetchAll<any>("products", "*, categories(name)", (q) => q.order("name"))) as any[];
    },
  });

  // Reconcile against the stock ledger, never an assumed opening quantity.
  const { data: movements } = useQuery({
    queryKey: ["stock_movements_for_reconciliation"],
    queryFn: async () => fetchAll<any>("stock_movements", "product_id, movement_type, old_quantity, new_quantity, change, created_at", (q) => q.order("created_at", { ascending: true })),
  });

  const runStockCheck = () => {
    if (!products || !movements) {
      toast.error("প্রোডাক্ট বা স্টক লেজার ডাটা লোড হয়নি");
      return;
    }
    setIsChecking(true);
    const grouped = new Map<string, any[]>();
    for (const movement of movements) {
      const list = grouped.get(movement.product_id) || [];
      list.push(movement);
      grouped.set(movement.product_id, list);
    }
    const issues: StockDiscrepancy[] = [];
    for (const product of products) {
      const ledger = grouped.get(product.id);
      if (!ledger?.length) continue; // No trustworthy opening balance exists for legacy products.
      const latestMovement = ledger[ledger.length - 1];
      const expectedStock = Number(latestMovement.new_quantity);
      const currentStock = Number(product.stock_quantity);
      if (currentStock !== expectedStock) {
        issues.push({
          productId: product.id, productName: product.name, imei: product.imei,
          currentStock, expectedStock, difference: currentStock - expectedStock,
          totalSold: ledger.filter(m => m.movement_type === "sale").reduce((sum,m) => sum + Math.abs(Number(m.change)),0),
          totalReturned: ledger.filter(m => m.movement_type === "return").reduce((sum,m) => sum + Number(m.change),0),
        });
      }
    }
    setDiscrepancies(issues);
    setHasChecked(true);
    setIsChecking(false);
    if (!issues.length) toast.success("স্টক লেজারের সাথে বর্তমান স্টক মিলে গেছে");
    else toast.warning(`${issues.length}টি পণ্যে লেজার ও বর্তমান স্টকের অমিল পাওয়া গেছে`);
  };

  const fixDiscrepancy = async (discrepancy: StockDiscrepancy) => {
    try {
      const { error } = await supabase.from("products").update({
        stock_quantity: discrepancy.expectedStock,
        last_stock_reason: "reconciliation",
        last_stock_ref: `manual-reconciliation-${Date.now()}`,
      } as any).eq("id", discrepancy.productId);
      if (error) throw error;
      toast.success(`${discrepancy.productName} এর স্টক লেজার অনুযায়ী সংশোধন হয়েছে`);
      setDiscrepancies(prev => prev.filter(d => d.productId !== discrepancy.productId));
    } catch (error: any) {
      toast.error(error.message || "স্টক সংশোধন করতে ব্যর্থ");
    }
  };

  const fixAllDiscrepancies = async () => {
    for (const discrepancy of discrepancies) await fixDiscrepancy(discrepancy);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          স্টক সিঙ্ক চেক
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <RefreshCw className="h-5 w-5 text-primary" />
            স্টক সিঙ্ক্রোনাইজেশন চেক
          </DialogTitle>
          <DialogDescription>
            বিক্রয় রেকর্ড এবং বর্তমান স্টকের মধ্যে অসঙ্গতি যাচাই করুন
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Action Button */}
          <div className="flex items-center justify-between">
            <Button 
              onClick={runStockCheck} 
              disabled={isChecking}
              className="gap-2"
            >
              {isChecking ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  চেক হচ্ছে...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  স্টক চেক করুন
                </>
              )}
            </Button>

            {discrepancies.length > 0 && (
              <Button 
                variant="destructive" 
                onClick={fixAllDiscrepancies}
                className="gap-2"
              >
                <AlertTriangle className="h-4 w-4" />
                সব সংশোধন করুন ({discrepancies.length})
              </Button>
            )}
          </div>

          {/* Status Card */}
          {hasChecked && (
            <Card className={`p-4 ${discrepancies.length === 0 ? 'bg-green-50 dark:bg-green-950/20 border-green-200' : 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200'}`}>
              <div className="flex items-center gap-3">
                {discrepancies.length === 0 ? (
                  <>
                    <CheckCircle className="h-8 w-8 text-green-600" />
                    <div>
                      <h3 className="font-semibold text-green-800 dark:text-green-300">স্টক সিঙ্ক ঠিক আছে</h3>
                      <p className="text-sm text-green-700 dark:text-green-400">
                        মোট {products?.length || 0}টি প্রোডাক্ট চেক করা হয়েছে। কোনো অসঙ্গতি নেই।
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-8 w-8 text-yellow-600" />
                    <div>
                      <h3 className="font-semibold text-yellow-800 dark:text-yellow-300">অসঙ্গতি পাওয়া গেছে</h3>
                      <p className="text-sm text-yellow-700 dark:text-yellow-400">
                        {discrepancies.length}টি প্রোডাক্টে স্টক অসঙ্গতি রয়েছে। নিচে বিস্তারিত দেখুন।
                      </p>
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}

          {/* Discrepancies List */}
          {discrepancies.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">অসঙ্গতি তালিকা</h3>
              {discrepancies.map((discrepancy) => (
                <Card key={discrepancy.productId} className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                        <XCircle className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold">{discrepancy.productName}</h4>
                        {discrepancy.imei && (
                          <p className="text-xs text-muted-foreground font-mono">IMEI: {discrepancy.imei}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
                          <Badge variant="outline" className="gap-1">
                            বিক্রয়: {discrepancy.totalSold}
                          </Badge>
                          <Badge variant="outline" className="gap-1">
                            রিটার্ন: {discrepancy.totalReturned}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-sm">
                        <div className="text-center">
                          <p className="text-muted-foreground text-xs">বর্তমান</p>
                          <p className="font-bold text-red-600 text-lg">{discrepancy.currentStock}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div className="text-center">
                          <p className="text-muted-foreground text-xs">প্রত্যাশিত</p>
                          <p className="font-bold text-green-600 text-lg">{discrepancy.expectedStock}</p>
                        </div>
                      </div>

                      <Button 
                        size="sm"
                        onClick={() => fixDiscrepancy(discrepancy)}
                        className="gap-1"
                      >
                        <CheckCircle className="h-4 w-4" />
                        সংশোধন
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Info Card */}
          <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
            <div className="flex items-start gap-3">
              <Package className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-800 dark:text-blue-300 mb-1">কিভাবে কাজ করে?</p>
                <ul className="text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
                  <li>প্রতিটি মোবাইলের প্রাথমিক স্টক ১ ধরা হয়</li>
                  <li>বিক্রয় থেকে স্টক বাদ যায়</li>
                  <li>সম্পন্ন রিটার্ন থেকে স্টক যোগ হয়</li>
                  <li>প্রত্যাশিত = ১ - বিক্রয় + রিটার্ন</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
