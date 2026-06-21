import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, Package, TrendingUp, TrendingDown, Wallet } from "lucide-react";

interface StockImpactPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  currentStock: number;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  direction: "restore" | "deduct"; // sales return = restore, supplier return = deduct
  refundAmount: number;
  customerName?: string | null;
  onConfirm: () => void;
  loading?: boolean;
  actionLabel?: string;
}

export function StockImpactPreview({
  open,
  onOpenChange,
  productName,
  currentStock,
  quantity,
  unitCost,
  unitPrice,
  direction,
  refundAmount,
  customerName,
  onConfirm,
  loading,
  actionLabel,
}: StockImpactPreviewProps) {
  const newStock = direction === "restore" ? currentStock + quantity : Math.max(0, currentStock - quantity);
  const profitImpact = (unitPrice - unitCost) * quantity;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            স্টক ও হিসাব প্রভাব প্রিভিউ
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Package className="h-4 w-4 text-primary" />
              <span className="font-semibold">{productName}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">বর্তমান স্টক</p>
                <p className="font-bold text-lg">{currentStock}</p>
              </div>
              <div className="text-center">
                {direction === "restore" ? (
                  <TrendingUp className="h-6 w-6 text-green-600 mx-auto mt-2" />
                ) : (
                  <TrendingDown className="h-6 w-6 text-red-600 mx-auto mt-2" />
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {direction === "restore" ? `+${quantity}` : `−${quantity}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground text-xs">নতুন স্টক</p>
                <p className={`font-bold text-lg ${direction === "restore" ? "text-green-600" : "text-red-600"}`}>
                  {newStock}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">আর্থিক প্রভাব</span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {direction === "restore" ? "রিফান্ড পরিমাণ" : "সাপ্লায়ার রিকভারি"}
                </span>
                <span className="font-semibold">৳{refundAmount.toLocaleString("bn-BD")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">নেট লাভ-ক্ষতিতে প্রভাব</span>
                <span className={`font-semibold ${direction === "restore" ? "text-red-600" : "text-green-600"}`}>
                  {direction === "restore" ? "−" : "+"}৳{Math.abs(profitImpact).toLocaleString("bn-BD")}
                </span>
              </div>
              {customerName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ক্রেতা</span>
                  <span className="font-medium">{customerName}</span>
                </div>
              )}
            </div>
          </Card>

          <p className="text-xs text-muted-foreground">
            ⚠ এই কাজ Reports ও Dashboard এর দৈনিক/সাপ্তাহিক/মাসিক হিসাবে real-time প্রভাব ফেলবে।
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            বাতিল
          </Button>
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? "প্রসেস হচ্ছে..." : (actionLabel || "নিশ্চিত করুন")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
