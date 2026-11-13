import { fetchAll } from "@/lib/fetchAll";
import { useState, useMemo } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { PageHeader } from "./PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Building2, RotateCcw, Search, Phone, MapPin, FileText, MessageSquare, Mail, Share2 } from "lucide-react";
import { SwipeableRow, swipeIntents } from "./SwipeableRow";
import { format } from "date-fns";
import { bn, enUS } from "date-fns/locale";
import { useLanguage } from "@/components/LanguageProvider";
import { PhotoUpload } from "./PhotoUpload";
import { PhotoZoom } from "./PhotoZoom";
import { logReturnAudit } from "@/lib/returnsAudit";
import { deleteFromCloudinary } from "@/lib/cloudinary";
import { offlineMutate } from "@/lib/offlineMutate";

export function Suppliers() {
  const { language } = useLanguage();
  const dateLocale = language === "bn" ? bn : enUS;
  const qc = useQueryClient();
  const [supplierDialog, setSupplierDialog] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [returnDialog, setReturnDialog] = useState(false);
  const [editingReturn, setEditingReturn] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [returnSupplierFilter, setReturnSupplierFilter] = useState("all");

  const [supplierForm, setSupplierForm] = useState({ name: "", email: "", phone: "", address: "", notes: "", photo_url: "" });
  const [returnForm, setReturnForm] = useState<{
    supplier_id: string;
    product_id: string;
    quantity: number;
    return_amount: string;
    reason: string;
    notes: string;
  }>({ supplier_id: "", product_id: "", quantity: 1, return_amount: "", reason: "defective", notes: "" });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products-all"],
    queryFn: async () => {
      return (await fetchAll<any>("products", "*, categories(name)", (q) => q.order("name"))) as any[];
    },
  });

  const { data: supplierReturns } = useQuery({
    queryKey: ["supplier_returns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("supplier_returns").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const resetSupplierForm = () => setSupplierForm({ name: "", email: "", phone: "", address: "", notes: "", photo_url: "" });
  const resetReturnForm = () => setReturnForm({ supplier_id: "", product_id: "", quantity: 1, return_amount: "", reason: "defective", notes: "" });

  const saveSupplier = useMutation({
    mutationFn: async () => {
      if (editingSupplier) {
        const { error, queued } = await offlineMutate("suppliers", "update", { values: supplierForm, match: { id: editingSupplier.id } });
        if (error) throw error;
        return { queued };
      } else {
        const { error, queued } = await offlineMutate("suppliers", "insert", [supplierForm]);
        if (error) throw error;
        return { queued };
      }
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(res?.queued ? "অফলাইন: পরিবর্তন সারিতে যোগ হয়েছে" : (editingSupplier ? "সাপ্লায়ার আপডেট হয়েছে" : "সাপ্লায়ার যোগ হয়েছে"));
      setSupplierDialog(false); setEditingSupplier(null); resetSupplierForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSupplier = useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await supabase.from("suppliers").select("photo_url").eq("id", id).maybeSingle();
      const { error, queued } = await offlineMutate("suppliers", "delete", { match: { id } });
      if (error) throw error;
      if ((row as any)?.photo_url && !queued) deleteFromCloudinary([(row as any).photo_url]);
      return { queued };
    },
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["suppliers"] }); toast.success(res?.queued ? "অফলাইন: মুছে ফেলা সারিতে যোগ হয়েছে" : "সাপ্লায়ার মুছে ফেলা হয়েছে"); },
    onError: (e: any) => toast.error(e.message),
  });

  // products available for return: belongs to chosen supplier (via supplier_id OR matching supplier_name) AND stock > 0
  const availableProductsForReturn = useMemo(() => {
    if (!products || !returnForm.supplier_id) return [];
    const sup = suppliers?.find(s => s.id === returnForm.supplier_id);
    return products.filter((p: any) =>
      p.stock_quantity > 0 &&
      (p.supplier_id === returnForm.supplier_id || (sup && p.supplier_name && p.supplier_name === sup.name))
    );
  }, [products, suppliers, returnForm.supplier_id]);

  const saveReturn = useMutation({
    mutationFn: async () => {
      const product = products?.find((p: any) => p.id === returnForm.product_id);
      if (!product) throw new Error("প্রোডাক্ট নির্বাচন করুন");
      const sup = suppliers?.find(s => s.id === returnForm.supplier_id);
      const { data: { user } } = await supabase.auth.getUser();

      if (editingReturn) {
        const { error } = await supabase.from("supplier_returns").update({
          quantity: returnForm.quantity,
          return_amount: Number(returnForm.return_amount) || product.cost * returnForm.quantity,
          reason: returnForm.reason,
          notes: returnForm.notes,
        }).eq("id", editingReturn.id);
        if (error) throw error;
        await logReturnAudit({
          return_type: "supplier",
          return_id: editingReturn.id,
          action: "updated",
          product_id: product.id,
          quantity: returnForm.quantity,
          amount_delta: Number(returnForm.return_amount) || product.cost * returnForm.quantity,
        });
      } else {
        if (product.stock_quantity < returnForm.quantity) throw new Error("পর্যাপ্ত স্টক নেই বা ইতিমধ্যে বিক্রি হয়েছে");
        const { data: inserted, error } = await supabase.from("supplier_returns").insert({
          product_id: product.id,
          supplier_id: returnForm.supplier_id,
          supplier_name: sup?.name || product.supplier_name,
          quantity: returnForm.quantity,
          return_amount: Number(returnForm.return_amount) || product.cost * returnForm.quantity,
          reason: returnForm.reason,
          notes: returnForm.notes,
          status: "completed",
          created_by: user?.id,
        }).select().single();
        if (error) throw error;
        await supabase.from("products").update({
          stock_quantity: Math.max(0, product.stock_quantity - returnForm.quantity)
        }).eq("id", product.id);
        await logReturnAudit({
          return_type: "supplier",
          return_id: inserted.id,
          action: "completed",
          product_id: product.id,
          quantity: returnForm.quantity,
          stock_delta: -returnForm.quantity,
          amount_delta: Number(returnForm.return_amount) || product.cost * returnForm.quantity,
          new_status: "completed",
          notes: { reason: returnForm.reason, supplier_id: returnForm.supplier_id },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier_returns"] });
      qc.invalidateQueries({ queryKey: ["products-all"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(editingReturn ? "সাপ্লায়ার রিটার্ন আপডেট" : "সাপ্লায়ার রিটার্ন সফল");
      setReturnDialog(false); setEditingReturn(null); resetReturnForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteReturn = useMutation({
    mutationFn: async (ret: any) => {
      // restore stock
      const product = products?.find((p: any) => p.id === ret.product_id);
      let stockDelta = 0;
      if (product) {
        await supabase.from("products").update({
          stock_quantity: product.stock_quantity + ret.quantity
        }).eq("id", product.id);
        stockDelta = ret.quantity;
      }
      const { error } = await supabase.from("supplier_returns").delete().eq("id", ret.id);
      if (error) throw error;
      await logReturnAudit({
        return_type: "supplier",
        return_id: ret.id,
        action: "deleted",
        product_id: ret.product_id,
        quantity: ret.quantity,
        stock_delta: stockDelta,
        amount_delta: -Number(ret.return_amount || 0),
        previous_status: ret.status,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier_returns"] });
      qc.invalidateQueries({ queryKey: ["products-all"] });
      toast.success("রিটার্ন মুছে ফেলা হয়েছে এবং স্টক ফিরিয়ে আনা হয়েছে");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEditSupplier = (s: any) => {
    setEditingSupplier(s);
    setSupplierForm({ name: s.name || "", email: s.email || "", phone: s.phone || "", address: s.address || "", notes: s.notes || "", photo_url: s.photo_url || "" });
    setSupplierDialog(true);
  };

  const startEditReturn = (r: any) => {
    setEditingReturn(r);
    setReturnForm({
      supplier_id: r.supplier_id || "",
      product_id: r.product_id,
      quantity: r.quantity,
      return_amount: String(r.return_amount),
      reason: r.reason,
      notes: r.notes || "",
    });
    setReturnDialog(true);
  };

  const filteredSuppliers = useMemo(() => suppliers?.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.phone?.includes(search) || s.email?.toLowerCase().includes(search.toLowerCase())
  ) || [], [suppliers, search]);

  const filteredReturns = useMemo(() => supplierReturns?.filter(r =>
    returnSupplierFilter === "all" || r.supplier_id === returnSupplierFilter
  ) || [], [supplierReturns, returnSupplierFilter]);

  const totalReturnAmount = filteredReturns.reduce((s, r) => s + Number(r.return_amount), 0);

  const productNameById = (id: string) => products?.find((p: any) => p.id === id)?.name || "—";
  const productImeiById = (id: string) => products?.find((p: any) => p.id === id)?.imei || "";

  return (
    <div className="space-y-4 sm:space-y-4 animate-fade-in">
      <PageHeader
        storageKey="suppliers"
        title={<span className="flex items-center gap-2"><Building2 className="w-6 h-6 text-primary" /> সাপ্লায়ার ম্যানেজমেন্ট</span>}
        subtitle="সাপ্লায়ার ও সাপ্লায়ার রিটার্ণ ব্যবস্থাপনা"
      />

      <Tabs defaultValue="suppliers">
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="suppliers">সাপ্লায়ার ({suppliers?.length || 0})</TabsTrigger>
          <TabsTrigger value="returns">সাপ্লায়ার রিটার্ণ ({supplierReturns?.length || 0})</TabsTrigger>
        </TabsList>

        {/* Suppliers tab */}
        <TabsContent value="suppliers" className="space-y-4">
          <CollapsibleSection storageKey="suppliers-filters" title={<h3 className="text-sm font-bold">🔍 সার্চ</h3>}>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="নাম, ফোন বা ইমেইল দিয়ে খুঁজুন" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Dialog open={supplierDialog} onOpenChange={(o) => { if (!o) { setEditingSupplier(null); resetSupplierForm(); } setSupplierDialog(o); }}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-primary to-accent">
                  <Plus className="w-4 h-4 mr-1" /> নতুন সাপ্লায়ার
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingSupplier ? "সাপ্লায়ার এডিট" : "নতুন সাপ্লায়ার"}</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); saveSupplier.mutate(); }} className="space-y-3">
                  <Input required placeholder="নাম *" value={supplierForm.name} onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })} />
                  <Input placeholder="ফোন" value={supplierForm.phone} onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })} />
                  <Input type="email" placeholder="ইমেইল" value={supplierForm.email} onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })} />
                  <Input placeholder="ঠিকানা" value={supplierForm.address} onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })} />
                  <Textarea placeholder="নোটস" value={supplierForm.notes} onChange={e => setSupplierForm({ ...supplierForm, notes: e.target.value })} />
                  <PhotoUpload
                    value={supplierForm.photo_url}
                    onChange={(url) => setSupplierForm((prev) => ({ ...prev, photo_url: url || "" }))}
                    label="ছবি (পাসপোর্ট সাইজ)"
                  />
                  <Button type="submit" className="w-full">{editingSupplier ? "আপডেট" : "যোগ করুন"}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          </CollapsibleSection>

          {filteredSuppliers.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">কোনো সাপ্লায়ার নেই</Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSuppliers.map(s => {
                const supplied = products?.filter((p: any) => p.supplier_id === s.id || p.supplier_name === s.name).length || 0;
                const returnsCount = supplierReturns?.filter(r => r.supplier_id === s.id).length || 0;
                return (
                  <SwipeableRow
                    key={s.id}
                    className="rounded-2xl shadow-sm"
                    leftActions={[
                      { label: "কল", icon: Phone, color: "bg-green-600", onAction: () => s.phone ? swipeIntents.call(s.phone) : toast.error("ফোন নেই") },
                      { label: "SMS", icon: MessageSquare, color: "bg-sky-600", onAction: () => s.phone ? swipeIntents.sms(s.phone) : toast.error("ফোন নেই") },
                      { label: "ইমেইল", icon: Mail, color: "bg-indigo-600", onAction: () => s.email ? swipeIntents.email(s.email) : toast.error("ইমেইল নেই") },
                    ]}
                    rightActions={[
                      { label: "এডিট", icon: Pencil, color: "bg-amber-600", onAction: () => startEditSupplier(s) },
                      { label: "শেয়ার", icon: Share2, color: "bg-slate-600", onAction: () => swipeIntents.share({ title: s.name, text: `${s.name}${s.phone ? `\n📞 ${s.phone}` : ""}${s.email ? `\n📧 ${s.email}` : ""}${s.address ? `\n📍 ${s.address}` : ""}` }) },
                      { label: "মুছুন", icon: Trash2, color: "bg-destructive", onAction: () => { if (confirm("মুছে ফেলবেন?")) deleteSupplier.mutate(s.id); } },
                    ]}
                  >
                    <Card className="p-5 card-hover rounded-2xl">
                      <div className="flex justify-between items-start mb-3 gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-lg">{s.name}</h3>
                          {s.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</p>}
                          {s.address && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{s.address}</p>}
                        </div>
                        <PhotoZoom url={s.photo_url} alt={s.name} size="sm" fallbackInitials={s.name} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="p-2 rounded bg-muted text-center">
                          <p className="text-[10px] text-muted-foreground">সরবরাহকৃত</p>
                          <p className="text-sm font-bold">{supplied}</p>
                        </div>
                        <div className="p-2 rounded bg-muted text-center">
                          <p className="text-[10px] text-muted-foreground">রিটার্ণ</p>
                          <p className="text-sm font-bold text-destructive">{returnsCount}</p>
                        </div>
                      </div>
                      {s.notes && <p className="text-xs italic text-muted-foreground mb-2">"{s.notes}"</p>}
                      <p className="text-[11px] text-muted-foreground/70">💡 swipe → কল/SMS/ইমেইল • ← এডিট/শেয়ার/মুছুন</p>
                    </Card>
                  </SwipeableRow>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Supplier Returns tab */}
        <TabsContent value="returns" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">মোট রিটার্ণ</p>
              <p className="text-2xl font-bold text-destructive">{filteredReturns.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">মোট রিটার্ণ মূল্য</p>
              <p className="text-2xl font-bold text-primary">৳{totalReturnAmount.toLocaleString('bn-BD')}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">ফিল্টার</p>
              <Select value={returnSupplierFilter} onValueChange={setReturnSupplierFilter}>
                <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">সকল সাপ্লায়ার</SelectItem>
                  {suppliers?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Card>
          </div>

          <div className="flex justify-end">
            <Dialog open={returnDialog} onOpenChange={(o) => { if (!o) { setEditingReturn(null); resetReturnForm(); } setReturnDialog(o); }}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-destructive to-orange-500">
                  <RotateCcw className="w-4 h-4 mr-1" /> নতুন সাপ্লায়ার রিটার্ণ
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editingReturn ? "রিটার্ণ এডিট" : "সাপ্লায়ারে পণ্য রিটার্ণ"}</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); saveReturn.mutate(); }} className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">সাপ্লায়ার *</label>
                    <Select value={returnForm.supplier_id} onValueChange={v => setReturnForm({ ...returnForm, supplier_id: v, product_id: "" })} disabled={!!editingReturn}>
                      <SelectTrigger><SelectValue placeholder="সাপ্লায়ার নির্বাচন করুন" /></SelectTrigger>
                      <SelectContent>
                        {suppliers?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">প্রোডাক্ট * (শুধুমাত্র অবিক্রিত)</label>
                    <Select value={returnForm.product_id} onValueChange={v => {
                      const p = products?.find((x: any) => x.id === v);
                      setReturnForm({ ...returnForm, product_id: v, return_amount: p ? String(p.cost) : "" });
                    }} disabled={!!editingReturn}>
                      <SelectTrigger><SelectValue placeholder={returnForm.supplier_id ? "প্রোডাক্ট নির্বাচন করুন" : "প্রথমে সাপ্লায়ার নির্বাচন করুন"} /></SelectTrigger>
                      <SelectContent>
                        {availableProductsForReturn.length === 0 && returnForm.supplier_id && (
                          <div className="p-3 text-xs text-muted-foreground">এই সাপ্লায়ারের অবিক্রিত কোনো প্রোডাক্ট নেই</div>
                        )}
                        {availableProductsForReturn.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.name} {p.imei && `(${p.imei})`} - স্টক: {p.stock_quantity}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">পরিমাণ</label>
                      <Input type="number" min={1} value={returnForm.quantity} onChange={e => setReturnForm({ ...returnForm, quantity: parseInt(e.target.value) || 1 })} />
                    </div>
                    <div>
                      <label className="text-sm font-medium">রিটার্ণ মূল্য (৳)</label>
                      <Input type="number" step="0.01" value={returnForm.return_amount} onChange={e => setReturnForm({ ...returnForm, return_amount: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">কারণ</label>
                    <Select value={returnForm.reason} onValueChange={v => setReturnForm({ ...returnForm, reason: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="defective">ত্রুটিপূর্ণ</SelectItem>
                        <SelectItem value="damaged">ক্ষতিগ্রস্ত</SelectItem>
                        <SelectItem value="wrong_item">ভুল পণ্য</SelectItem>
                        <SelectItem value="excess_stock">অতিরিক্ত স্টক</SelectItem>
                        <SelectItem value="quality_issue">মান সমস্যা</SelectItem>
                        <SelectItem value="other">অন্যান্য</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea placeholder="অতিরিক্ত নোটস" value={returnForm.notes} onChange={e => setReturnForm({ ...returnForm, notes: e.target.value })} />
                  <Button type="submit" className="w-full" disabled={!returnForm.product_id}>
                    {editingReturn ? "আপডেট" : "রিটার্ণ নিশ্চিত করুন"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {filteredReturns.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">কোনো সাপ্লায়ার রিটার্ণ নেই</Card>
          ) : (
            <div className="space-y-3">
              {filteredReturns.map(r => (
                <Card key={r.id} className="p-4">
                  <div className="flex flex-wrap justify-between gap-3">
                    <div className="w-full min-w-0 sm:flex-1 sm:min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{productNameById(r.product_id)}</h3>
                        <Badge variant="outline" className="text-[10px]">{r.reason}</Badge>
                      </div>
                      {productImeiById(r.product_id) && <p className="text-xs font-mono text-muted-foreground">IMEI: {productImeiById(r.product_id)}</p>}
                      <p className="text-xs text-muted-foreground">সাপ্লায়ার: {r.supplier_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">পরিমাণ: {r.quantity} | তারিখ: {format(new Date(r.created_at), 'dd MMM yyyy', { locale: dateLocale })}</p>
                      {r.notes && <p className="text-xs italic mt-1">"{r.notes}"</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">রিটার্ণ মূল্য</p>
                      <p className="text-lg font-bold text-destructive">৳{Number(r.return_amount).toLocaleString('bn-BD')}</p>
                      <div className="flex gap-1 mt-2">
                        <Button size="sm" variant="outline" onClick={() => startEditReturn(r)}><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="destructive" onClick={() => { if (confirm("মুছে ফেলে স্টক ফিরিয়ে আনবেন?")) deleteReturn.mutate(r); }}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
