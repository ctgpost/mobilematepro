import { useState, useMemo, useEffect } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { PageHeader } from "./PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { bn, enUS } from "date-fns/locale";
import { useLanguage } from "@/components/LanguageProvider";
import { RotateCcw, Search, Package, Calendar, CheckCircle, XCircle, Clock, Trash2, FileSpreadsheet, FileText, History, Truck } from "lucide-react";
import * as XLSX from "xlsx";
import { logReturnAudit } from "@/lib/returnsAudit";

import { ReturnAuditLog } from "./returns/ReturnAuditLog";
import { ReconciliationReport } from "./returns/ReconciliationReport";
import { RefundSettlementDialog, SettlementPlan } from "./returns/RefundSettlementDialog";

export function Returns() {
  const { language } = useLanguage();
  const dateLocale = language === "bn" ? bn : enUS;
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchSaleId, setSearchSaleId] = useState("");
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [reasonCode, setReasonCode] = useState("defective");
  const [reasonNotes, setReasonNotes] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [textFilter, setTextFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState("sales");
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditTarget, setAuditTarget] = useState<{ type: "sales" | "supplier"; id: string } | null>(null);
  
  const [pendingApprove, setPendingApprove] = useState<any>(null);
  const [settlementOpen, setSettlementOpen] = useState(false);

  const queryClient = useQueryClient();

  // Fetch returns
  const { data: returns, isLoading } = useQuery({
    queryKey: ["returns"],
    queryFn: async () => {
      // Unlimited paginated fetch — no 1000-row cap
      return fetchAll<any>(
        "returns",
        `
          *,
          sales (
            id,
            total_amount,
            due_amount,
            paid_amount,
            customer_id,
            created_at,
            customers (id, name, phone)
          ),
          sale_items (
            quantity,
            unit_price,
            total_price
          ),
          products (
            name,
            imei,
            brand
          )
        `,
        (q) => q.order("created_at", { ascending: false })
      );
    },
  });

  // Supplier returns (read-only embedded view)
  const { data: supplierReturns } = useQuery({
    queryKey: ["supplier_returns"],
    queryFn: async () => {
      // Unlimited paginated fetch — no 1000-row cap
      return fetchAll<any>(
        "supplier_returns",
        "*, products(name, imei, brand)",
        (q) => q.order("created_at", { ascending: false })
      );
    },
  });

  // Multi-strategy search: by sale id (invoice), customer name/phone, IMEI, instant customer info
  const searchSale = async () => {
    const term = searchSaleId.trim();
    if (!term) {
      toast.error("বিক্রয় ID, ইনভয়েস নং, IMEI বা ক্রেতার নাম/ফোন লিখুন");
      return;
    }

    setSearching(true);
    try {
      const SELECT = `*, customers (name, phone), sale_items (*, products (name, imei, brand, model))`;
      const collected = new Map<string, any>();

      // 1) Direct match: sale id (invoice = id), instant customer name/phone, notes
      try {
        const { data } = await supabase
          .from("sales")
          .select(SELECT)
          .or(
            `id.ilike.%${term}%,instant_customer_name.ilike.%${term}%,instant_customer_phone.ilike.%${term}%,notes.ilike.%${term}%`
          )
          .order("created_at", { ascending: false })
          .limit(25);
        (data || []).forEach((s: any) => collected.set(s.id, s));
      } catch {/* term may not be valid uuid pattern; ignore */}

      // 2) IMEI / product name / brand → find product ids → sale_items → sales
      const { data: prodMatches } = await supabase
        .from("products")
        .select("id")
        .or(`imei.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%,model.ilike.%${term}%`)
        .limit(50);
      if (prodMatches?.length) {
        const pids = prodMatches.map((p: any) => p.id);
        const { data: si } = await supabase.from("sale_items").select("sale_id").in("product_id", pids);
        const saleIds = Array.from(new Set((si || []).map((s: any) => s.sale_id)));
        if (saleIds.length) {
          const { data: byImei } = await supabase
            .from("sales")
            .select(SELECT)
            .in("id", saleIds)
            .order("created_at", { ascending: false })
            .limit(25);
          (byImei || []).forEach((s: any) => collected.set(s.id, s));
        }
      }

      // 3) Customer name / phone
      const { data: custMatches } = await supabase
        .from("customers")
        .select("id")
        .or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`)
        .limit(50);
      if (custMatches?.length) {
        const cids = custMatches.map((c: any) => c.id);
        const { data: byCust } = await supabase
          .from("sales")
          .select(SELECT)
          .in("customer_id", cids)
          .order("created_at", { ascending: false })
          .limit(25);
        (byCust || []).forEach((s: any) => collected.set(s.id, s));
      }

      const results = Array.from(collected.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      if (results.length === 0) {
        setSearchResults([]);
        toast.error("কোনো বিক্রয় পাওয়া যায়নি");
        return;
      }

      if (results.length === 1) {
        setSelectedSale(results[0]);
        setSearchResults([]);
        setIsAddDialogOpen(true);
      } else {
        setSearchResults(results);
        setIsAddDialogOpen(true);
      }
    } catch (e: any) {
      toast.error(e.message || "বিক্রয় খুঁজতে সমস্যা হয়েছে");
    } finally {
      setSearching(false);
    }
  };

  // Live debounced search — fires as user types (no Enter required)
  useEffect(() => {
    const term = searchSaleId.trim();
    if (!isAddDialogOpen || selectedSale || term.length < 2) return;
    const t = setTimeout(() => { searchSale(); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchSaleId, isAddDialogOpen, selectedSale]);

  // Create return mutation
  const createReturnMutation = useMutation({
    mutationFn: async (returnData: any) => {
      const { data, error } = await supabase.from("returns").insert([returnData]).select().single();
      if (error) throw error;
      await logReturnAudit({
        return_type: "sales",
        return_id: data.id,
        action: "created",
        product_id: returnData.product_id,
        quantity: returnData.quantity,
        amount_delta: Number(returnData.refund_amount || 0),
        new_status: returnData.status,
        notes: { reason: returnData.reason_code, sale_id: returnData.sale_id },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      toast.success("রিটার্ন সফলভাবে তৈরি হয়েছে!");
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "রিটার্ন তৈরি করতে ব্যর্থ");
    },
  });

  // Process return mutation (update inventory + settlement)
  const processReturnMutation = useMutation({
    mutationFn: async ({ returnId, status, plan }: { returnId: string; status: string; plan?: SettlementPlan }) => {
      const { data: returnData, error: fetchError } = await supabase
        .from("returns")
        .select("*, products(stock_quantity), sales(id, due_amount, paid_amount, customer_id)")
        .eq("id", returnId)
        .single();
      if (fetchError) throw fetchError;

      const prevStatus = returnData.status;
      const sale = returnData.sales;

      // Build update payload
      const updatePayload: any = { status, updated_at: new Date().toISOString() };
      if (status === "completed" && plan) {
        updatePayload.refund_mode = plan.mode;
        updatePayload.due_adjusted = plan.due_adjusted;
        updatePayload.cash_refunded = plan.cash_refunded;
        updatePayload.customer_credit = plan.customer_credit;
      }
      const { error: updateError } = await supabase.from("returns").update(updatePayload).eq("id", returnId);
      if (updateError) throw updateError;

      let stockDelta = 0;
      if (status === "completed") {
        // 1) Stock restore
        const newStock = (returnData.products?.stock_quantity || 0) + returnData.quantity;
        const { error: inventoryError } = await supabase
          .from("products").update({ stock_quantity: newStock, last_stock_reason: "return", last_stock_ref: String(returnData.id ?? "") } as any).eq("id", returnData.product_id);
        if (inventoryError) throw inventoryError;
        stockDelta = returnData.quantity;

        // 2) Adjust original sale due
        if (plan && plan.due_adjusted > 0 && sale?.id) {
          const newDue = Math.max(0, Number(sale.due_amount || 0) - plan.due_adjusted);
          const newPaid = Number(sale.paid_amount || 0) + plan.due_adjusted; // counted as settled via refund
          await supabase.from("sales").update({
            due_amount: newDue,
            paid_amount: newPaid,
            updated_at: new Date().toISOString(),
          }).eq("id", sale.id);

          // Record as a due payment for traceability
          await supabase.from("due_payments").insert({
            sale_id: sale.id,
            amount: plan.due_adjusted,
            payment_method: "return_adjustment",
            notes: `রিটার্ন #${returnId.slice(0,8)} থেকে বাকি সমন্বয়`,
          });
        }

        // 3) Store credit → customer ledger
        if (plan && plan.customer_credit > 0 && sale?.customer_id) {
          await supabase.from("customer_ledger_entries").insert({
            customer_id: sale.customer_id,
            amount: plan.customer_credit,
            entry_type: "credit",
            description: plan.mode === "exchange"
              ? `বিনিময় ক্রেডিট — রিটার্ন #${returnId.slice(0,8)}`
              : `স্টোর ক্রেডিট — রিটার্ন #${returnId.slice(0,8)}`,
          });
        }
      }

      await logReturnAudit({
        return_type: "sales",
        return_id: returnId,
        action: status === "completed" ? "completed" : status === "rejected" ? "rejected" : "updated",
        product_id: returnData.product_id,
        quantity: returnData.quantity,
        stock_delta: stockDelta,
        amount_delta: Number(returnData.refund_amount || 0),
        previous_status: prevStatus,
        new_status: status,
        notes: plan ? { plan } : undefined,
      });

      return { plan, mode: plan?.mode };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer_ledger_entries"] });
      queryClient.invalidateQueries({ queryKey: ["return-audit"] });
      if (res?.mode === "exchange") {
        toast.success("রিটার্ন সম্পন্ন — POS এ গিয়ে গ্রাহকের জন্য নতুন পণ্য যোগ করুন (ক্রেডিট ব্যবহার করুন)");
      } else if (res?.mode === "due_adjust" || res?.mode === "mixed") {
        toast.success("রিটার্ন সম্পন্ন — বাকি সমন্বয় হয়েছে");
      } else if (res?.mode === "credit") {
        toast.success("রিটার্ন সম্পন্ন — গ্রাহকের ক্রেডিটে যোগ হয়েছে");
      } else {
        toast.success("রিটার্ন প্রসেস সফল হয়েছে!");
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "রিটার্ন প্রসেস করতে ব্যর্থ");
    },
  });
  const deleteReturnMutation = useMutation({
    mutationFn: async (returnItem: any) => {
      let stockDelta = 0;
      if (returnItem.status === "completed") {
        const { data: prod } = await supabase.from("products").select("stock_quantity").eq("id", returnItem.product_id).single();
        if (prod) {
          await supabase.from("products").update({ stock_quantity: Math.max(0, prod.stock_quantity - returnItem.quantity) }).eq("id", returnItem.product_id);
          stockDelta = -returnItem.quantity;
        }
      }
      const { error } = await supabase.from("returns").delete().eq("id", returnItem.id);
      if (error) throw error;
      await logReturnAudit({
        return_type: "sales",
        return_id: returnItem.id,
        action: "deleted",
        product_id: returnItem.product_id,
        quantity: returnItem.quantity,
        stock_delta: stockDelta,
        amount_delta: -Number(returnItem.refund_amount || 0),
        previous_status: returnItem.status,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["return-audit"] });
      toast.success("রিটার্ন মুছে ফেলা হয়েছে");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmitReturn = () => {
    if (!selectedItem) {
      toast.error("রিটার্নের জন্য একটি আইটেম নির্বাচন করুন");
      return;
    }

    if (returnQuantity < 1 || returnQuantity > selectedItem.quantity) {
      toast.error(`রিটার্ন পরিমাণ ১ থেকে ${selectedItem.quantity} এর মধ্যে হতে হবে`);
      return;
    }

    const refundAmount = (selectedItem.unit_price * returnQuantity);

    createReturnMutation.mutate({
      sale_id: selectedSale.id,
      sale_item_id: selectedItem.id,
      product_id: selectedItem.product_id,
      quantity: returnQuantity,
      refund_amount: refundAmount,
      reason_code: reasonCode,
      reason_notes: reasonNotes || null,
      status: "pending",
    });
  };

  const resetForm = () => {
    setSearchSaleId("");
    setSelectedSale(null);
    setSelectedItem(null);
    setReturnQuantity(1);
    setReasonCode("defective");
    setReasonNotes("");
    setSearchResults([]);
    setIsAddDialogOpen(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 gap-1">
            <Clock className="h-3 w-3" />
            অপেক্ষমাণ
          </Badge>
        );
      case "approved":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 gap-1">
            <CheckCircle className="h-3 w-3" />
            অনুমোদিত
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 gap-1">
            <CheckCircle className="h-3 w-3" />
            সম্পন্ন
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 gap-1">
            <XCircle className="h-3 w-3" />
            প্রত্যাখ্যাত
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getReasonLabel = (code: string) => {
    const reasons: Record<string, string> = {
      defective: "ত্রুটিপূর্ণ পণ্য",
      wrong_item: "ভুল পণ্য",
      customer_request: "ক্রেতার অনুরোধ",
      damaged: "ক্ষতিগ্রস্ত",
      not_as_described: "বিবরণ অনুযায়ী নয়",
      other: "অন্যান্য",
    };
    return reasons[code] || code;
  };

  const filteredReturns = useMemo(() => returns?.filter(ret => {
    if (filterStatus !== "all" && ret.status !== filterStatus) return false;
    if (textFilter) {
      const t = textFilter.toLowerCase();
      const inProduct = ret.products?.name?.toLowerCase().includes(t) || ret.products?.imei?.toLowerCase().includes(t) || ret.products?.brand?.toLowerCase().includes(t);
      const inCustomer = ret.sales?.customers?.name?.toLowerCase().includes(t) || ret.sales?.customers?.phone?.includes(t);
      const inId = ret.id.toLowerCase().includes(t) || ret.sale_id.toLowerCase().includes(t);
      if (!inProduct && !inCustomer && !inId) return false;
    }
    if (dateFrom && new Date(ret.created_at) < new Date(dateFrom)) return false;
    if (dateTo && new Date(ret.created_at) > new Date(dateTo + "T23:59:59")) return false;
    return true;
  }) || [], [returns, filterStatus, textFilter, dateFrom, dateTo]);

  // Stats
  const pendingCount = returns?.filter(r => r.status === "pending").length || 0;
  const completedCount = returns?.filter(r => r.status === "completed").length || 0;
  const totalRefund = returns?.filter(r => r.status === "completed").reduce((sum, r) => sum + Number(r.refund_amount), 0) || 0;

  const exportExcel = () => {
    if (filteredReturns.length === 0) { toast.error("কোনো ডেটা নেই"); return; }
    const rows = filteredReturns.map((r, i) => ({
      'ক্রমিক': i + 1,
      'রিটার্ন ID': r.id.slice(0, 8),
      'বিক্রয় ID': r.sale_id.slice(0, 8),
      'প্রোডাক্ট': r.products?.name || '',
      'IMEI': r.products?.imei || '',
      'ক্রেতা': r.sales?.customers?.name || 'সাধারণ',
      'পরিমাণ': r.quantity,
      'রিফান্ড (৳)': Number(r.refund_amount),
      'কারণ': getReasonLabel(r.reason_code),
      'স্ট্যাটাস': r.status,
      'তারিখ': new Date(r.created_at).toLocaleDateString('bn-BD'),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Returns');
    XLSX.writeFile(wb, `MobileMatePro_Returns_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Excel ডাউনলোড হয়েছে");
  };

  const exportPDF = () => {
    if (filteredReturns.length === 0) { toast.error("কোনো ডেটা নেই"); return; }
    const w = window.open('', '_blank');
    if (!w) { toast.error("পপআপ ব্লক"); return; }
    const totalAmt = filteredReturns.reduce((s, r) => s + Number(r.refund_amount), 0);
    w.document.write(`<html><head><title>MOBILE MATE PRO - Returns Report</title><style>
      body{font-family:Arial;padding:20px;font-size:12px}
      h1{text-align:center;color:#0066cc}.summary{background:#f5f5f5;padding:10px;margin:15px 0;border-radius:6px}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th,td{border:1px solid #ddd;padding:6px;text-align:left}
      th{background:#0066cc;color:white}
      tr:nth-child(even){background:#f9f9f9}
    </style></head><body>
      <h1>MOBILE MATE PRO - রিটার্ন রিপোর্ট</h1>
      <div class="summary"><b>মোট রিটার্ন:</b> ${filteredReturns.length} | <b>মোট রিফান্ড:</b> ৳${totalAmt.toLocaleString('bn-BD')} | <b>তারিখ:</b> ${new Date().toLocaleDateString('bn-BD')}</div>
      <table><thead><tr><th>#</th><th>প্রোডাক্ট</th><th>IMEI</th><th>ক্রেতা</th><th>পরিমাণ</th><th>রিফান্ড</th><th>কারণ</th><th>স্ট্যাটাস</th><th>তারিখ</th></tr></thead><tbody>
      ${filteredReturns.map((r, i) => `<tr><td>${i+1}</td><td>${r.products?.name || ''}</td><td>${r.products?.imei || '-'}</td><td>${r.sales?.customers?.name || 'সাধারণ'}</td><td>${r.quantity}</td><td>৳${Number(r.refund_amount).toLocaleString('bn-BD')}</td><td>${getReasonLabel(r.reason_code)}</td><td>${r.status}</td><td>${new Date(r.created_at).toLocaleDateString('bn-BD')}</td></tr>`).join('')}
      </tbody></table></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => { w.print(); }, 300);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">রিটার্ন ডাটা লোড হচ্ছে...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen animate-fade-in">
      <PageHeader
        storageKey="returns"
        title={<span className="flex items-center gap-2"><RotateCcw className="h-6 w-6 text-primary" /> রিটার্ন ও রিফান্ড</span>}
        subtitle="পণ্য রিটার্ন ট্র্যাক করুন এবং রিফান্ড প্রসেস করুন"
        actions={
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-primary to-accent hover:opacity-90 gap-2">
                <RotateCcw className="h-4 w-4" />
                নতুন রিটার্ন
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl">রিটার্ন তৈরি করুন</DialogTitle>
              </DialogHeader>
              
              {!selectedSale ? (
                <div className="space-y-4 py-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      বিক্রয় খুঁজুন (ইনভয়েস নং, IMEI, প্রোডাক্ট নাম, ব্র্যান্ড, ক্রেতার নাম/ফোন/ইমেইল)
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={searchSaleId}
                          onChange={(e) => setSearchSaleId(e.target.value)}
                          placeholder="যেমন: 8a3f, 35XXXXXXX, iPhone, Samsung, 01XXXXXXXXX..."
                          className="pl-9"
                          onKeyDown={(e) => e.key === "Enter" && searchSale()}
                        />
                      </div>
                      <Button onClick={searchSale} disabled={searching} className="gap-2">
                        <Search className="h-4 w-4" />
                        {searching ? "খুঁজছি..." : "খুঁজুন"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      💡 যেকোনো ইউনিক তথ্য দিয়ে খুঁজতে পারেন — ইনভয়েস ID, IMEI, প্রোডাক্ট নাম/মডেল, ক্রেতার নাম বা ফোন।
                    </p>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                      <p className="text-xs text-muted-foreground">{searchResults.length}টি ফলাফল — একটি নির্বাচন করুন:</p>
                      {searchResults.map((s) => {
                        const items = s.sale_items || [];
                        const imeis = items.map((it: any) => it.products?.imei).filter(Boolean).slice(0, 2).join(", ");
                        const productNames = items.map((it: any) => it.products?.name).filter(Boolean).slice(0, 2).join(", ");
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => { setSelectedSale(s); setSearchResults([]); }}
                            className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="font-mono text-sm font-semibold">#{s.id.slice(0, 8)}</span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(s.created_at), "dd MMM yyyy", { locale: dateLocale })}
                              </span>
                            </div>
                            <p className="text-sm mt-1">
                              {s.customers?.name || s.instant_customer_name || "সাধারণ ক্রেতা"}
                              {s.customers?.phone || s.instant_customer_phone ? ` • ${s.customers?.phone || s.instant_customer_phone}` : ""}
                            </p>
                            {productNames && (
                              <p className="text-xs text-muted-foreground mt-1">📦 {productNames}{items.length > 2 ? ` +${items.length - 2}` : ""}</p>
                            )}
                            {imeis && <p className="text-xs text-muted-foreground font-mono">IMEI: {imeis}</p>}
                            <p className="text-sm font-semibold text-primary mt-1">৳{Number(s.total_amount).toLocaleString("bn-BD")}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4 py-4">
                  <Card className="p-4 bg-muted/50 border-primary/20">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      বিক্রয় তথ্য
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">বিক্রয় আইডি</p>
                        <p className="font-mono font-medium">{selectedSale.id.slice(0, 8)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">তারিখ</p>
                        <p className="font-medium">{format(new Date(selectedSale.created_at), "dd MMM yyyy", { locale: dateLocale })}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">ক্রেতা</p>
                        <p className="font-medium">{selectedSale.customers?.name || "সাধারণ ক্রেতা"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">মোট</p>
                        <p className="font-medium text-primary">৳{selectedSale.total_amount?.toLocaleString('bn-BD')}</p>
                      </div>
                    </div>
                  </Card>

                  <div>
                    <label className="block text-sm font-medium mb-2">রিটার্নের জন্য আইটেম নির্বাচন করুন</label>
                    <Select value={selectedItem?.id} onValueChange={(value) => {
                      const item = selectedSale.sale_items.find((i: any) => i.id === value);
                      setSelectedItem(item);
                      setReturnQuantity(1);
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="একটি আইটেম নির্বাচন করুন" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedSale.sale_items?.map((item: any) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.products?.name} - পরিমাণ: {item.quantity} - ৳{item.unit_price?.toLocaleString('bn-BD')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedItem && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2">রিটার্ন পরিমাণ</label>
                        <Input
                          type="number"
                          min="1"
                          max={selectedItem.quantity}
                          value={returnQuantity}
                          onChange={(e) => setReturnQuantity(parseInt(e.target.value) || 1)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          সর্বোচ্চ: {selectedItem.quantity}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">রিটার্নের কারণ</label>
                        <Select value={reasonCode} onValueChange={setReasonCode}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="defective">ত্রুটিপূর্ণ পণ্য</SelectItem>
                            <SelectItem value="wrong_item">ভুল পণ্য</SelectItem>
                            <SelectItem value="customer_request">ক্রেতার অনুরোধ</SelectItem>
                            <SelectItem value="damaged">ট্রানজিটে ক্ষতিগ্রস্ত</SelectItem>
                            <SelectItem value="not_as_described">বিবরণ অনুযায়ী নয়</SelectItem>
                            <SelectItem value="other">অন্যান্য</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">অতিরিক্ত মন্তব্য</label>
                        <Textarea
                          value={reasonNotes}
                          onChange={(e) => setReasonNotes(e.target.value)}
                          placeholder="অতিরিক্ত তথ্য লিখুন..."
                          rows={3}
                        />
                      </div>

                      <Card className="p-4 bg-primary/5 border-primary/20">
                        <p className="text-sm font-medium text-muted-foreground">রিফান্ড পরিমাণ</p>
                        <p className="text-3xl font-bold text-primary">
                          ৳{(selectedItem.unit_price * returnQuantity).toLocaleString('bn-BD')}
                        </p>
                      </Card>
                    </>
                  )}

                  <div className="flex gap-2 justify-end pt-4 border-t">
                    <Button variant="outline" onClick={resetForm}>
                      বাতিল
                    </Button>
                    <Button 
                      onClick={handleSubmitReturn}
                      disabled={!selectedItem || createReturnMutation.isPending}
                      className="gap-2"
                    >
                      {createReturnMutation.isPending ? "তৈরি হচ্ছে..." : (
                        <>
                          <RotateCcw className="h-4 w-4" />
                          রিটার্ন তৈরি করুন
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        }
      />
      <div className="space-y-4 pt-3">

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <Card className="p-4 card-hover">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">অপেক্ষমাণ রিটার্ন</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </Card>
          <Card className="p-4 card-hover">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">সম্পন্ন রিটার্ন</p>
                <p className="text-2xl font-bold text-green-600">{completedCount}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </Card>
          <Card className="p-4 card-hover">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">মোট রিফান্ড</p>
                <p className="text-2xl font-bold text-primary">৳{totalRefund.toLocaleString('bn-BD')}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <RotateCcw className="h-5 w-5 text-primary" />
              </div>
            </div>
          </Card>
        </div>

        {/* Filter & Export */}
        <Card className="p-4">
          <CollapsibleSection storageKey="returns-filters" title={<h3 className="text-sm font-bold">🔍 ফিল্টার ও এক্সপোর্ট</h3>}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="প্রোডাক্ট, IMEI, ক্রেতা, ID দিয়ে খুঁজুন" value={textFilter} onChange={e => setTextFilter(e.target.value)} />
            </div>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="শুরু" />
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="শেষ" />
          </div>
          <div className="flex flex-wrap gap-2 items-center mt-3">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">সকল স্ট্যাটাস</SelectItem>
                <SelectItem value="pending">অপেক্ষমাণ</SelectItem>
                <SelectItem value="approved">অনুমোদিত</SelectItem>
                <SelectItem value="completed">সম্পন্ন</SelectItem>
                <SelectItem value="rejected">প্রত্যাখ্যাত</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => { setTextFilter(""); setDateFrom(""); setDateTo(""); setFilterStatus("all"); }}>রিসেট</Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={exportExcel} className="border-green-500 text-green-600">
              <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF} className="border-red-500 text-red-600">
              <FileText className="w-4 h-4 mr-1" /> PDF
            </Button>
          </div>
          </CollapsibleSection>
          <p className="text-xs text-muted-foreground mt-2">দেখানো হচ্ছে: {filteredReturns.length}টি</p>
        </Card>
      </div>

      {/* Tabbed Content */}
      <div className="flex-1 overflow-y-auto pb-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-3">
            <TabsTrigger value="sales" className="gap-1"><RotateCcw className="h-4 w-4" /> বিক্রয় রিটার্ন</TabsTrigger>
            <TabsTrigger value="supplier" className="gap-1"><Truck className="h-4 w-4" /> সাপ্লায়ার রিটার্ন</TabsTrigger>
            <TabsTrigger value="recon" className="gap-1"><FileText className="h-4 w-4" /> রিকনসিলিয়েশন</TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="space-y-4">
            {filteredReturns.length > 0 ? (
              <div className="grid gap-4">
                {filteredReturns.map((returnItem) => (
                  <Card key={returnItem.id} className="p-5 card-hover">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Package className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{returnItem.products?.name}</h3>
                          <p className="text-sm text-muted-foreground font-mono">রিটার্ন #{returnItem.id.slice(0, 8)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(returnItem.status)}
                        <Button size="sm" variant="ghost" onClick={() => { setAuditTarget({ type: "sales", id: returnItem.id }); setAuditOpen(true); }}>
                          <History className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4 p-3 bg-muted/30 rounded-lg">
                      <div>
                        <p className="text-muted-foreground flex items-center gap-1"><Package className="h-3 w-3" /> বিক্রয় আইডি</p>
                        <p className="font-medium font-mono">{returnItem.sale_id.slice(0, 8)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">পরিমাণ</p>
                        <p className="font-medium">{returnItem.quantity}টি</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">রিফান্ড</p>
                        <p className="font-medium text-primary">৳{returnItem.refund_amount?.toLocaleString('bn-BD')}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> তারিখ</p>
                        <p className="font-medium">{format(new Date(returnItem.created_at), "dd MMM yyyy", { locale: dateLocale })}</p>
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className="text-sm text-muted-foreground mb-1">কারণ</p>
                      <p className="font-medium">{getReasonLabel(returnItem.reason_code)}</p>
                      {returnItem.reason_notes && (
                        <p className="text-sm text-muted-foreground mt-1 italic">"{returnItem.reason_notes}"</p>
                      )}
                    </div>

                    {returnItem.status === "pending" && (
                      <div className="flex gap-2 pt-3 border-t">
                        <Button size="sm" onClick={() => { setPendingApprove(returnItem); setSettlementOpen(true); }} className="gap-1">
                          <CheckCircle className="h-4 w-4" /> অনুমোদন ও সম্পন্ন
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => processReturnMutation.mutate({ returnId: returnItem.id, status: "rejected" })} disabled={processReturnMutation.isPending} className="gap-1">
                          <XCircle className="h-4 w-4" /> প্রত্যাখ্যান
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { if (confirm("এই রিটার্নটি মুছে ফেলবেন?")) deleteReturnMutation.mutate(returnItem); }} className="gap-1 ml-auto">
                          <Trash2 className="h-4 w-4" /> মুছুন
                        </Button>
                      </div>
                    )}
                    {returnItem.status !== "pending" && (
                      <div className="flex justify-end pt-2">
                        <Button size="sm" variant="ghost" className="text-destructive"
                          onClick={() => { if (confirm("এই রিটার্নটি মুছে ফেলবেন? (কম্প্লিটেড হলে স্টক সমন্বয় হবে)")) deleteReturnMutation.mutate(returnItem); }}>
                          <Trash2 className="h-4 w-4 mr-1" /> মুছুন
                        </Button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <div className="text-6xl mb-4">📦</div>
                <h3 className="text-xl font-semibold mb-2 text-foreground">কোনো রিটার্ন নেই</h3>
                <p className="text-muted-foreground">রিটার্ন তৈরি করলে এখানে দেখাবে</p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="supplier" className="space-y-3">
            {(supplierReturns || []).length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">কোনো সাপ্লায়ার রিটার্ন নেই</Card>
            ) : (
              (supplierReturns || []).map((sr: any) => (
                <Card key={sr.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-primary" />
                        <span className="font-semibold">{sr.products?.name || sr.product_id?.slice(0, 8)}</span>
                        <Badge variant="secondary">{sr.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        সাপ্লায়ার: {sr.supplier_name || "—"} • IMEI: {sr.products?.imei || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">কারণ: {sr.reason} • পরিমাণ: {sr.quantity} • রিকভারি: ৳{Number(sr.return_amount || 0).toLocaleString("bn-BD")}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{format(new Date(sr.created_at), "dd MMM yyyy", { locale: dateLocale })}</p>
                      <Button size="sm" variant="ghost" onClick={() => { setAuditTarget({ type: "supplier", id: sr.id }); setAuditOpen(true); }}>
                        <History className="h-4 w-4 mr-1" /> অডিট
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
            <p className="text-xs text-muted-foreground">📌 সাপ্লায়ার রিটার্ন তৈরি/সম্পাদনার জন্য <strong>সাপ্লায়ার</strong> পেজে যান।</p>
          </TabsContent>

          <TabsContent value="recon">
            <ReconciliationReport />
          </TabsContent>
        </Tabs>
      </div>

      <RefundSettlementDialog
        open={settlementOpen}
        onOpenChange={setSettlementOpen}
        refundAmount={Number(pendingApprove?.refund_amount || 0)}
        saleDueAmount={Number(pendingApprove?.sales?.due_amount || 0)}
        customerId={pendingApprove?.sales?.customer_id || null}
        customerName={pendingApprove?.sales?.customers?.name || null}
        productName={pendingApprove?.products?.name || ""}
        quantity={pendingApprove?.quantity || 0}
        loading={processReturnMutation.isPending}
        onConfirm={(plan) => {
          if (!pendingApprove) return;
          processReturnMutation.mutate(
            { returnId: pendingApprove.id, status: "completed", plan },
            { onSuccess: () => { setSettlementOpen(false); setPendingApprove(null); } }
          );
        }}
      />

      <ReturnAuditLog
        open={auditOpen}
        onOpenChange={setAuditOpen}
        returnType={auditTarget?.type || "sales"}
        returnId={auditTarget?.id || null}
      />
    </div>
  );
}
