import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";
import { PhotoZoom } from "./PhotoZoom";

interface ProductDetailModalProps {
  product: any;
  isOpen: boolean;
  onClose: () => void;
}

export function ProductDetailModal({ product, isOpen, onClose }: ProductDetailModalProps) {
  // Fetch sales history for this product
  const { data: salesHistory } = useQuery({
    queryKey: ["product-sales-history", product?.id],
    queryFn: async () => {
      if (!product?.id) return [];
      
      const { data, error } = await supabase
        .from("sale_items")
        .select(`
          id,
          quantity,
          unit_price,
          total_price,
          condition,
          created_at,
          sales (
            id,
            total_amount,
            payment_method,
            created_at,
            customers (
              name,
              phone
            )
          )
        `)
        .eq("product_id", product.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: isOpen && !!product?.id,
  });

  // Fetch linked supplier (with photo) if available
  const { data: supplier } = useQuery({
    queryKey: ["product-supplier", product?.supplier_id],
    queryFn: async () => {
      if (!product?.supplier_id) return null;
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, phone, email, address, photo_url")
        .eq("id", product.supplier_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!product?.supplier_id,
  });

  if (!product) return null;

  const getWarrantyStatus = () => {
    if (!product.warranty_expiry_date || product.warranty_status === 'no_warranty') {
      return { text: 'No Warranty', color: 'bg-muted text-muted-foreground' };
    }
    
    const expiryDate = new Date(product.warranty_expiry_date);
    const today = new Date();
    
    if (product.warranty_status === 'void') {
      return { text: 'Void', color: 'bg-destructive text-destructive-foreground' };
    }
    
    if (expiryDate < today) {
      return { text: 'Expired', color: 'bg-destructive text-destructive-foreground' };
    }
    
    return { text: 'Active', color: 'bg-primary text-primary-foreground' };
  };

  const warrantyStatus = getWarrantyStatus();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{product.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-3">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Brand</p>
                <p className="font-medium">{product.brand || "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Model</p>
                <p className="font-medium">{product.model || "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">IMEI</p>
                <p className="font-medium">{product.imei || "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">SKU</p>
                <p className="font-medium">{product.sku || "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Barcode</p>
                <p className="font-medium">{product.barcode || "N/A"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Condition</p>
                <Badge variant={product.condition === "new" ? "default" : "secondary"}>
                  {product.condition}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Category</p>
                <p className="font-medium">{product.categories?.name || "Uncategorized"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Stock</p>
                <p className="font-medium">{product.stock_quantity} {product.unit}</p>
              </div>
            </div>
          </Card>

          {/* Pricing */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-3">Pricing</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Sale Price</p>
                <p className="font-medium text-lg">৳{product.price?.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cost</p>
                <p className="font-medium text-lg">৳{product.cost?.toLocaleString()}</p>
              </div>
            </div>
          </Card>

          {/* Specifications */}
          {(product.ram || product.storage || product.battery) && (
            <Card className="p-4">
              <h3 className="text-lg font-semibold mb-3">Specifications</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                {product.ram && (
                  <div>
                    <p className="text-muted-foreground">RAM</p>
                    <p className="font-medium">{product.ram}</p>
                  </div>
                )}
                {product.storage && (
                  <div>
                    <p className="text-muted-foreground">Storage</p>
                    <p className="font-medium">{product.storage}</p>
                  </div>
                )}
                {product.battery && (
                  <div>
                    <p className="text-muted-foreground">Battery</p>
                    <p className="font-medium">{product.battery}</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Warranty Information */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-3">Warranty Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Status</p>
                <Badge className={warrantyStatus.color}>{warrantyStatus.text}</Badge>
              </div>
              {product.warranty_expiry_date && (
                <div>
                  <p className="text-muted-foreground">Expiry Date</p>
                  <p className="font-medium">
                    {format(new Date(product.warranty_expiry_date), "PPP")}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Supplier Information */}
          {(supplier || product.supplier_name || product.supplier_mobile || product.supplier_nid) && (
            <Card className="p-4">
              <h3 className="text-lg font-semibold mb-3">Supplier Information</h3>
              <div className="flex items-start gap-4">
                <PhotoZoom
                  url={supplier?.photo_url}
                  alt={supplier?.name || product.supplier_name || "সাপ্লায়ার"}
                  size="md"
                  fallbackInitials={(supplier?.name || product.supplier_name || "?").charAt(0)}
                />
                <div className="grid grid-cols-2 gap-4 text-sm flex-1">
                  {(supplier?.name || product.supplier_name) && (
                    <div>
                      <p className="text-muted-foreground">Name</p>
                      <p className="font-medium">{supplier?.name || product.supplier_name}</p>
                    </div>
                  )}
                  {(supplier?.phone || product.supplier_mobile) && (
                    <div>
                      <p className="text-muted-foreground">Mobile</p>
                      <p className="font-medium">{supplier?.phone || product.supplier_mobile}</p>
                    </div>
                  )}
                  {supplier?.email && (
                    <div>
                      <p className="text-muted-foreground">Email</p>
                      <p className="font-medium">{supplier.email}</p>
                    </div>
                  )}
                  {supplier?.address && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Address</p>
                      <p className="font-medium">{supplier.address}</p>
                    </div>
                  )}
                  {product.supplier_nid && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">NID</p>
                      <p className="font-medium">{product.supplier_nid}</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Sales History */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-3">Sales History</h3>
            {salesHistory && salesHistory.length > 0 ? (
              <div className="space-y-3">
                {salesHistory.map((item: any) => (
                  <div key={item.id} className="border border-border rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium text-sm">
                          Sale #{item.sales?.id?.slice(0, 8)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(item.created_at), "PPP p")}
                        </p>
                      </div>
                      <Badge variant="outline">{item.condition}</Badge>
                    </div>
                    <Separator className="my-2" />
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Customer</p>
                        <p className="font-medium">
                          {item.sales?.customers?.name || "Walk-in"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Payment</p>
                        <p className="font-medium">{item.sales?.payment_method}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Quantity</p>
                        <p className="font-medium">{item.quantity}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Unit Price</p>
                        <p className="font-medium">৳{item.unit_price?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total</p>
                        <p className="font-medium text-primary">
                          ৳{item.total_price?.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No sales history found for this product
              </p>
            )}
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}