import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { CartItem } from "./types";

interface CartSectionProps {
  cart: CartItem[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onUpdatePrice: (productId: string, price: number) => void;
  onSelectImei: (productId: string, imei: string) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart?: () => void;
  total: number;
}

export function CartSection({
  cart,
  isCollapsed,
  onToggleCollapse,
  onUpdatePrice,
  onSelectImei,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  total,
}: CartSectionProps) {
  return (
    <Card className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg lg:text-xl font-semibold text-foreground">
          কার্ট {cart.length > 0 && <span className="text-sm text-muted-foreground">({cart.length})</span>}
        </h2>
        <div className="flex items-center gap-1">
          {cart.length > 0 && onClearCart && (
            <Button variant="ghost" size="sm" onClick={onClearCart} className="text-destructive">
              খালি করুন
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            className="lg:hidden"
          >
            {isCollapsed ? "বিস্তারিত" : "সংক্ষিপ্ত"}
          </Button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          <div className="space-y-3 lg:space-y-4 mb-4">
            {cart.map((item) => (
              <div key={item.product.id} className="space-y-2 py-3 border-b border-border">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{item.product.name}</p>
                    {item.availableImeis && item.availableImeis.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <span className="text-xs text-muted-foreground">ডিভাইস IMEI নির্বাচন করুন</span>
                        <Select value={item.imei || ""} onValueChange={(value) => onSelectImei(item.product.id, value)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="IMEI নির্বাচন করুন"/></SelectTrigger>
                          <SelectContent>{item.availableImeis.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">মূল্য:</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.customPrice}
                        onChange={(e) => onUpdatePrice(item.product.id, parseFloat(e.target.value) || 0)}
                        className="w-20 lg:w-24 h-7 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 lg:gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label="পরিমাণ কমান"
                      onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                      className="h-7 w-7 p-0 text-xs"
                    >
                      −
                    </Button>
                    <span className="w-6 lg:w-8 text-center font-semibold text-sm">{item.quantity}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label="পরিমাণ বাড়ান"
                      disabled={item.quantity >= (item.product.stock_quantity ?? 1)}
                      onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                      className="h-7 w-7 p-0 text-xs"
                    >
                      +
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      aria-label="বাদ দিন"
                      onClick={() => onRemoveItem(item.product.id)}
                      className="h-7 w-7 p-0 text-xs"
                    >
                      ✕
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-xs text-muted-foreground">
                    সাবটোটাল: ৳{(item.customPrice * item.quantity).toLocaleString('bn-BD')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    স্টক: {Number(item.product.stock_quantity ?? 0).toLocaleString('bn-BD')}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {cart.length === 0 && (
            <div className="text-center py-6 lg:py-8 text-muted-foreground">
              <div className="text-3xl lg:text-4xl mb-2">🛒</div>
              <p className="text-sm">কার্ট খালি</p>
            </div>
          )}
        </>
      )}

      {isCollapsed && cart.length > 0 && (
        <div className="bg-primary/10 p-3 rounded-lg mb-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-foreground font-medium">{cart.length}টি পণ্য</span>
            <span className="text-primary font-bold">৳{total.toLocaleString('bn-BD')}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
