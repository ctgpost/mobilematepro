import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { offlineMutate } from "@/lib/offlineMutate";
import { ProductHistory } from "./ProductHistory";
import { ProductDetailModal } from "./ProductDetailModal";
import { BarcodeScanner } from "./BarcodeScanner";
import { ProductQuickView } from "./ProductQuickView";
import { ProductLabelPrint } from "./ProductLabelPrint";
import { Eye, ScanBarcode, Download, FileSpreadsheet, FileText, Printer, Loader2, Pencil, History, Trash2 } from "lucide-react";
import { ActivityLogger } from "@/hooks/useActivityLog";
import { CollapsibleSection } from "./CollapsibleSection";
import { PageHeader } from "./PageHeader";
import { PhotoUpload } from "./PhotoUpload";
import * as XLSX from "xlsx";
import { fetchAll } from "@/lib/fetchAll";

const SUPPLIER_PHOTO_FLAG_KEY = "products:show_instant_supplier_photo";
const getInstantSupplierPhotoEnabled = () => {
  try { return localStorage.getItem(SUPPLIER_PHOTO_FLAG_KEY) === "1"; } catch { return false; }
};

const friendlyProductError = (error: any, imei?: string): string => {
  const code = error?.code;
  const msg: string = error?.message || "";
  // Postgres unique violation
  if (code === "23505" || /duplicate key|unique constraint/i.test(msg)) {
    if (/products_imei_in_stock_unique|imei/i.test(msg)) {
      return `এই IMEI${imei ? ` (${imei})` : ""} দিয়ে ইতিমধ্যে একটি অবিক্রিত মোবাইল স্টকে রয়েছে। আগে সেটি বিক্রি করুন, তারপর একই IMEI আবার ব্যবহার করতে পারবেন।`;
    }
    return "ডুপ্লিকেট এন্ট্রি — এই তথ্য ইতিমধ্যে রয়েছে।";
  }
  if (code === "23502") return "প্রয়োজনীয় ফিল্ড খালি রয়েছে। সব তথ্য পূরণ করুন।";
  if (code === "23503") return "সম্পর্কিত তথ্য পাওয়া যায়নি (ক্যাটাগরি/সাপ্লায়ার)।";
  return msg || "প্রোডাক্ট সেভ করতে ব্যর্থ হয়েছে";
};

// Strip spaces, dashes and any non-digit char, then cap at 15 digits.
// Handles input from keyboard-emulated hardware scanners, camera scans and manual typing.
const sanitizeImei = (raw: string): string =>
  (raw || "").replace(/[\s\-_.]/g, "").replace(/\D/g, "").slice(0, 15);


export function Products() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [historyProduct, setHistoryProduct] = useState<{ imei: string; name: string } | null>(null);
  const [detailProduct, setDetailProduct] = useState<any>(null);
  const [quickViewIndex, setQuickViewIndex] = useState<number>(-1);
  const [labelProduct, setLabelProduct] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCondition, setFilterCondition] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showScanner, setShowScanner] = useState(false);
  const [showImeiScanner, setShowImeiScanner] = useState(false);
  const [imeiScanError, setImeiScanError] = useState<string | null>(null);
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    category_id: "",
    sku: "",
    barcode: "",
    imei: "",
    brand: "",
    model: "",
    condition: "new",
    price: "",
    cost: "",
    unit: "pcs",
    ram: "",
    storage: "",
    battery: "",
    supplier_id: "",
    supplier_name: "",
    supplier_mobile: "",
    supplier_nid: "",
    supplier_photo_url: "",
    warranty_expiry_date: "",
    warranty_status: "no_warranty",
  });
  const [showInstantSupplierPhoto, setShowInstantSupplierPhoto] = useState<boolean>(getInstantSupplierPhotoEnabled());
  const [supplierMode, setSupplierMode] = useState<"existing" | "custom">("existing");
  const [showInstantSupplier, setShowInstantSupplier] = useState(false);
  const [instantSupplierName, setInstantSupplierName] = useState("");
  const [instantSupplierPhone, setInstantSupplierPhone] = useState("");

  useEffect(() => {
    const sync = () => setShowInstantSupplierPhoto(getInstantSupplierPhotoEnabled());
    window.addEventListener("storage", sync);
    window.addEventListener("instant-supplier-photo-toggle", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("instant-supplier-photo-toggle", sync);
    };
  }, []);

  // Global shortcut: Ctrl+Shift+P opens "Add Product" dialog
  useEffect(() => {
    const open = () => setIsAddDialogOpen(true);
    window.addEventListener("shortcut:add-product", open);
    return () => window.removeEventListener("shortcut:add-product", open);
  }, []);

  const queryClient = useQueryClient();

  const { data: suppliersList } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () =>
      fetchAll<any>("products", "*, categories(name)", (q) => q.order("name")),
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const { data: inserted, error, queued, tempId } = await offlineMutate<any[]>("products", "insert", [data]);
      if (error) throw error;
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      return { id: row?.id ?? tempId, name: data.name, queued, tempId, raw: row, submitted: data };
    },
    onSuccess: (result) => {
      if (result.queued) {
        // Optimistically inject the queued product into the cache so
        // it appears instantly in the list while offline.
        const cat = (categories || []).find((c: any) => c.id === result.submitted.category_id);
        const optimistic = {
          ...result.submitted,
          id: result.tempId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          categories: cat ? { name: cat.name } : null,
          _offline_pending: true,
        };
        queryClient.setQueryData<any[]>(["products"], (old) =>
          old ? [optimistic, ...old] : [optimistic]
        );
      } else {
        queryClient.invalidateQueries({ queryKey: ["products"] });
      }
      toast.success(result.queued ? "অফলাইন: পণ্য সারিতে যোগ হয়েছে, পরে সিঙ্ক হবে" : "Product added successfully!");
      if (!result.queued) ActivityLogger.productAdded(result.name, result.id);
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(friendlyProductError(error, formData.imei));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error, queued } = await offlineMutate("products", "update", { values: data, match: { id } });
      if (error) throw error;
      return { id, name: data.name, queued };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(result.queued ? "অফলাইন: পরিবর্তন সারিতে যোগ হয়েছে" : "Product updated successfully!");
      if (!result.queued) ActivityLogger.productUpdated(result.name, result.id);
      setEditingProduct(null);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(friendlyProductError(error, formData.imei));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error, queued } = await offlineMutate("products", "delete", { match: { id } });
      if (error) throw error;
      return { name, queued };
    },
    onSuccess: ({ name, queued }) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(queued ? "অফলাইন: মুছে ফেলা সারিতে যোগ হয়েছে" : "Product deleted successfully!");
      if (!queued) ActivityLogger.productDeleted(name);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete product");
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      category_id: "",
      sku: "",
      barcode: "",
      imei: "",
      brand: "",
      model: "",
      condition: "new",
      price: "",
      cost: "",
      unit: "pcs",
      ram: "",
      storage: "",
      battery: "",
      supplier_id: "",
      supplier_name: "",
      supplier_mobile: "",
      supplier_nid: "",
      supplier_photo_url: "",
      warranty_expiry_date: "",
      warranty_status: "no_warranty",
    });
    setSupplierMode("existing");
  };

  const generateSKU = () => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 7);
    return `SKU-${timestamp}-${random}`.toUpperCase();
  };

  const generateBarcode = () => {
    return Math.floor(100000000000 + Math.random() * 900000000000).toString();
  };

  const extractBrand = (productName: string) => {
    return productName.split(' ')[0];
  };

  const extractModel = (productName: string) => {
    const parts = productName.split(' ');
    return parts.slice(1).join(' ');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate IMEI is exactly 15 digits
    if (!formData.imei || formData.imei.length !== 15) {
      toast.error("IMEI অবশ্যই ১৫ ডিজিটের হতে হবে");
      return;
    }

    // Check for duplicate IMEI (both add and edit) — works offline using cached products
    if (formData.imei) {
      let existingProducts: any[] = [];
      if (typeof navigator !== "undefined" && navigator.onLine) {
        let query = supabase
          .from("products")
          .select("id, name, stock_quantity")
          .eq("imei", formData.imei)
          .gt("stock_quantity", 0);

        if (editingProduct) {
          query = query.neq("id", editingProduct.id);
        }

        const { data, error } = await query;
        if (error) {
          toast.error("IMEI চেক করতে ব্যর্থ");
          return;
        }
        existingProducts = data || [];
      } else {
        // Offline: use cached products list
        existingProducts = (products || []).filter((p: any) =>
          p.imei === formData.imei &&
          (p.stock_quantity ?? 0) > 0 &&
          (!editingProduct || p.id !== editingProduct.id)
        );
      }

      if (existingProducts && existingProducts.length > 0) {
        toast.error(`এই IMEI (${formData.imei}) দিয়ে "${existingProducts[0].name}" ইতিমধ্যে স্টকে আছে। আগে বিক্রি করুন, তারপর আবার এন্ট্রি করতে পারবেন।`);
        return;
      }
    }

    // Profit validation warning
    const price = parseFloat(formData.price) || 0;
    const cost = parseFloat(formData.cost) || 0;
    if (cost > 0 && price > cost * 3) {
      toast.warning(`⚠️ সতর্কতা: বিক্রয় মূল্য (${price}) ক্রয় মূল্যের (${cost}) ৩ গুণের বেশি। দয়া করে যাচাই করুন।`, {
        duration: 5000,
      });
    }

    const submitData = {
      ...formData,
      sku: editingProduct ? formData.sku : generateSKU(),
      barcode: editingProduct ? formData.barcode : generateBarcode(),
      brand: formData.brand || extractBrand(formData.name),
      model: formData.model || extractModel(formData.name),
      price: price,
      cost: cost,
      stock_quantity: 1,
      low_stock_threshold: 0,
      category_id: formData.category_id || null,
      supplier_id: formData.supplier_id || null,
    };

    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: submitData });
    } else {
      addMutation.mutate(submitData);
    }
  };

  const startEdit = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name || "",
      category_id: product.category_id || "",
      sku: product.sku || "",
      barcode: product.barcode || "",
      imei: product.imei || "",
      brand: product.brand || "",
      model: product.model || "",
      condition: product.condition || "new",
      price: product.price?.toString() || "",
      cost: product.cost?.toString() || "",
      unit: product.unit || "pcs",
      ram: product.ram || "",
      storage: product.storage || "",
      battery: product.battery || "",
      supplier_id: product.supplier_id || "",
      supplier_name: product.supplier_name || "",
      supplier_mobile: product.supplier_mobile || "",
      supplier_nid: product.supplier_nid || "",
      supplier_photo_url: product.supplier_photo_url || "",
      warranty_expiry_date: product.warranty_expiry_date || "",
      warranty_status: product.warranty_status || "no_warranty",
    });
    setSupplierMode(product.supplier_id ? "existing" : (product.supplier_name ? "custom" : "existing"));
  };

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    
    return products.filter((product) => {
      const matchesSearch = 
        searchTerm === "" ||
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.imei?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCondition = 
        filterCondition === "all" || 
        product.condition === filterCondition;

      const matchesCategory = 
        filterCategory === "all" || 
        product.category_id === filterCategory;

      const hasStock = showOutOfStock || product.stock_quantity > 0;

      return matchesSearch && matchesCondition && matchesCategory && hasStock;
    });
  }, [products, searchTerm, filterCondition, filterCategory, showOutOfStock]);

  const handleBarcodeScanned = (barcode: string) => {
    // Search for product by barcode or IMEI
    const product = products?.find(p => 
      p.barcode === barcode || p.imei === barcode
    );

    if (product) {
      setDetailProduct(product);
    } else {
      toast.error("Product not found with this barcode");
    }
  };

  // Download products as Excel
  const downloadExcel = () => {
    if (!products || products.length === 0) {
      toast.error("কোনো প্রোডাক্ট নেই ডাউনলোড করার জন্য");
      return;
    }

    const excelData = products.map((product, index) => ({
      'ক্রমিক': index + 1,
      'প্রোডাক্ট নাম': product.name,
      'ব্র্যান্ড': product.brand || '',
      'মডেল': product.model || '',
      'IMEI': product.imei || '',
      'SKU': product.sku || '',
      'বারকোড': product.barcode || '',
      'অবস্থা': product.condition === 'new' ? 'নতুন' : 'ব্যবহৃত',
      'ক্যাটাগরি': (product as any).categories?.name || '',
      'ক্রয় মূল্য (৳)': product.cost || 0,
      'বিক্রয় মূল্য (৳)': product.price || 0,
      'স্টক': product.stock_quantity || 0,
      'RAM': product.ram || '',
      'Storage': product.storage || '',
      'Battery': product.battery || '',
      'সাপ্লায়ার নাম': product.supplier_name || '',
      'সাপ্লায়ার মোবাইল': product.supplier_mobile || '',
      'সাপ্লায়ার NID': product.supplier_nid || '',
      'ওয়ারেন্টি স্ট্যাটাস': product.warranty_status === 'active' ? 'সক্রিয়' : product.warranty_status === 'expired' ? 'মেয়াদোত্তীর্ণ' : 'নেই',
      'ওয়ারেন্টি মেয়াদ': product.warranty_expiry_date || '',
      'যুক্ত হয়েছে': new Date(product.created_at).toLocaleDateString('bn-BD'),
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    
    // Auto-size columns
    const colWidths = Object.keys(excelData[0] || {}).map(key => ({ wch: Math.max(key.length + 2, 15) }));
    worksheet['!cols'] = colWidths;

    const fileName = `MobileMatePro_Products_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success(`${products.length}টি প্রোডাক্ট Excel এ ডাউনলোড হয়েছে`);
  };

  // Download products as PDF (using print)
  const downloadPDF = () => {
    if (!products || products.length === 0) {
      toast.error("কোনো প্রোডাক্ট নেই ডাউনলোড করার জন্য");
      return;
    }

    const totalValue = products.reduce((sum, p) => sum + (p.price || 0) * (p.stock_quantity || 0), 0);
    const totalCost = products.reduce((sum, p) => sum + (p.cost || 0) * (p.stock_quantity || 0), 0);
    const inStock = products.filter(p => (p.stock_quantity || 0) > 0).length;
    const outOfStock = products.filter(p => (p.stock_quantity || 0) <= 0).length;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>MOBILE MATE PRO - প্রোডাক্ট তালিকা</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; font-size: 11px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; }
          .header h1 { font-size: 24px; color: #1a1a1a; }
          .header p { color: #666; margin-top: 5px; }
          .summary { display: flex; justify-content: space-around; margin-bottom: 20px; background: #f5f5f5; padding: 15px; border-radius: 8px; }
          .summary-item { text-align: center; }
          .summary-item .value { font-size: 18px; font-weight: bold; color: #0066cc; }
          .summary-item .label { font-size: 10px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #0066cc; color: white; font-weight: 600; }
          tr:nth-child(even) { background: #f9f9f9; }
          tr:hover { background: #e8f4ff; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .stock-out { background: #ffe6e6 !important; color: #cc0000; }
          .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #666; border-top: 1px solid #ddd; padding-top: 10px; }
          @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>👑 MOBILE MATE PRO</h1>
          <p>প্রোডাক্ট ইনভেন্টরি তালিকা</p>
          <p style="font-size: 10px; margin-top: 5px;">তারিখ: ${new Date().toLocaleDateString('bn-BD')}</p>
        </div>
        
        <div class="summary">
          <div class="summary-item">
            <div class="value">${products.length}</div>
            <div class="label">মোট প্রোডাক্ট</div>
          </div>
          <div class="summary-item">
            <div class="value">${inStock}</div>
            <div class="label">স্টকে আছে</div>
          </div>
          <div class="summary-item">
            <div class="value">${outOfStock}</div>
            <div class="label">আউট অফ স্টক</div>
          </div>
          <div class="summary-item">
            <div class="value">৳${totalCost.toLocaleString('bn-BD')}</div>
            <div class="label">মোট বিনিয়োগ</div>
          </div>
          <div class="summary-item">
            <div class="value">৳${totalValue.toLocaleString('bn-BD')}</div>
            <div class="label">মোট মূল্য</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="text-center">ক্রমিক</th>
              <th>প্রোডাক্ট নাম</th>
              <th>IMEI</th>
              <th>অবস্থা</th>
              <th class="text-right">ক্রয় (৳)</th>
              <th class="text-right">বিক্রয় (৳)</th>
              <th class="text-center">স্টক</th>
              <th>সাপ্লায়ার</th>
            </tr>
          </thead>
          <tbody>
            ${products.map((product, index) => `
              <tr class="${(product.stock_quantity || 0) <= 0 ? 'stock-out' : ''}">
                <td class="text-center">${index + 1}</td>
                <td><strong>${product.name}</strong><br/><small>${product.brand || ''} ${product.model || ''}</small></td>
                <td style="font-family: monospace; font-size: 10px;">${product.imei || '-'}</td>
                <td>${product.condition === 'new' ? 'নতুন' : 'ব্যবহৃত'}</td>
                <td class="text-right">${(product.cost || 0).toLocaleString('bn-BD')}</td>
                <td class="text-right">${(product.price || 0).toLocaleString('bn-BD')}</td>
                <td class="text-center">${product.stock_quantity || 0}</td>
                <td>${product.supplier_name || '-'}<br/><small>${product.supplier_mobile || ''}</small></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <p>MOBILE MATE PRO - Sales & Stock Management System</p>
          <p>Generated on ${new Date().toLocaleString('bn-BD')}</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
      toast.success(`${products.length}টি প্রোডাক্ট PDF এ ডাউনলোড হচ্ছে`);
    } else {
      toast.error("পপআপ ব্লক করা আছে। অনুগ্রহ করে পপআপ অনুমতি দিন।");
    }
  };

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      <PageHeader
        storageKey="products"
        title="Products"
        subtitle="Manage your inventory"
        actions={
          <></>
        }
      />
      {/* Action toolbar (visible always; collapse only the title block) */}
      <div className="space-y-4 pt-3">
        <div className="flex flex-wrap items-center gap-2">
            {/* Download Buttons */}
            <Button
              onClick={downloadExcel}
              variant="outline"
              className="border-green-500 text-green-600 hover:bg-green-50 text-sm md:text-base"
              title="Excel ডাউনলোড"
            >
              <FileSpreadsheet className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Excel</span>
            </Button>
            <Button
              onClick={downloadPDF}
              variant="outline"
              className="border-red-500 text-red-600 hover:bg-red-50 text-sm md:text-base"
              title="PDF ডাউনলোড"
            >
              <FileText className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-customers'))}
              variant="outline"
              className="border-primary text-primary hover:bg-primary/10 text-sm md:text-base"
            >
              <span className="hidden sm:inline">👥 Customers</span>
              <span className="sm:hidden">👥</span>
            </Button>
            <Button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate-to-categories'))}
              variant="outline"
              className="border-primary text-primary hover:bg-primary/10 text-sm md:text-base"
            >
              <span className="hidden sm:inline">📁 Categories</span>
              <span className="sm:hidden">📁</span>
            </Button>
            <Dialog open={isAddDialogOpen || !!editingProduct} onOpenChange={(open) => {
              if (!open) {
                setIsAddDialogOpen(false);
                setEditingProduct(null);
                resetForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => setIsAddDialogOpen(true)}
                  className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-sm md:text-base"
                >
                  <span className="hidden sm:inline">➕ Add Product</span>
                  <span className="sm:hidden">➕</span>
                </Button>
              </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg md:text-xl">{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
              <DialogDescription className="text-sm">
                {editingProduct ? "Update product details" : "Enter product information to add to inventory"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-2">মডেল নাম্বার / Product Model *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => {
                      const newName = e.target.value;
                      const cat = categories?.find((c: any) => c.id === formData.category_id);
                      const brandFromCat = cat?.name || extractBrand(newName);
                      // If user picked category, treat input as model number and prefix brand
                      const finalName = cat?.name && !newName.toLowerCase().startsWith(cat.name.toLowerCase())
                        ? `${cat.name} ${newName}`.trim()
                        : newName;
                      setFormData({
                        ...formData,
                        name: finalName,
                        brand: brandFromCat,
                        model: cat?.name ? newName : extractModel(newName),
                      });
                    }}
                    placeholder="ক্যাটাগরী সিলেক্ট করুন, তারপর শুধু মডেল নাম্বার লিখুন"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Category</label>
                  <Select
                    value={formData.category_id}
                    onValueChange={(value) => {
                      const cat = categories?.find((c: any) => c.id === value);
                      setFormData({
                        ...formData,
                        category_id: value,
                        // Auto-fill brand from category name when empty or auto-derived
                        brand: cat?.name || formData.brand,
                        // Treat product name as model number; final name = brand + model
                        name: cat?.name && formData.model
                          ? `${cat.name} ${formData.model}`.trim()
                          : formData.name,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">IMEI * (15 digits)</label>
                  <div className="flex gap-2">
                    <Input
                      value={formData.imei}
                      onChange={(e) => {
                        const value = sanitizeImei(e.target.value);
                        setFormData({ ...formData, imei: value });
                      }}
                      onPaste={(e) => {
                        e.preventDefault();
                        const text = e.clipboardData.getData("text");
                        setFormData((prev) => ({ ...prev, imei: sanitizeImei(text) }));
                      }}
                      placeholder="Enter 15-digit IMEI or scan"
                      required
                      pattern="[0-9]{15}"
                      minLength={15}
                      maxLength={15}
                      title="IMEI must be exactly 15 digits"
                      inputMode="numeric"
                      autoComplete="off"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setImeiScanError(null);
                        setShowImeiScanner(true);
                      }}
                      disabled={showImeiScanner}
                      title="ক্যামেরা / বারকোড স্ক্যানার দিয়ে IMEI স্ক্যান করুন"
                      aria-label="Scan IMEI"
                    >
                      {showImeiScanner ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ScanBarcode className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {showImeiScanner && (
                    <p className="text-xs text-muted-foreground mt-1">
                      স্ক্যানার চলছে... ক্যামেরার সামনে বারকোড/IMEI লেবেল ধরুন
                    </p>
                  )}
                  {imeiScanError && !showImeiScanner && (
                    <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive space-y-2">
                      <p className="font-semibold">স্ক্যান ব্যর্থ</p>
                      <p>{imeiScanError}</p>
                      <p className="text-muted-foreground">
                        পরবর্তী ধাপ: ব্রাউজারের অ্যাড্রেস বারের পাশে 🔒 আইকনে ক্লিক করে সাইট পারমিশন থেকে ক্যামেরা "Allow" করুন, অথবা হার্ডওয়্যার স্ক্যানার/ম্যানুয়াল ইনপুট ব্যবহার করুন।
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setImeiScanError(null);
                          setShowImeiScanner(true);
                        }}
                      >
                        আবার চেষ্টা করুন
                      </Button>
                    </div>
                  )}
                  {formData.imei && formData.imei.length !== 15 && (
                    <p className="text-xs text-red-500 mt-1">
                      IMEI অবশ্যই ঠিক ১৫ ডিজিটের হতে হবে (এখন {formData.imei.length} ডিজিট)
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Brand</label>
                  <Input
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="Auto-filled from product name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Model</label>
                  <Input
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="Auto-filled from product name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Condition</label>
                  <Select value={formData.condition} onValueChange={(value) => setFormData({ ...formData, condition: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="used">Used</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Unit</label>
                  <Input
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Price</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Cost</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  />
                </div>
              </div>

              {/* Quick Specifications (Optional) */}
              <div className="pt-4 border-t border-border">
                <h3 className="text-sm font-semibold mb-3 text-foreground">Quick Specifications (Optional)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">RAM</label>
                    <Input
                      value={formData.ram}
                      onChange={(e) => setFormData({ ...formData, ram: e.target.value })}
                      placeholder="e.g., 8GB"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Storage</label>
                    <Input
                      value={formData.storage}
                      onChange={(e) => setFormData({ ...formData, storage: e.target.value })}
                      placeholder="e.g., 256GB"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Battery</label>
                    <Input
                      value={formData.battery}
                      onChange={(e) => setFormData({ ...formData, battery: e.target.value })}
                      placeholder="e.g., 5000mAh"
                    />
                  </div>
                </div>
              </div>

              {/* Supplier Information (Optional) */}
              <div className="pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">Supplier Information (Optional)</h3>
                  <div className="flex gap-1 text-xs">
                    <button type="button" onClick={() => setSupplierMode("existing")}
                      className={`px-2 py-1 rounded ${supplierMode === "existing" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      নিবন্ধিত
                    </button>
                    <button type="button" onClick={() => setSupplierMode("custom")}
                      className={`px-2 py-1 rounded ${supplierMode === "custom" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      ইন্সট্যান্ট
                    </button>
                  </div>
                </div>

                {supplierMode === "existing" ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-2">Select Supplier</label>
                      <div className="flex gap-2">
                        <Select
                          value={formData.supplier_id}
                          onValueChange={(v) => {
                            const sup = suppliersList?.find((s: any) => s.id === v);
                            setFormData({
                              ...formData,
                              supplier_id: v,
                              supplier_name: sup?.name || "",
                              supplier_mobile: sup?.phone || "",
                            });
                          }}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="সাপ্লায়ার নির্বাচন করুন" />
                          </SelectTrigger>
                          <SelectContent>
                            {suppliersList?.map((s: any) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name} {s.phone ? `(${s.phone})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowInstantSupplier(true)}>
                          + নতুন
                        </Button>
                      </div>
                    </div>
                    {formData.supplier_id && (
                      <div>
                        <label className="block text-sm font-medium mb-2">সাপ্লায়ার NID</label>
                        <Input value={formData.supplier_nid} onChange={(e) => setFormData({ ...formData, supplier_nid: e.target.value })} placeholder="NID number" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Supplier Name</label>
                      <Input value={formData.supplier_name} onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value, supplier_id: "" })} placeholder="ইন্সট্যান্ট সাপ্লায়ার নাম" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Supplier Mobile</label>
                      <Input value={formData.supplier_mobile} onChange={(e) => setFormData({ ...formData, supplier_mobile: e.target.value })} placeholder="মোবাইল নম্বর" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium mb-2">Supplier NID</label>
                      <Input value={formData.supplier_nid} onChange={(e) => setFormData({ ...formData, supplier_nid: e.target.value })} placeholder="NID number" />
                    </div>
                    {showInstantSupplierPhoto && (
                      <div className="sm:col-span-2 p-3 rounded-lg bg-muted/30 border border-border">
                        <PhotoUpload
                          value={formData.supplier_photo_url}
                          onChange={(url) => setFormData((prev) => ({ ...prev, supplier_photo_url: url || "" }))}
                          label="ইন্সট্যান্ট সাপ্লায়ারের ছবি (ঐচ্ছিক)"
                          size="sm"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Quick add supplier dialog */}
              {showInstantSupplier && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <div className="bg-background rounded-lg p-5 w-full max-w-md space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                    <h3 className="font-semibold">দ্রুত নতুন সাপ্লায়ার যোগ</h3>
                    <Input placeholder="নাম *" value={instantSupplierName} onChange={(e) => setInstantSupplierName(e.target.value)} />
                    <Input
                      placeholder="ফোন (ঐচ্ছিক)"
                      value={instantSupplierPhone}
                      onChange={(e) => setInstantSupplierPhone(e.target.value.replace(/[^0-9+\-\s]/g, ""))}
                      type="tel"
                      maxLength={20}
                    />
                    <div className="p-3 rounded-lg bg-muted/30 border border-border">
                      <PhotoUpload
                        value={formData.supplier_photo_url}
                        onChange={(url) => setFormData((prev) => ({ ...prev, supplier_photo_url: url || "" }))}
                        label="সাপ্লায়ারের ছবি (ঐচ্ছিক) — ক্যামেরা/আপলোড"
                        size="sm"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setShowInstantSupplier(false)}>বাতিল</Button>
                      <Button type="button" onClick={async () => {
                        if (!instantSupplierName.trim()) { toast.error("নাম দিন"); return; }
                        if (instantSupplierName.trim().length < 2) { toast.error("নাম কমপক্ষে ২ অক্ষরের হতে হবে"); return; }
                        if (instantSupplierPhone && instantSupplierPhone.replace(/\D/g, "").length < 6) { toast.error("ফোন নাম্বার সঠিক নয়"); return; }
                        const { data, error } = await supabase.from("suppliers").insert([{
                          name: instantSupplierName.trim(),
                          phone: instantSupplierPhone || null,
                          photo_url: formData.supplier_photo_url || null,
                        }]).select().single();
                        if (error) { toast.error(error.message); return; }
                        queryClient.invalidateQueries({ queryKey: ["suppliers"] });
                        setFormData({ ...formData, supplier_id: data.id, supplier_name: data.name, supplier_mobile: data.phone || "" });
                        setInstantSupplierName(""); setInstantSupplierPhone("");
                        setShowInstantSupplier(false);
                        toast.success("সাপ্লায়ার যোগ হয়েছে");
                      }}>যোগ করুন</Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Warranty Information (Optional) */}
              <div className="pt-4 border-t border-border">
                <h3 className="text-sm font-semibold mb-3 text-foreground">Warranty Information (Optional)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Warranty Status</label>
                    <Select value={formData.warranty_status} onValueChange={(value) => setFormData({ ...formData, warranty_status: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no_warranty">No Warranty</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                        <SelectItem value="void">Void</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Warranty Expiry Date</label>
                    <Input
                      type="date"
                      value={formData.warranty_expiry_date}
                      onChange={(e) => setFormData({ ...formData, warranty_expiry_date: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    setEditingProduct(null);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={formData.imei.length !== 15}
                  className="bg-gradient-to-r from-primary to-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  title={formData.imei.length !== 15 ? "IMEI অবশ্যই ঠিক ১৫ ডিজিটের হতে হবে" : undefined}
                >
                  {editingProduct ? "Update" : "Add"} Product
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
          </div>

      {/* Search and Filters */}
      <Card className="p-4">
        <CollapsibleSection
          storageKey="products-filters"
          title={<h3 className="text-sm font-bold">🔍 সার্চ ও ফিল্টার</h3>}
        >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2 flex gap-2">
            <Input
              placeholder="Search by name, IMEI, brand, or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Button 
              variant="outline" 
              onClick={() => setShowScanner(true)}
              className="shrink-0"
            >
              <ScanBarcode className="w-4 h-4" />
            </Button>
          </div>
          <Select value={filterCondition} onValueChange={setFilterCondition}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by condition" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Conditions</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="used">Used</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories?.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-4 flex items-center space-x-2">
          <Checkbox 
            id="showOutOfStock" 
            checked={showOutOfStock}
            onCheckedChange={(checked) => setShowOutOfStock(checked as boolean)}
          />
          <label
            htmlFor="showOutOfStock"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Show out of stock products (0 stock)
          </label>
        </div>
        {(searchTerm || filterCondition !== "all" || filterCategory !== "all") && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Found {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setFilterCondition("all");
                setFilterCategory("all");
              }}
            >
              Clear Filters
            </Button>
          </div>
        )}
        </CollapsibleSection>
      </Card>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 pt-4 pb-6">
        {filteredProducts?.map((product) => (
          <Card key={product.id} className="p-6 card-hover">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
              <div className="flex-1">
                  <h3 className="font-semibold text-lg text-foreground">{product.name}</h3>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {product.brand && (
                      <span className="inline-block text-xs bg-accent/10 text-accent px-2 py-1 rounded-full">
                        {product.brand}
                      </span>
                    )}
                    {product.condition && (
                      <span className={`inline-block text-xs px-2 py-1 rounded-full ${
                        product.condition === 'new' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {product.condition === 'new' ? '✨ New' : '♻️ Used'}
                      </span>
                    )}
                    {product.categories && (
                      <span className="inline-block text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                        {product.categories.name}
                      </span>
                    )}
                  </div>
                </div>
                {product.stock_quantity <= product.low_stock_threshold && (
                  <span className="text-xl" title="Low Stock">⚠️</span>
                )}
              </div>
              {product.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
              )}
              <div className="space-y-2 text-sm">
                {(product.ram || product.storage || product.battery) && (
                  <div className="flex flex-wrap gap-2 pb-2 border-b border-border">
                    {product.ram && (
                      <span className="text-xs bg-muted px-2 py-1 rounded">🧠 {product.ram}</span>
                    )}
                    {product.storage && (
                      <span className="text-xs bg-muted px-2 py-1 rounded">💾 {product.storage}</span>
                    )}
                    {product.battery && (
                      <span className="text-xs bg-muted px-2 py-1 rounded">🔋 {product.battery}</span>
                    )}
                  </div>
                )}
                {(product.supplier_name || product.supplier_mobile) && (
                  <div className="pb-2 border-b border-border">
                    <p className="text-xs text-muted-foreground mb-1">Supplier Info:</p>
                    {product.supplier_name && (
                      <p className="text-xs">📦 {product.supplier_name}</p>
                    )}
                    {product.supplier_mobile && (
                      <p className="text-xs">📱 {product.supplier_mobile}</p>
                    )}
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price:</span>
                  <span className="font-semibold text-foreground">${Number(product.price).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stock:</span>
                  <span className={`font-semibold ${product.stock_quantity <= product.low_stock_threshold ? 'text-amber-600' : 'text-foreground'}`}>
                    {product.stock_quantity} {product.unit}
                  </span>
                </div>
                {product.sku && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SKU:</span>
                    <span className="font-mono text-xs text-foreground">{product.sku}</span>
                  </div>
                )}
                {product.imei && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IMEI:</span>
                    <span className="font-mono text-xs text-foreground">{product.imei}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-5 gap-1.5 pt-2">
                <Button
                  variant="outline"
                  size="icon"
                  title="দেখুন"
                  onClick={() => {
                    const index = filteredProducts.findIndex(p => p.id === product.id);
                    if (window.innerWidth < 1024) {
                      setQuickViewIndex(index);
                    } else {
                      setDetailProduct(product);
                    }
                  }}
                  className="w-full h-9"
                >
                  <Eye className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="এডিট করুন"
                  onClick={() => startEdit(product)}
                  className="w-full h-9"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setHistoryProduct({ imei: product.imei || "", name: product.name })}
                  className="w-full h-9"
                  disabled={!product.imei}
                  title="হিস্ট্রি"
                >
                  <History className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setLabelProduct(product)}
                  className="w-full h-9"
                  title="বারকোড লেবেল প্রিন্ট"
                >
                  <Printer className="w-4 h-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  title="ডিলিট"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this product?")) {
                      deleteMutation.mutate({ id: product.id, name: product.name });
                    }
                  }}
                  className="w-full h-9"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
        </div>

        {(!filteredProducts || filteredProducts.length === 0) && (
          <Card className="p-12 text-center">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">
              {products && products.length > 0 ? "No matching products" : "No products yet"}
            </h3>
            <p className="text-muted-foreground">
              {products && products.length > 0 
                ? "Try adjusting your search or filters" 
                : "Add your first product to get started!"}
            </p>
          </Card>
        )}
      </div>

      {historyProduct && (
        <ProductHistory
          imei={historyProduct.imei}
          productName={historyProduct.name}
          isOpen={!!historyProduct}
          onClose={() => setHistoryProduct(null)}
        />
      )}

      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          isOpen={!!detailProduct}
          onClose={() => setDetailProduct(null)}
        />
      )}

      <BarcodeScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleBarcodeScanned}
      />

      <BarcodeScanner
        isOpen={showImeiScanner}
        onClose={() => setShowImeiScanner(false)}
        onError={(msg) => setImeiScanError(msg)}
        onScan={(code) => {
          const digits = sanitizeImei(code);
          if (digits.length !== 15) {
            const msg = `স্ক্যান হয়েছে কিন্তু IMEI ১৫ ডিজিট নয় (${digits.length} ডিজিট পাওয়া গেছে)। বারকোড পরিষ্কার করে আবার স্ক্যান করুন।`;
            toast.error(msg);
            setImeiScanError(msg);
            return;
          }
          setImeiScanError(null);
          setFormData((prev) => ({ ...prev, imei: digits }));
          setShowImeiScanner(false);
          toast.success(`IMEI স্ক্যান সফল: ${digits}`);
        }}
      />

      <ProductQuickView
        products={filteredProducts || []}
        initialIndex={quickViewIndex}
        isOpen={quickViewIndex >= 0}
        onClose={() => setQuickViewIndex(-1)}
      />

      <ProductLabelPrint
        isOpen={!!labelProduct}
        product={labelProduct}
        onClose={() => setLabelProduct(null)}
      />
    </div>
  );
}
