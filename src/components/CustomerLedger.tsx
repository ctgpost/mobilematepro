import { useState, useMemo } from "react";
import { PageHeader } from "./PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { BookOpen, Search, Plus, FileDown, Printer } from "lucide-react";
import { CollapsibleSection } from "./CollapsibleSection";
import { PhotoZoom } from "./PhotoZoom";

type LedgerEntry = {
  date: string;
  type: "sale" | "payment" | "adjustment_debit" | "adjustment_credit";
  description: string;
  debit: number;
  credit: number;
  ref_id?: string;
};

export function CustomerLedger() {
  const qc = useQueryClient();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [adjDialog, setAdjDialog] = useState(false);
  const [adjForm, setAdjForm] = useState({ entry_type: "debit", amount: "", description: "", entry_date: format(new Date(), "yyyy-MM-dd") });

  const { data: customers } = useQuery({
    queryKey: ["customers-ledger"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").order("name");
      return data || [];
    },
  });

  const { data: sales } = useQuery({
    queryKey: ["ledger-sales", selectedCustomerId],
    enabled: !!selectedCustomerId,
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("*").eq("customer_id", selectedCustomerId).order("created_at");
      return data || [];
    },
  });

  const { data: duePayments } = useQuery({
    queryKey: ["ledger-due-payments", selectedCustomerId, sales?.map(s => s.id).join(",")],
    enabled: !!selectedCustomerId && !!sales,
    queryFn: async () => {
      const ids = sales?.map(s => s.id) || [];
      if (!ids.length) return [];
      const { data } = await supabase.from("due_payments").select("*").in("sale_id", ids).order("created_at");
      return data || [];
    },
  });

  const { data: adjustments } = useQuery({
    queryKey: ["ledger-adjustments", selectedCustomerId],
    enabled: !!selectedCustomerId,
    queryFn: async () => {
      const { data } = await supabase.from("customer_ledger_entries").select("*").eq("customer_id", selectedCustomerId).order("entry_date");
      return data || [];
    },
  });

  const customer = customers?.find(c => c.id === selectedCustomerId);

  const entries: LedgerEntry[] = useMemo(() => {
    const list: LedgerEntry[] = [];
    sales?.forEach(s => {
      list.push({
        date: s.created_at,
        type: "sale",
        description: `বিক্রয় #${s.id.slice(0, 8)} (${s.payment_method})`,
        debit: Number(s.total_amount),
        credit: Number(s.paid_amount) || 0,
        ref_id: s.id,
      });
    });
    duePayments?.forEach(p => {
      list.push({
        date: p.created_at,
        type: "payment",
        description: `বাকি পরিশোধ (${p.payment_method})${p.notes ? ` — ${p.notes}` : ""}`,
        debit: 0,
        credit: Number(p.amount),
        ref_id: p.sale_id,
      });
    });
    adjustments?.forEach(a => {
      const isDebit = a.entry_type === "debit";
      list.push({
        date: a.entry_date,
        type: isDebit ? "adjustment_debit" : "adjustment_credit",
        description: a.description || (isDebit ? "ম্যানুয়াল ডেবিট" : "ম্যানুয়াল ক্রেডিট"),
        debit: isDebit ? Number(a.amount) : 0,
        credit: !isDebit ? Number(a.amount) : 0,
        ref_id: a.id,
      });
    });
    return list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [sales, duePayments, adjustments]);

  const totals = useMemo(() => {
    let debit = 0, credit = 0;
    entries.forEach(e => { debit += e.debit; credit += e.credit; });
    return { debit, credit, balance: debit - credit };
  }, [entries]);

  const addAdjustment = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("customer_ledger_entries").insert({
        customer_id: selectedCustomerId,
        entry_type: adjForm.entry_type,
        amount: Number(adjForm.amount) || 0,
        description: adjForm.description,
        entry_date: adjForm.entry_date,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ledger-adjustments"] });
      toast.success("এন্ট্রি যোগ হয়েছে");
      setAdjDialog(false);
      setAdjForm({ entry_type: "debit", amount: "", description: "", entry_date: format(new Date(), "yyyy-MM-dd") });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filteredCustomers = (customers || []).filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  );

  const exportCSV = () => {
    if (!customer) return;
    let running = 0;
    const rows = [
      ["তারিখ", "বিবরণ", "ডেবিট (৳)", "ক্রেডিট (৳)", "ব্যালেন্স (৳)"],
      ...entries.map(e => {
        running += e.debit - e.credit;
        return [format(new Date(e.date), "yyyy-MM-dd"), e.description, String(e.debit), String(e.credit), String(running)];
      }),
      ["", "মোট", String(totals.debit), String(totals.credit), String(totals.balance)],
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-${customer.name}-${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printLedger = () => {
    if (!customer) return;
    let running = 0;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>Ledger - ${customer.name}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:20px}
        h1{margin:0}
        table{width:100%;border-collapse:collapse;margin-top:16px}
        th,td{border:1px solid #ccc;padding:6px;font-size:12px;text-align:left}
        th{background:#f3f3f3}
        .right{text-align:right}
        .total{font-weight:bold;background:#fafafa}
      </style></head><body>
      <h1>${customer.name} — Ledger Statement</h1>
      <p>${customer.phone || ""} ${customer.address ? "| " + customer.address : ""}</p>
      <table><thead><tr><th>তারিখ</th><th>বিবরণ</th><th class="right">ডেবিট</th><th class="right">ক্রেডিট</th><th class="right">ব্যালেন্স</th></tr></thead><tbody>
      ${entries.map(e => {
        running += e.debit - e.credit;
        return `<tr><td>${format(new Date(e.date), "dd-MM-yyyy")}</td><td>${e.description}</td><td class="right">${e.debit ? "৳" + e.debit.toLocaleString() : ""}</td><td class="right">${e.credit ? "৳" + e.credit.toLocaleString() : ""}</td><td class="right">৳${running.toLocaleString()}</td></tr>`;
      }).join("")}
      <tr class="total"><td colspan="2">মোট</td><td class="right">৳${totals.debit.toLocaleString()}</td><td class="right">৳${totals.credit.toLocaleString()}</td><td class="right">৳${totals.balance.toLocaleString()}</td></tr>
      </tbody></table>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  let runningBal = 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        storageKey="customer-ledger"
        title={<span className="flex items-center gap-2"><BookOpen className="w-6 h-6 sm:w-7 sm:h-7 text-primary" /> কাস্টমার লেজার</span>}
        subtitle="প্রতিটি কাস্টমারের লেনদেন ও বাকি ব্যালেন্স"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Customer list */}
        <Card className="p-4 lg:col-span-1">
          <CollapsibleSection storageKey="ledger-customer-search" title={<h3 className="text-sm font-bold">🔍 কাস্টমার সার্চ</h3>}>
          <div className="relative mb-3">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="কাস্টমার খুঁজুন" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          </CollapsibleSection>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {filteredCustomers.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCustomerId(c.id)}
                className={`w-full text-left p-2 rounded-lg flex items-center gap-2 transition ${selectedCustomerId === c.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"}`}
              >
                <PhotoZoom url={c.photo_url} alt={c.name} size="xs" fallbackInitials={c.name} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  {c.phone && <p className="text-[11px] text-muted-foreground">{c.phone}</p>}
                </div>
              </button>
            ))}
            {!filteredCustomers.length && <p className="text-sm text-muted-foreground text-center py-4">কোনো কাস্টমার নেই</p>}
          </div>
        </Card>

        {/* Ledger view */}
        <div className="lg:col-span-2 space-y-4">
          {!customer ? (
            <Card className="p-12 text-center text-muted-foreground">বাঁ থেকে একজন কাস্টমার নির্বাচন করুন</Card>
          ) : (
            <>
              <Card className="p-4">
                <div className="flex items-start gap-4">
                  <PhotoZoom url={customer.photo_url} alt={customer.name} size="md" fallbackInitials={customer.name} />
                  <div className="flex-1">
                    <h2 className="text-lg font-bold">{customer.name}</h2>
                    {customer.phone && <p className="text-sm text-muted-foreground">📞 {customer.phone}</p>}
                    {customer.address && <p className="text-xs text-muted-foreground">📍 {customer.address}</p>}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Dialog open={adjDialog} onOpenChange={setAdjDialog}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline"><Plus className="w-3 h-3 mr-1" /> এডজাস্টমেন্ট</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>ম্যানুয়াল এন্ট্রি</DialogTitle></DialogHeader>
                        <div className="space-y-3">
                          <div>
                            <Label>ধরন</Label>
                            <Select value={adjForm.entry_type} onValueChange={v => setAdjForm({ ...adjForm, entry_type: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="debit">ডেবিট (কাস্টমারের কাছে পাওনা বাড়ে)</SelectItem>
                                <SelectItem value="credit">ক্রেডিট (পাওনা কমে / পরিশোধ)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>তারিখ</Label>
                            <Input type="date" value={adjForm.entry_date} onChange={e => setAdjForm({ ...adjForm, entry_date: e.target.value })} />
                          </div>
                          <div>
                            <Label>পরিমাণ (৳)</Label>
                            <Input type="number" value={adjForm.amount} onChange={e => setAdjForm({ ...adjForm, amount: e.target.value })} />
                          </div>
                          <div>
                            <Label>বিবরণ</Label>
                            <Textarea value={adjForm.description} onChange={e => setAdjForm({ ...adjForm, description: e.target.value })} placeholder="যেমন: ওপেনিং ব্যালেন্স, ডিসকাউন্ট" />
                          </div>
                          <Button className="w-full" onClick={() => addAdjustment.mutate()} disabled={!adjForm.amount}>সেভ</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button size="sm" variant="outline" onClick={exportCSV}><FileDown className="w-3 h-3 mr-1" /> CSV</Button>
                    <Button size="sm" variant="outline" onClick={printLedger}><Printer className="w-3 h-3 mr-1" /> প্রিন্ট</Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="p-3 rounded-lg bg-muted text-center">
                    <p className="text-xs text-muted-foreground">মোট কেনা</p>
                    <p className="text-lg font-bold">৳{totals.debit.toLocaleString('bn-BD')}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-500/10 text-center">
                    <p className="text-xs text-muted-foreground">মোট পরিশোধ</p>
                    <p className="text-lg font-bold text-emerald-600">৳{totals.credit.toLocaleString('bn-BD')}</p>
                  </div>
                  <div className={`p-3 rounded-lg text-center ${totals.balance > 0 ? "bg-destructive/10" : "bg-muted"}`}>
                    <p className="text-xs text-muted-foreground">বাকি ব্যালেন্স</p>
                    <p className={`text-lg font-bold ${totals.balance > 0 ? "text-destructive" : ""}`}>৳{totals.balance.toLocaleString('bn-BD')}</p>
                  </div>
                </div>
              </Card>

              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">তারিখ</th>
                        <th className="p-2 text-left">বিবরণ</th>
                        <th className="p-2 text-right">ডেবিট</th>
                        <th className="p-2 text-right">ক্রেডিট</th>
                        <th className="p-2 text-right">ব্যালেন্স</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e, i) => {
                        runningBal += e.debit - e.credit;
                        return (
                          <tr key={i} className="border-t border-border">
                            <td className="p-2">{format(new Date(e.date), "dd-MM-yyyy")}</td>
                            <td className="p-2">
                              <div className="flex items-center gap-2">
                                <Badge variant={e.type === "sale" || e.type === "adjustment_debit" ? "destructive" : "default"} className="text-[10px]">
                                  {e.type === "sale" ? "বিক্রয়" : e.type === "payment" ? "পরিশোধ" : e.type === "adjustment_debit" ? "ডেবিট" : "ক্রেডিট"}
                                </Badge>
                                <span>{e.description}</span>
                              </div>
                            </td>
                            <td className="p-2 text-right">{e.debit ? `৳${e.debit.toLocaleString('bn-BD')}` : "—"}</td>
                            <td className="p-2 text-right text-emerald-600">{e.credit ? `৳${e.credit.toLocaleString('bn-BD')}` : "—"}</td>
                            <td className={`p-2 text-right font-medium ${runningBal > 0 ? "text-destructive" : ""}`}>৳{runningBal.toLocaleString('bn-BD')}</td>
                          </tr>
                        );
                      })}
                      {!entries.length && (
                        <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">কোনো লেনদেন নেই</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
