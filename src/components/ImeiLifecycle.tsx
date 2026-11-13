import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { toast } from "sonner";
import { Activity, Barcode, Camera, Clock3, Cpu, Download, History, Loader2, Package, Plus, Search, ShieldCheck, Smartphone, Wallet } from "lucide-react";

type AnyRow = Record<string, any>;
const db = supabase as any;
const digits = (value: string) => value.replace(/[^0-9]/g, "").slice(0, 15);
const money = (value: unknown) => `৳${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
const dateTime = (value: string) => new Date(value).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" });

const statusLabels: Record<string, string> = {
  in_stock: "স্টকে আছে", reserved: "রিজার্ভ", sold: "বিক্রি হয়েছে",
  returned: "রিটার্ন", repair: "সার্ভিসিং", damaged: "নষ্ট",
  lost: "হারানো", retired: "অবসরে",
};
const eventLabels: Record<string, string> = {
  registered: "IMEI নিবন্ধন", sold: "বিক্রয়", returned: "রিটার্ন",
  reserved: "রিজার্ভ", repair_started: "সার্ভিসিং শুরু", repair_completed: "সার্ভিসিং সম্পন্ন",
  damaged: "ড্যামেজ", lost: "হারানো", found: "পাওয়া গেছে",
  warranty_claim: "ওয়ারেন্টি ক্লেইম", warranty_replaced: "ওয়ারেন্টি রিপ্লেসমেন্ট",
  price_adjustment: "মূল্য সমন্বয়", status_note: "স্ট্যাটাস আপডেট", retired: "রিটায়ার্ড",
  stock_changed: "স্টক পরিবর্তন",
};

export function ImeiLifecycle() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selected, setSelected] = useState<AnyRow | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [imei, setImei] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [purchaseRef, setPurchaseRef] = useState("");
  const [warrantyEnd, setWarrantyEnd] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [registerNotes, setRegisterNotes] = useState("");
  const [eventType, setEventType] = useState("status_note");
  const [toStatus, setToStatus] = useState("same");
  const [partyName, setPartyName] = useState("");
  const [eventAmount, setEventAmount] = useState("");
  const [eventNotes, setEventNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const searchQuery = useQuery({
    queryKey: ["imei-lifecycle-search", search],
    enabled: open && search.trim().length >= 2,
    queryFn: async () => {
      const term = search.trim();
      const safe = term.replace(/[,%()]/g, " ").trim();
      const [byImei, byBarcode, bySku, byName, byModel] = await Promise.all([
        db.from("products").select("*, categories(name)").eq("imei", digits(term) || term).limit(20),
        db.from("products").select("*, categories(name)").eq("barcode", term).limit(20),
        db.from("products").select("*, categories(name)").ilike("sku", `%${safe}%`).limit(20),
        db.from("products").select("*, categories(name)").ilike("name", `%${safe}%`).limit(20),
        db.from("products").select("*, categories(name)").ilike("model", `%${safe}%`).limit(20),
      ]);
      for (const result of [byImei, byBarcode, bySku, byName, byModel]) if (result.error) throw result.error;
      const map = new Map<string, AnyRow>();
      for (const result of [byImei, byBarcode, bySku, byName, byModel]) {
        for (const row of result.data || []) map.set(row.id, row);
      }
      return [...map.values()].slice(0, 50);
    },
  });

  const { data: registry = [], isLoading: registryLoading, refetch: refetchRegistry } = useQuery({
    queryKey: ["imei-registry", selected?.id],
    enabled: open && !!selected?.id,
    queryFn: async () => {
      const { data, error } = await db.from("imei_registry").select("*").eq("product_id", selected.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as AnyRow[];
    },
  });

  const { data: timeline = [], isLoading: timelineLoading, refetch: refetchTimeline } = useQuery({
    queryKey: ["imei-lifecycle-timeline", selected?.id, registry.map((r: AnyRow) => r.imei).join(",")],
    enabled: open && !!selected?.id,
    queryFn: async () => {
      const imeis = registry.map((r: AnyRow) => r.imei);
      const [events, transactions, stock, supplier, saleItems, returns, purchaseItems] = await Promise.all([
        db.from("imei_lifecycle_events").select("*").eq("product_id", selected.id).order("created_at", { ascending: false }).limit(500),
        db.from("product_transaction_history").select("*").eq("product_id", selected.id).order("created_at", { ascending: false }).limit(300),
        db.from("stock_movements").select("*").eq("product_id", selected.id).order("created_at", { ascending: false }).limit(300),
        db.from("supplier_ledger_entries").select("*").eq("product_id", selected.id).order("created_at", { ascending: false }).limit(200),
        db.from("sale_items").select("*, sales(id,created_at,total_amount,paid_amount,due_amount,payment_method,customer_id,instant_customer_name,instant_customer_phone,customers(name,phone))").eq("product_id", selected.id).order("created_at", { ascending: false }).limit(200),
      ]);
      for (const result of [events, transactions, stock, supplier, saleItems]) if (result.error) throw result.error;
      const rows: AnyRow[] = [];
      for (const row of events.data || []) rows.push({ ...row, source: "imei", title: eventLabels[row.event_type] || row.event_type });
      for (const row of transactions.data || []) rows.push({ ...row, source: "transaction", title: row.transaction_type, amount: row.total_amount, notes: row.notes || row.product_name });
      for (const row of stock.data || []) rows.push({ ...row, source: "stock", title: row.movement_type || "স্টক পরিবর্তন", amount: null, notes: row.reason || `${row.old_quantity} → ${row.new_quantity}` });
      for (const row of supplier.data || []) rows.push({ ...row, source: "supplier", title: `সাপ্লায়ার: ${row.transaction_type}`, amount: row.amount, notes: row.notes || row.supplier_name });
      for (const row of saleItems.data || []) rows.push({ ...row, source: "sale", title: "বিক্রয় রেকর্ড", amount: row.total_price, notes: row.sales ? `Sale #${String(row.sales.id).slice(0,8)} · ${row.sales.instant_customer_name || row.sales.customers?.name || "Walk-in"}` : "Sale item" });
      return rows.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
  });

  const selectedImeis = useMemo(() => new Set(registry.map((r: AnyRow) => r.imei)), [registry]);

  const resetRegister = () => {
    setImei(""); setPurchaseCost(""); setPurchaseRef(""); setWarrantyEnd(""); setSupplierName(""); setRegisterNotes("");
  };

  const registerDevice = async () => {
    const clean = digits(imei);
    if (clean.length !== 15) { toast.error("IMEI অবশ্যই ১৫ ডিজিটের হতে হবে"); return; }
    setSaving(true);
    try {
      const { error } = await db.rpc("register_imei_device", {
        p_imei: clean, p_product_id: selected.id,
        p_supplier_name: supplierName || null,
        p_purchase_cost: Number(purchaseCost || selected.cost || 0),
        p_purchase_reference: purchaseRef || null,
        p_warranty_end: warrantyEnd || null,
        p_notes: registerNotes || null,
      });
      if (error) throw error;
      toast.success("IMEI সফলভাবে নিবন্ধিত হয়েছে");
      setRegisterOpen(false); resetRegister();
      await Promise.all([refetchRegistry(), refetchTimeline()]);
      queryClient.invalidateQueries({ queryKey: ["imei-registry"] });
    } catch (error: any) { toast.error(error.message || "IMEI নিবন্ধন করা যায়নি"); }
    finally { setSaving(false); }
  };

  const saveEvent = async () => {
    const activeImei = imei || registry[0]?.imei;
    if (!activeImei) { toast.error("আগে একটি IMEI নির্বাচন বা নিবন্ধন করুন"); return; }
    setSaving(true);
    try {
      const nextStatus = toStatus === "same" ? null : toStatus;
      const { error } = await db.rpc("record_imei_lifecycle_event", {
        p_imei: activeImei, p_event_type: eventType, p_to_status: nextStatus,
        p_party_type: partyName ? "other" : null, p_party_name: partyName || null,
        p_amount: eventAmount ? Number(eventAmount) : null,
        p_notes: eventNotes || null,
        p_details: { source: "imei_lifecycle_ui" },
      });
      if (error) throw error;
      toast.success("লাইফসাইকেল ইভেন্ট সংরক্ষণ হয়েছে");
      setEventOpen(false); setEventNotes(""); setEventAmount(""); setPartyName("");
      await Promise.all([refetchRegistry(), refetchTimeline()]);
    } catch (error: any) { toast.error(error.message || "ইভেন্ট সংরক্ষণ করা যায়নি"); }
    finally { setSaving(false); }
  };

  const exportCsv = () => {
    const rows = [
      ["তারিখ","IMEI","প্রোডাক্ট","ইভেন্ট","আগের অবস্থা","বর্তমান অবস্থা","রেফারেন্স","পার্টি","পরিমাণ","নোট"],
      ...timeline.map((row: AnyRow) => [row.created_at,row.imei || "",selected?.name || "",row.title || row.event_type || "",row.from_status || "",row.to_status || "",row.reference_id || "",row.party_name || row.supplier_name || "",row.amount ?? "",row.notes || ""]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value ?? "").replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF",csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `imei-lifecycle-${selected?.sku || selected?.id || "report"}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2 shadow-sm" variant="outline">
        <Activity className="h-4 w-4" />
        <span className="hidden sm:inline">IMEI Lifecycle</span>
        <span className="sm:hidden">IMEI</span>
      </Button>
      <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) { setSelected(null); setSearch(""); } }}>
        <DialogContent className="w-[98vw] max-w-7xl h-[92vh] max-h-[92vh] overflow-hidden p-0 flex flex-col">
          <DialogHeader className="px-5 py-4 border-b bg-muted/20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pr-7">
              <div>
                <DialogTitle className="text-xl flex items-center gap-2"><Smartphone className="h-5 w-5 text-primary"/> 360° IMEI Lifecycle & Tracking</DialogTitle>
                <DialogDescription>IMEI, barcode, product, stock, purchase, sales, return, warranty ও সার্ভিসিংয়ের সমন্বিত ইতিহাস</DialogDescription>
              </div>
              {selected && <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2"><Download className="h-4 w-4"/> Export CSV</Button>}
            </div>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_1fr] flex-1 min-h-0">
            <aside className="border-b lg:border-b-0 lg:border-r p-4 flex flex-col gap-3 min-h-0">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                  <Input autoFocus value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter" && search.trim().length>=2) searchQuery.refetch();}} placeholder="IMEI / Barcode / SKU / নাম / মডেল" className="pl-9"/>
                </div>
                <Button variant="outline" size="icon" title="ক্যামেরা দিয়ে স্ক্যান" onClick={()=>setScannerOpen(true)}><Camera className="h-4 w-4"/></Button>
              </div>
              <p className="text-xs text-muted-foreground">বারকোড স্ক্যানার বা ক্যামেরা দিয়ে কোড স্ক্যান করুন। IMEI সার্চে ১৫ ডিজিট ব্যবহার করুন।</p>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                {search.trim().length < 2 ? (
                  <Card className="p-5 text-center text-sm text-muted-foreground"><Barcode className="h-8 w-8 mx-auto mb-2 opacity-50"/>সার্চ করতে IMEI, বারকোড, SKU অথবা প্রোডাক্টের নাম লিখুন</Card>
                ) : searchQuery.isFetching ? <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></div> :
                  searchQuery.isError ? <Card className="p-4 text-sm text-destructive">সার্চ করা যায়নি। আবার চেষ্টা করুন।</Card> :
                  (searchQuery.data || []).length === 0 ? <Card className="p-6 text-center text-sm text-muted-foreground">কোনো প্রোডাক্ট পাওয়া যায়নি</Card> :
                  (searchQuery.data || []).map((product: AnyRow) => (
                    <button key={product.id} onClick={()=>setSelected(product)} className={`w-full text-left rounded-xl border p-3 transition-colors hover:bg-muted/60 ${selected?.id===product.id ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border"}`}>
                      <div className="flex items-start justify-between gap-2"><span className="font-semibold text-sm">{product.name}</span><Badge variant="outline">{product.stock_quantity ?? 0} স্টক</Badge></div>
                      <p className="text-xs text-muted-foreground mt-1">{[product.brand,product.model,product.sku].filter(Boolean).join(" · ")}</p>
                      <p className="font-mono text-xs mt-2">{product.imei || product.barcode || "IMEI নিবন্ধিত নয়"}</p>
                    </button>
                  ))
                }
              </div>
            </aside>

            <section className="min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5">
              {!selected ? (
                <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center text-muted-foreground">
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4"><Cpu className="h-8 w-8 text-primary"/></div>
                  <h3 className="text-lg font-semibold text-foreground">প্রোডাক্ট নির্বাচন করুন</h3>
                  <p className="text-sm max-w-md mt-1">যেকোনো প্রোডাক্টের IMEI, বারকোড বা SKU দিয়ে সার্চ করে সম্পূর্ণ জীবনচক্র, লেনদেন ও হিসাব দেখুন।</p>
                </div>
              ) : (
                <>
                  <Card className="p-4 sm:p-5">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1"><Package className="h-4 w-4 text-primary"/><span className="text-xs text-muted-foreground">PRODUCT PROFILE</span></div>
                        <h2 className="text-xl font-bold">{selected.name}</h2>
                        <p className="text-sm text-muted-foreground">{[selected.brand,selected.model,selected.categories?.name].filter(Boolean).join(" · ")}</p>
                        <div className="flex flex-wrap gap-2 mt-3"><Badge variant="outline">SKU: {selected.sku || "N/A"}</Badge><Badge variant="outline">Barcode: {selected.barcode || "N/A"}</Badge><Badge variant="secondary">স্টক: {selected.stock_quantity ?? 0}</Badge></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 min-w-[190px]">
                        <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">ক্রয়মূল্য</p><p className="font-bold">{money(selected.cost)}</p></div>
                        <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">বিক্রয়মূল্য</p><p className="font-bold">{money(selected.price)}</p></div>
                      </div>
                    </div>
                  </Card>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><h3 className="font-semibold">Device IMEI Registry</h3><p className="text-xs text-muted-foreground">একই প্রোডাক্টের একাধিক ডিভাইস IMEI আলাদাভাবে ট্র্যাক করুন</p></div>
                    <Button size="sm" onClick={()=>{setImei(selected.imei || "");setRegisterOpen(true);}} className="gap-2"><Plus className="h-4 w-4"/> IMEI যোগ করুন</Button>
                  </div>
                  {registryLoading ? <Loader2 className="h-5 w-5 animate-spin"/> : registry.length === 0 ? <Card className="p-5 text-sm text-muted-foreground">এই প্রোডাক্টে এখনো কোনো IMEI নিবন্ধিত নেই। নিবন্ধন করলে ডিভাইস-ভিত্তিক ট্র্যাকিং শুরু হবে।</Card> :
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {registry.map((device: AnyRow)=><Card key={device.id} className="p-3">
                        <div className="flex items-center justify-between gap-2"><span className="font-mono font-semibold tracking-wide">{device.imei}</span><Badge variant={device.status==="in_stock"?"default":device.status==="sold"?"secondary":"outline"}>{statusLabels[device.status] || device.status}</Badge></div>
                        <div className="grid grid-cols-2 gap-2 mt-3 text-xs"><div><p className="text-muted-foreground">ক্রয়মূল্য</p><b>{money(device.purchase_cost)}</b></div><div><p className="text-muted-foreground">ওয়ারেন্টি শেষ</p><b>{device.warranty_end || "নেই"}</b></div></div>
                        {device.customer_name && <p className="text-xs mt-2">ক্রেতা: {device.customer_name}</p>}
                        <Button variant="outline" size="sm" className="w-full mt-3" onClick={()=>{setImei(device.imei);setEventOpen(true);}}>ইভেন্ট / স্ট্যাটাস আপডেট</Button>
                      </Card>)}
                    </div>
                  }

                  <div className="flex items-center justify-between gap-2 pt-2 border-t">
                    <div><h3 className="font-semibold flex items-center gap-2"><History className="h-4 w-4"/> সম্পূর্ণ লেনদেন ও লাইফসাইকেল ইতিহাস</h3><p className="text-xs text-muted-foreground">IMEI event, sale, return, stock movement ও supplier ledger একসাথে</p></div>
                    <Button variant="ghost" size="sm" onClick={()=>{void refetchRegistry();void refetchTimeline();}}>Refresh</Button>
                  </div>
                  {timelineLoading ? <div className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></div> : timeline.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground"><Clock3 className="h-7 w-7 mx-auto mb-2 opacity-50"/>এখনো কোনো ইতিহাস পাওয়া যায়নি। নতুন IMEI নিবন্ধন ও লেনদেনের পর ইতিহাস এখানে দেখা যাবে।</Card> :
                    <div className="relative space-y-3">
                      {timeline.map((row: AnyRow,index:number)=><div key={`${row.source}-${row.id}-${index}`} className="relative pl-7">
                        <span className="absolute left-1.5 top-4 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary/10"/>
                        <Card className="p-3 sm:p-4">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                            <div><p className="font-semibold text-sm">{row.title || eventLabels[row.event_type] || row.event_type || "লেনদেন"}</p><p className="text-xs text-muted-foreground mt-1">{dateTime(row.created_at)} · {row.source==="imei"?"IMEI Audit":row.source==="sale"?"Sales":row.source==="stock"?"Stock Ledger":row.source==="supplier"?"Supplier Ledger":row.source==="purchase"?"Purchase":row.source==="return"?"Returns":"Transaction History"}</p></div>
                            {row.amount !== null && row.amount !== undefined && <b className="text-sm whitespace-nowrap">{money(row.amount)}</b>}
                          </div>
                          {(row.imei || row.product_imei) && <p className="font-mono text-xs mt-2">{row.imei || row.product_imei}</p>}
                          {row.from_status || row.to_status ? <p className="text-xs mt-2">{statusLabels[row.from_status] || row.from_status || "—"} → <b>{statusLabels[row.to_status] || row.to_status || "—"}</b></p>:null}
                          {(row.party_name || row.supplier_name) && <p className="text-xs mt-2">পার্টি: {row.party_name || row.supplier_name}</p>}
                          {(row.notes || row.reason) && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{row.notes || row.reason}</p>}
                          {row.reference_id && <p className="text-[11px] text-muted-foreground mt-2">Reference: {row.reference_id}</p>}
                        </Card>
                      </div>)}
                    </div>
                  }
                </>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>নতুন IMEI নিবন্ধন</DialogTitle><DialogDescription>প্রতিটি ফিজিক্যাল ডিভাইসের জন্য আলাদা ১৫ ডিজিট IMEI নিবন্ধন করুন।</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">IMEI নম্বর</label><Input value={imei} onChange={e=>setImei(digits(e.target.value))} maxLength={15} placeholder="১৫ ডিজিট IMEI"/>
            <p className="text-xs text-muted-foreground text-right">{imei.length}/15</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="text-sm font-medium">ক্রয়মূল্য</label><Input type="number" min="0" value={purchaseCost} onChange={e=>setPurchaseCost(e.target.value)} placeholder={String(selected?.cost || 0)}/></div><div><label className="text-sm font-medium">ওয়ারেন্টি শেষ</label><Input type="date" value={warrantyEnd} onChange={e=>setWarrantyEnd(e.target.value)}/></div></div>
            <Input value={supplierName} onChange={e=>setSupplierName(e.target.value)} placeholder="সাপ্লায়ারের নাম"/>
            <Input value={purchaseRef} onChange={e=>setPurchaseRef(e.target.value)} placeholder="Purchase / Invoice Reference"/>
            <Textarea value={registerNotes} onChange={e=>setRegisterNotes(e.target.value)} placeholder="নোট / ডিভাইসের বিশেষ তথ্য"/>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setRegisterOpen(false)}>বাতিল</Button><Button disabled={saving || imei.length!==15} onClick={registerDevice}>{saving?<Loader2 className="h-4 w-4 animate-spin"/>:"নিবন্ধন করুন"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={eventOpen} onOpenChange={setEventOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>IMEI Lifecycle Event</DialogTitle><DialogDescription>{imei} এর জন্য নতুন ইতিহাস/স্ট্যাটাস সংরক্ষণ করুন।</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">ইভেন্টের ধরন</label>
            <Select value={eventType} onValueChange={setEventType}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
              {Object.entries(eventLabels).filter(([key])=>!["registered","stock_changed"].includes(key)).map(([key,label])=><SelectItem key={key} value={key}>{label}</SelectItem>)}
            </SelectContent></Select>
            <label className="text-sm font-medium">নতুন স্ট্যাটাস</label>
            <Select value={toStatus} onValueChange={setToStatus}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="same">বর্তমান স্ট্যাটাস অপরিবর্তিত</SelectItem>{Object.entries(statusLabels).map(([key,label])=><SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
            <Input value={partyName} onChange={e=>setPartyName(e.target.value)} placeholder="ক্রেতা / সার্ভিস সেন্টার / সংশ্লিষ্ট ব্যক্তি"/>
            <Input type="number" min="0" value={eventAmount} onChange={e=>setEventAmount(e.target.value)} placeholder="লেনদেনের পরিমাণ (৳), প্রযোজ্য হলে"/>
            <Textarea value={eventNotes} onChange={e=>setEventNotes(e.target.value)} placeholder="বিস্তারিত নোট, সার্ভিস রিপোর্ট, ওয়ারেন্টি দাবি বা রেফারেন্স"/>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setEventOpen(false)}>বাতিল</Button><Button disabled={saving} onClick={saveEvent}>{saving?<Loader2 className="h-4 w-4 animate-spin"/>:"ইভেন্ট সংরক্ষণ"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
      <BarcodeScanner isOpen={scannerOpen} onClose={()=>setScannerOpen(false)} onScan={code=>{setSearch(code);setScannerOpen(false);}} onError={message=>toast.error(message)}/>
    </>
  );
}
