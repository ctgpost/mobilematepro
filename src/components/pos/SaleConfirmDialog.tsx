import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CartItem } from "./types";

interface SaleConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartItem[];
  total: number;
  onConfirm: () => void;
}

export function SaleConfirmDialog({
  open,
  onOpenChange,
  cart,
  total,
  onConfirm,
}: SaleConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg">বিক্রয় নিশ্চিত করুন</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                নিম্নলিখিত পণ্যগুলি বিক্রয় ও স্টক আপডেট হবে:
              </p>
              <div className="bg-muted/50 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                {cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex justify-between items-center text-sm border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <div>
                      <span className="font-medium text-foreground">{item.product.name}</span>
                      <span className="text-muted-foreground ml-2">x{item.quantity}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-primary font-semibold">
                        ৳{(item.customPrice * item.quantity).toFixed(0)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        স্টক: {item.product.stock_quantity} →{" "}
                        {Math.max(0, item.product.stock_quantity - item.quantity)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="font-semibold text-foreground">মোট:</span>
                <span className="text-xl font-bold text-primary">৳{total.toFixed(0)}</span>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>বাতিল</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-primary">
            ✓ নিশ্চিত করুন
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
