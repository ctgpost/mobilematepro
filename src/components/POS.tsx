import { fetchAll } from "@/lib/fetchAll";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { InvoiceModal } from "./InvoiceModal";
import { BarcodeScanner } from "./BarcodeScanner";
import { ActivityLogger } from "@/hooks/useActivityLog";
import { enqueueCompoundSale, isOnline } from "@/lib/offlineMutate";
import { POSOfflineChecklist } from "./POSOfflineChecklist";

// Sub-components
import { CartItem, Product, Customer } from "./pos/types";
import { POSHeader } from "./pos/POSHeader";
import { CartSection } from "./pos/CartSection";
import { ProductGrid } from "./pos/ProductGrid";
import { PaymentSection } from "./pos/PaymentSection";
import { SaleConfirmDialog } from "./pos/SaleConfirmDialog";

export function POS() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [searchTerm, setSearchTerm] = useState("");
  const [imeiSearch, setImeiSearch] = useState("");
  const [showInvoice, setShowInvoice] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [isCartCollapsed, setIsCartCollapsed] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [instantCustomerName, setInstantCustomerName] = useState("");
  const [instantCustomerPhone, setInstantCustomerPhone] = useState("");
  const [paidAmount, setPaidAmount] = useState(0);
  const [customerPhotoUrl, setCustomerPhotoUrl] = useState("");

  const queryClient = useQueryClient();

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      return (await fetchAll<any>("products", "*, categories(name)", (q) => q.order("name"))) as any[];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      // Unlimited fetch — no 1000-row cap
      const rows = await fetchAll<any>("customers", "*", (q) => q.order("name"));
      return rows as Customer[];
    },
  });

  const completeSaleMutation = useMutation({
    mutationFn: async (saleData: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Offline path: queue compound sale + optimistically update caches
      if (!isOnline()) {
        const { tempSaleId, queuedAt } = await enqueueCompoundSale({
          user_id: user.id,
          customer_id: saleData.customer_id,
          total_amount: saleData.total_amount,
          payment_method: saleData.payment_method,
          instant_customer_name: saleData.instant_customer_name,
          instant_customer_phone: saleData.instant_customer_phone,
          paid_amount: saleData.paid_amount,
          due_amount: saleData.due_amount,
          customer_photo_url: saleData.customer_photo_url,
          items: saleData.items,
        });

        // Optimistically decrement product stock in cache
        queryClient.setQueryData<any[]>(["products"], (old) => {
          if (!old) return old;
          return old.map((p) => {
            const it = saleData.items.find((x: any) => x.product_id === p.id);
            if (!it) return p;
            return { ...p, stock_quantity: Math.max(0, (p.stock_quantity || 0) - it.quantity) };
          });
        });

        // Synthesize a sale record for invoice + sales list cache
        const productMap = new Map((products || []).map((p) => [p.id, p]));
        const customer = customers?.find((c) => c.id === saleData.customer_id) || null;
        const synthSale: any = {
          id: tempSaleId,
          user_id: user.id,
          customer_id: saleData.customer_id,
          total_amount: saleData.total_amount,
          payment_method: saleData.payment_method,
          status: "completed",
          instant_customer_name: saleData.instant_customer_name,
          instant_customer_phone: saleData.instant_customer_phone,
          paid_amount: saleData.paid_amount,
          due_amount: saleData.due_amount,
          customer_photo_url: saleData.customer_photo_url,
          created_at: new Date(queuedAt).toISOString(),
          updated_at: new Date(queuedAt).toISOString(),
          _offline_pending: true,
          customers: customer,
          sale_items: saleData.items.map((it: any, idx: number) => ({
            id: `${tempSaleId}_item_${idx}`,
            sale_id: tempSaleId,
            product_id: it.product_id,
            quantity: it.quantity,
            unit_price: it.unit_price,
            total_price: it.total_price,
            products: productMap.get(it.product_id) || { id: it.product_id, name: "(offline)" },
          })),
        };

        queryClient.setQueryData<any[]>(["sales"], (old) => {
          if (!old) return [synthSale];
          return [synthSale, ...old];
        });

        return synthSale;
      }

      // Online path
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert([{
          user_id: user.id,
          customer_id: saleData.customer_id,
          total_amount: saleData.total_amount,
          payment_method: saleData.payment_method,
          status: "completed",
          instant_customer_name: saleData.instant_customer_name,
          instant_customer_phone: saleData.instant_customer_phone,
          paid_amount: saleData.paid_amount,
          due_amount: saleData.due_amount,
          customer_photo_url: saleData.customer_photo_url,
        }])
        .select("*, customers(*)")
        .single();

      if (saleError) throw saleError;

      for (const item of saleData.items) {
        const { error: itemError } = await supabase
          .from("sale_items")
          .insert([{
            sale_id: sale.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price,
          }]);

        if (itemError) throw itemError;

        const { data: product, error: productFetchError } = await supabase
          .from("products")
          .select("stock_quantity")
          .eq("id", item.product_id)
          .single();

        if (productFetchError) {
          console.error("Failed to fetch product for stock update:", productFetchError);
          throw new Error(`স্টক আপডেট করতে ব্যর্থ: ${item.product_id}`);
        }

        if (product) {
          const newStockQuantity = Math.max(0, product.stock_quantity - item.quantity);
          const { error: stockUpdateError } = await supabase
            .from("products")
            .update({ stock_quantity: newStockQuantity, last_stock_reason: "sale", last_stock_ref: sale.id } as any)
            .eq("id", item.product_id);

          if (stockUpdateError) {
            console.error("Failed to update stock:", stockUpdateError);
            throw new Error(`স্টক আপডেট করতে ব্যর্থ: ${item.product_id}`);
          }
        }
      }

      const { data: fullSale } = await supabase
        .from("sales")
        .select("*, customers(*), sale_items(*, products(*))")
        .eq("id", sale.id)
        .single();

      return fullSale;
    },
    onSuccess: (sale) => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      const offline = sale?._offline_pending;
      toast.success(offline
        ? "অফলাইন: বিক্রয় সংরক্ষিত হয়েছে, ইন্টারনেট আসলে সিঙ্ক হবে"
        : "বিক্রয় সফলভাবে সম্পন্ন হয়েছে!");

      const itemCount = sale?.sale_items?.length || cart.length;
      if (!offline) ActivityLogger.saleCreated(sale?.id, sale?.total_amount, itemCount);
      
      setLastSale(sale);
      setShowInvoice(true);
      setCart([]);
      setSelectedCustomer("");
      setPaymentMethod("cash");
      setInstantCustomerName("");
      setInstantCustomerPhone("");
      setPaidAmount(0);
      setCustomerPhotoUrl("");
    },
    onError: (error: any) => {
      toast.error(error.message || "বিক্রয় সম্পন্ন করতে ব্যর্থ");
    },
  });

  const addToCart = async (product: Product, requestedImei?: string) => {
    if ((product.stock_quantity ?? 0) <= 0) {
      toast.error(`${product.name} স্টকে নেই`);
      return;
    }
    if (cart.some(item => item.product.id === product.id)) {
      toast.error(`${product.name} ইতিমধ্যে কার্টে আছে`);
      return;
    }
    try {
      const { data: registered, error } = await (supabase as any)
        .from("imei_registry").select("imei,status").eq("product_id", product.id)
        .eq("status", "in_stock").order("created_at", { ascending: true });
      if (error) throw error;
      const registeredRows = registered || [];
      let imeiOptions = registeredRows.map((row: any) => row.imei as string);
      if (imeiOptions.length === 0 && registeredRows.length === 0 && product.imei && /^\\d{15}$/.test(product.imei)) {
        imeiOptions = [product.imei];
      }
      if (requestedImei && !imeiOptions.includes(requestedImei)) {
        toast.error("এই IMEI ডিভাইসটি বর্তমানে বিক্রয়যোগ্য স্টকে নেই");
        return;
      }
      const selectedImei = requestedImei || imeiOptions[0] || null;
      setCart(prev => [...prev, {
        product, quantity: 1, customPrice: Number(product.price),
        imei: selectedImei, availableImeis: imeiOptions.length ? imeiOptions : undefined,
      }]);
      toast.success(`${product.name} কার্টে যোগ হয়েছে${selectedImei ? ` · IMEI ${selectedImei}` : ""}`);
    } catch (error: any) {
      toast.error(error.message || "IMEI স্টক যাচাই করা যায়নি");
    }
  };

  const updatePrice = (productId: string, price: number) => {
    setCart(cart.map(item =>
      item.product.id === productId
        ? { ...item, customPrice: price }
        : item
    ));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(cart.filter(item => item.product.id !== productId));
      return;
    }
    setCart(cart.map(item => {
      if (item.product.id !== productId) return item;
      const maxStock = item.availableImeis?.length ? 1 : Number(item.product.stock_quantity ?? 1);
      if (quantity > maxStock) {
        toast.error(`${item.product.name}: স্টকে মাত্র ${maxStock}টি আছে`);
        return { ...item, quantity: maxStock };
      }
      return { ...item, quantity };
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const getTotal = () => {
    return cart.reduce((sum, item) => sum + (item.customPrice * item.quantity), 0);
  };

  const clearCart = () => {
    setCart([]);
    toast.success("কার্ট খালি করা হয়েছে");
  };

  const handleCompleteSaleClick = () => {
    if (cart.length === 0) {
      toast.error("কার্ট খালি");
      return;
    }

    const overStock = cart.find(item => item.quantity > Number(item.product.stock_quantity ?? 0));
    if (overStock) {
      toast.error(`${overStock.product.name}: স্টকের চেয়ে বেশি পরিমাণ নির্বাচন করা হয়েছে`);
      return;
    }

    const invalidPrice = cart.find(item => !(item.customPrice > 0));
    if (invalidPrice) {
      toast.error(`${invalidPrice.product.name}: বিক্রয় মূল্য সঠিক নয়`);
      return;
    }

    const dueNow = Math.max(0, getTotal() - paidAmount);
    if (dueNow > 0 && !selectedCustomer && !instantCustomerName.trim()) {
      toast.error("বাকিতে বিক্রয় করতে কাস্টমার নির্বাচন করুন বা ইন্সট্যান্ট কাস্টমারের নাম দিন");
      return;
    }


    const warningItems = cart.filter(item => {
      const cost = Number(item.product.cost) || 0;
      const price = item.customPrice;
      return cost > 0 && price > cost * 3;
    });

    if (warningItems.length > 0) {
      const itemNames = warningItems.map(i => i.product.name).join(', ');
      toast.warning(`⚠️ সতর্কতা: ${itemNames} এর বিক্রয় মূল্য অস্বাভাবিকভাবে বেশি (ক্রয় মূল্যের ৩ গুণের বেশি)। দয়া করে নিশ্চিত করুন।`, {
        duration: 8000,
      });
    }

    setShowConfirmDialog(true);
  };

  const confirmSale = () => {
    if (getTotal() <= 0) {
      toast.error("বিক্রয় মূল্য ০ হতে পারে না");
      return;
    }

    const dueAmount = Math.max(0, getTotal() - paidAmount);

    const saleData = {
      customer_id: selectedCustomer || null,
      total_amount: getTotal(),
      payment_method: paymentMethod,
      instant_customer_name: instantCustomerName || null,
      instant_customer_phone: instantCustomerPhone || null,
      paid_amount: paidAmount,
      due_amount: dueAmount,
      customer_photo_url: customerPhotoUrl || null,
      items: cart.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.customPrice,
        total_price: item.customPrice * item.quantity,
      })),
    };

    setShowConfirmDialog(false);
    completeSaleMutation.mutate(saleData);
  };

  const handleBarcodeScanned = async (barcode: string) => {
    const cleanCode = barcode.replace(/\\D/g, "");
    const { data: device } = await (supabase as any)
      .from("imei_registry").select("product_id,imei,status").eq("imei", cleanCode).maybeSingle();
    const product = products?.find(p => p.barcode === barcode || p.imei === barcode || p.id === device?.product_id);
    if (!product) {
      toast.error("এই বারকোড / IMEI দিয়ে পণ্য পাওয়া যায়নি");
      return;
    }
    if (device?.status && device.status !== "in_stock") {
      toast.error("এই IMEI ডিভাইসটি বর্তমানে বিক্রয়যোগ্য স্টকে নেই");
      return;
    }
    await addToCart(product, device?.imei || (product.imei === barcode ? barcode : undefined));
  };

  const filteredProducts = products?.filter(p => {
    const searchLower = searchTerm.toLowerCase();
    const imeiLower = imeiSearch.toLowerCase();
    
    const matchesSearch = 
      p.name?.toLowerCase().includes(searchLower) ||
      p.sku?.toLowerCase().includes(searchLower) ||
      p.brand?.toLowerCase().includes(searchLower) ||
      p.model?.toLowerCase().includes(searchLower) ||
      p.barcode?.toLowerCase().includes(searchLower);
    
    const matchesImei = !imeiSearch || p.imei?.toLowerCase().includes(imeiLower);
    
    const hasStock = showOutOfStock || p.stock_quantity > 0;
    
    return matchesSearch && matchesImei && hasStock;
  });

  const total = getTotal();

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      <POSHeader
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        imeiSearch={imeiSearch}
        onImeiSearchChange={setImeiSearch}
        showOutOfStock={showOutOfStock}
        onShowOutOfStockChange={setShowOutOfStock}
        onOpenScanner={() => setShowScanner(true)}
      />

      <div className="flex-1 flex lg:flex-row flex-col overflow-y-auto lg:overflow-hidden">
        {/* Products Section */}
        <div className="flex-1 lg:flex-[2] lg:overflow-y-auto p-3 lg:p-6 order-2 lg:order-1 space-y-3">
          <POSOfflineChecklist />
          <ProductGrid products={filteredProducts} onAddToCart={addToCart} />
        </div>

        {/* Cart Section */}
        <div className="lg:w-96 lg:flex-shrink-0 lg:border-l border-border lg:overflow-y-auto order-1 lg:order-2">
          <div className="p-4 lg:p-6">
            <CartSection
              cart={cart}
              isCollapsed={isCartCollapsed}
              onToggleCollapse={() => setIsCartCollapsed(!isCartCollapsed)}
              onUpdatePrice={updatePrice}
              onUpdateQuantity={updateQuantity}
              onRemoveItem={removeFromCart}
              onClearCart={clearCart}
              total={total}
            />
            <div className="mt-4">
              <PaymentSection
                customers={customers}
                selectedCustomer={selectedCustomer}
                onCustomerChange={setSelectedCustomer}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={setPaymentMethod}
                total={total}
                cartEmpty={cart.length === 0}
                isProcessing={completeSaleMutation.isPending}
                onCompleteSale={handleCompleteSaleClick}
                instantCustomerName={instantCustomerName}
                onInstantCustomerNameChange={setInstantCustomerName}
                instantCustomerPhone={instantCustomerPhone}
                onInstantCustomerPhoneChange={setInstantCustomerPhone}
                paidAmount={paidAmount}
                onPaidAmountChange={setPaidAmount}
                customerPhotoUrl={customerPhotoUrl}
                onCustomerPhotoUrlChange={setCustomerPhotoUrl}
              />
            </div>
          </div>
        </div>
      </div>

      <SaleConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        cart={cart}
        total={total}
        onConfirm={confirmSale}
      />

      {showInvoice && lastSale && (
        <InvoiceModal
          isOpen={showInvoice}
          sale={lastSale}
          onClose={() => setShowInvoice(false)}
        />
      )}

      <BarcodeScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleBarcodeScanned}
      />
    </div>
  );
}
