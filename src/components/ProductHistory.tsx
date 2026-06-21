import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";

interface ProductHistoryProps {
  imei: string;
  productName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ProductHistory({ imei, productName, isOpen, onClose }: ProductHistoryProps) {
  const { data: history } = useQuery({
    queryKey: ["product-history", imei],
    queryFn: async () => {
      const { data: saleItems, error } = await supabase
        .from("sale_items")
        .select(`
          *,
          sales(
            id,
            created_at,
            total_amount,
            payment_method,
            customer_id,
            customers(name)
          ),
          products(imei, name, brand, model, condition)
        `)
        .eq("products.imei", imei)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return saleItems;
    },
    enabled: isOpen,
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transaction History</DialogTitle>
          <DialogDescription>
            All sales transactions for IMEI: {imei}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg">
            <h3 className="font-semibold text-foreground">{productName}</h3>
            <p className="text-sm text-muted-foreground">IMEI: {imei}</p>
          </div>

          <Separator />

          {!history || history.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No transaction history found for this IMEI</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {history.map((item: any) => (
                <Card key={item.id} className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-foreground">
                          Sale #{item.sales.id.slice(0, 8)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(item.sales.created_at), "PPP p")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground">
                          ${Number(item.total_price).toFixed(2)}
                        </p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {item.sales.payment_method}
                        </p>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Customer</p>
                        <p className="text-foreground font-medium">
                          {item.sales.customers?.name || "Walk-in Customer"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Quantity</p>
                        <p className="text-foreground font-medium">{item.quantity}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Unit Price</p>
                        <p className="text-foreground font-medium">
                          ${Number(item.unit_price).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Condition</p>
                        <p className="text-foreground font-medium capitalize">
                          {item.condition || "N/A"}
                        </p>
                      </div>
                    </div>

                    {item.products && (
                      <div className="bg-muted/30 p-2 rounded text-sm">
                        <p className="text-muted-foreground">Product Details</p>
                        <p className="text-foreground">
                          {item.products.brand} {item.products.model} - {item.products.condition}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
