import { useState, useMemo } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { PageHeader } from "./PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TrendingUp, Wallet, PiggyBank, ArrowDownCircle, ArrowUpCircle, Trash2, Pencil, Building2, FileSpreadsheet, FileText } from "lucide-react";
import { format } from "date-fns";
import { bn, enUS } from "date-fns/locale";
import { useLanguage } from "@/components/LanguageProvider";
import * as XLSX from "xlsx";

export function Investments() {
  const { language } = useLanguage();
  const dateLocale = language === "bn" ? bn : enUS;
  const qc = useQueryClient();
  const [showSector, setShowSector] = useState(false);
  const [showEntry, setShowEntry] = useState(false);
  const [showIncome, setShowIncome] = useState(false);
  const [editingSector, setEditingSector] = useState<any>(null);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [editingIncome, setEditingIncome] = useState<any>(null);
  const [filterSector, setFilterSector] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [sectorForm, setSectorForm] = useState({ name: "", description: "" });
  const [entryForm, setEntryForm] = useState({ sector_id: "", amount: "", entry_type: "deposit", purpose: "", notes: "", entry_date: new Date().toISOString().split('T')[0] });
  const [incomeForm, setIncomeForm] = useState({ sector_id: "", amount: "", source: "", purpose: "", notes: "", income_date: new Date().toISOString().split('T')[0] });

  const { data: sectors } = useQuery({
    queryKey: ["investment-sectors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("investment_sectors").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: entries } = useQuery({
    queryKey: ["investment-entries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("investment_entries").select("*, investment_sectors(name)").order("entry_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: incomes } = useQuery({
    queryKey: ["investment-incomes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("investment_incomes").select("*, investment_sectors(name)").order("income_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Sector CRUD
  const saveSector = useMutation({
    mutationFn: async () => {
      if (editingSector) {
        const { error } = await supabase.from("investment_sectors").update(sectorForm).eq("id", editingSector.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("investment_sectors").insert(sectorForm);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investment-sectors"] });
      toast.success(editingSector ? "খাত আপডেট হয়েছে" : "খাত যোগ হয়েছে");
      setShowSector(false); setEditingSector(null); setSectorForm({ name: "", description: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSector = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("investment_sectors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["investment-sectors"] }); toast.success("খাত মুছে ফেলা হয়েছে"); },
    onError: (e: any) => toast.error("সংশ্লিষ্ট এন্ট্রি/আয় থাকলে আগে মুছতে হবে"),
  });

  // Entry CRUD
  const saveEntry = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        sector_id: entryForm.sector_id,
        amount: Number(entryForm.amount),
        entry_type: entryForm.entry_type,
        purpose: entryForm.purpose,
        notes: entryForm.notes,
        entry_date: entryForm.entry_date,
        created_by: user?.id,
      };
      if (editingEntry) {
        const { error } = await supabase.from("investment_entries").update(payload).eq("id", editingEntry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("investment_entries").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investment-entries"] });
      toast.success(editingEntry ? "আপডেট হয়েছে" : "যোগ হয়েছে");
      setShowEntry(false); setEditingEntry(null);
      setEntryForm({ sector_id: "", amount: "", entry_type: "deposit", purpose: "", notes: "", entry_date: new Date().toISOString().split('T')[0] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("investment_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["investment-entries"] }); toast.success("মুছে ফেলা হয়েছে"); },
  });

  // Income CRUD
  const saveIncome = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        sector_id: incomeForm.sector_id,
        amount: Number(incomeForm.amount),
        source: incomeForm.source,
        purpose: incomeForm.purpose,
        notes: incomeForm.notes,
        income_date: incomeForm.income_date,
        created_by: user?.id,
      };
      if (editingIncome) {
        const { error } = await supabase.from("investment_incomes").update(payload).eq("id", editingIncome.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("investment_incomes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investment-incomes"] });
      toast.success(editingIncome ? "আপডেট হয়েছে" : "যোগ হয়েছে");
      setShowIncome(false); setEditingIncome(null);
      setIncomeForm({ sector_id: "", amount: "", source: "", purpose: "", notes: "", income_date: new Date().toISOString().split('T')[0] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteIncome = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("investment_incomes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["investment-incomes"] }); toast.success("মুছে ফেলা হয়েছে"); },
  });

  // Filters
  const inDateRange = (d: string) => {
    if (dateFrom && new Date(d) < new Date(dateFrom)) return false;
    if (dateTo && new Date(d) > new Date(dateTo + "T23:59:59")) return false;
    return true;
  };

  const filteredEntries = useMemo(() => entries?.filter(e =>
    (filterSector === "all" || e.sector_id === filterSector) && inDateRange(e.entry_date)
  ) || [], [entries, filterSector, dateFrom, dateTo]);

  const filteredIncomes = useMemo(() => incomes?.filter(i =>
    (filterSector === "all" || i.sector_id === filterSector) && inDateRange(i.income_date)
  ) || [], [incomes, filterSector, dateFrom, dateTo]);

  // Sector stats use ALL data (not filtered) for accurate totals
  const sectorStats = useMemo(() => sectors?.map(sector => {
    const sEntries = entries?.filter(e => e.sector_id === sector.id) || [];
    const sIncomes = incomes?.filter(i => i.sector_id === sector.id) || [];
    const totalDeposit = sEntries.filter(e => e.entry_type === 'deposit').reduce((s, e) => s + Number(e.amount), 0);
    const totalWithdraw = sEntries.filter(e => e.entry_type === 'withdraw').reduce((s, e) => s + Number(e.amount), 0);
    const totalIncome = sIncomes.reduce((s, i) => s + Number(i.amount), 0);
    const netInvestment = totalDeposit - totalWithdraw;
    return { ...sector, totalDeposit, totalWithdraw, totalIncome, netInvestment, profit: totalIncome - netInvestment };
  }) || [], [sectors, entries, incomes]);

  const grandInvestment = sectorStats.reduce((s, x) => s + x.netInvestment, 0);
  const grandIncome = sectorStats.reduce((s, x) => s + x.totalIncome, 0);
  const grandProfit = grandIncome - grandInvestment;

  // Edit start helpers
  const startEditSector = (s: any) => { setEditingSector(s); setSectorForm({ name: s.name, description: s.description || "" }); setShowSector(true); };
  const startEditEntry = (e: any) => {
    setEditingEntry(e);
    setEntryForm({ sector_id: e.sector_id, amount: String(e.amount), entry_type: e.entry_type, purpose: e.purpose || "", notes: e.notes || "", entry_date: e.entry_date });
    setShowEntry(true);
  };
  const startEditIncome = (i: any) => {
    setEditingIncome(i);
    setIncomeForm({ sector_id: i.sector_id, amount: String(i.amount), source: i.source || "", purpose: i.purpose || "", notes: i.notes || "", income_date: i.income_date });
    setShowIncome(true);
  };

  // Exports
  const exportExcel = () => {
    const rows = [
      ...filteredEntries.map(e => ({
        ধরন: e.entry_type === 'deposit' ? 'জমা' : 'উত্তোলন',
        খাত: (e as any).investment_sectors?.name,
        পরিমাণ: Number(e.amount),
        উদ্দেশ্য: e.purpose || '',
        নোটস: e.notes || '',
        তারিখ: e.entry_date,
      })),
      ...filteredIncomes.map(i => ({
        ধরন: 'আয়',
        খাত: (i as any).investment_sectors?.name,
        পরিমাণ: Number(i.amount),
        উদ্দেশ্য: i.purpose || i.source || '',
        নোটস: i.notes || '',
        তারিখ: i.income_date,
      })),
    ];
    if (rows.length === 0) { toast.error("কোনো ডেটা নেই"); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Investments');
    XLSX.writeFile(wb, `MobileMatePro_Investments_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Excel ডাউনলোড");
  };

  const exportPDF = () => {
    const w = window.open('', '_blank');
    if (!w) { toast.error("পপআপ ব্লক"); return; }
    w.document.write(`<html><head><title>MOBILE MATE PRO - Investments Report</title><style>
      body{font-family:Arial;padding:20px;font-size:12px}h1{text-align:center;color:#0066cc}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:15px 0}
      .stat{background:#f5f5f5;padding:10px;border-radius:6px;text-align:center}
      .stat .v{font-size:18px;font-weight:bold;color:#0066cc}
      table{width:100%;border-collapse:collapse;margin-top:15px}
      th,td{border:1px solid #ddd;padding:6px;text-align:left;font-size:11px}
      th{background:#0066cc;color:white}h2{margin-top:20px;border-bottom:2px solid #0066cc;padding-bottom:5px}
    </style></head><body>
      <h1>MOBILE MATE PRO - ইনভেস্টমেন্ট রিপোর্ট</h1>
      <p style="text-align:center">তারিখ: ${new Date().toLocaleDateString('bn-BD')}</p>
      <div class="grid">
        <div class="stat"><div>মোট বিনিয়োগ</div><div class="v">৳${grandInvestment.toLocaleString('bn-BD')}</div></div>
        <div class="stat"><div>মোট আয়</div><div class="v">৳${grandIncome.toLocaleString('bn-BD')}</div></div>
        <div class="stat"><div>লাভ/ক্ষতি</div><div class="v" style="color:${grandProfit>=0?'green':'red'}">৳${grandProfit.toLocaleString('bn-BD')}</div></div>
      </div>
      <h2>খাতওয়ারি সারাংশ</h2>
      <table><thead><tr><th>খাত</th><th>জমা</th><th>উত্তোলন</th><th>নেট বিনিয়োগ</th><th>আয়</th><th>লাভ/ক্ষতি</th></tr></thead><tbody>
      ${sectorStats.map(s => `<tr><td>${s.name}</td><td>৳${s.totalDeposit.toLocaleString('bn-BD')}</td><td>৳${s.totalWithdraw.toLocaleString('bn-BD')}</td><td>৳${s.netInvestment.toLocaleString('bn-BD')}</td><td>৳${s.totalIncome.toLocaleString('bn-BD')}</td><td style="color:${s.profit>=0?'green':'red'}">৳${s.profit.toLocaleString('bn-BD')}</td></tr>`).join('')}
      </tbody></table>
      <h2>ইনভেস্টমেন্ট এন্ট্রি (${filteredEntries.length})</h2>
      <table><thead><tr><th>তারিখ</th><th>খাত</th><th>ধরন</th><th>পরিমাণ</th><th>উদ্দেশ্য</th></tr></thead><tbody>
      ${filteredEntries.map(e => `<tr><td>${e.entry_date}</td><td>${(e as any).investment_sectors?.name || ''}</td><td>${e.entry_type === 'deposit' ? 'জমা' : 'উত্তোলন'}</td><td>৳${Number(e.amount).toLocaleString('bn-BD')}</td><td>${e.purpose || ''}</td></tr>`).join('')}
      </tbody></table>
      <h2>আয়ের তালিকা (${filteredIncomes.length})</h2>
      <table><thead><tr><th>তারিখ</th><th>খাত</th><th>উৎস</th><th>পরিমাণ</th><th>উদ্দেশ্য</th></tr></thead><tbody>
      ${filteredIncomes.map(i => `<tr><td>${i.income_date}</td><td>${(i as any).investment_sectors?.name || ''}</td><td>${i.source || ''}</td><td>৳${Number(i.amount).toLocaleString('bn-BD')}</td><td>${i.purpose || ''}</td></tr>`).join('')}
      </tbody></table>
    </body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <PageHeader
        storageKey="investments"
        title={<span className="flex items-center gap-2"><Wallet className="w-6 h-6 text-primary" /> ইনভেস্টমেন্ট ট্র্যাকার</span>}
        subtitle="খাতওয়ারি বিনিয়োগ, উত্তোলন ও আয়ের সম্পূর্ণ হিসাব"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={exportExcel} className="border-green-500 text-green-600">
              <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
            </Button>
            <Button size="sm" variant="outline" onClick={exportPDF} className="border-red-500 text-red-600">
              <FileText className="w-4 h-4 mr-1" /> PDF
            </Button>
          </>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">মোট বিনিয়োগ</p>
            <p className="text-xl font-bold text-primary">৳{grandInvestment.toLocaleString('bn-BD')}</p>
          </CardContent>
        </Card>
        <Card className="border-accent/20 bg-accent/5">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">মোট আয়</p>
            <p className="text-xl font-bold text-accent">৳{grandIncome.toLocaleString('bn-BD')}</p>
          </CardContent>
        </Card>
        <Card className={grandProfit >= 0 ? "border-green-500/20 bg-green-500/5" : "border-destructive/20 bg-destructive/5"}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">লাভ/ক্ষতি</p>
            <p className={`text-xl font-bold ${grandProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>৳{grandProfit.toLocaleString('bn-BD')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">মোট খাত</p>
            <p className="text-xl font-bold">{sectors?.length || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Dialog open={showSector} onOpenChange={(o) => { if (!o) { setEditingSector(null); setSectorForm({ name: "", description: "" }); } setShowSector(o); }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><Building2 className="w-4 h-4 mr-1" /> নতুন খাত</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingSector ? "খাত এডিট" : "নতুন খাত"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="খাতের নাম *" value={sectorForm.name} onChange={e => setSectorForm({ ...sectorForm, name: e.target.value })} />
              <Textarea placeholder="বিবরণ" value={sectorForm.description} onChange={e => setSectorForm({ ...sectorForm, description: e.target.value })} />
              <Button onClick={() => saveSector.mutate()} disabled={!sectorForm.name} className="w-full">{editingSector ? "আপডেট" : "যোগ করুন"}</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showEntry} onOpenChange={(o) => { if (!o) { setEditingEntry(null); } setShowEntry(o); }}>
          <DialogTrigger asChild>
            <Button size="sm"><PiggyBank className="w-4 h-4 mr-1" /> জমা/উত্তোলন</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingEntry ? "এন্ট্রি এডিট" : "ইনভেস্টমেন্ট এন্ট্রি"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Select value={entryForm.sector_id} onValueChange={v => setEntryForm({ ...entryForm, sector_id: v })}>
                <SelectTrigger><SelectValue placeholder="খাত নির্বাচন করুন" /></SelectTrigger>
                <SelectContent>{sectors?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={entryForm.entry_type} onValueChange={v => setEntryForm({ ...entryForm, entry_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">➕ জমা (Deposit)</SelectItem>
                  <SelectItem value="withdraw">➖ উত্তোলন (Withdraw)</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" placeholder="পরিমাণ (৳)" value={entryForm.amount} onChange={e => setEntryForm({ ...entryForm, amount: e.target.value })} />
              <Input type="date" value={entryForm.entry_date} onChange={e => setEntryForm({ ...entryForm, entry_date: e.target.value })} />
              <Input placeholder="উদ্দেশ্য" value={entryForm.purpose} onChange={e => setEntryForm({ ...entryForm, purpose: e.target.value })} />
              <Textarea placeholder="নোটস" value={entryForm.notes} onChange={e => setEntryForm({ ...entryForm, notes: e.target.value })} />
              <Button onClick={() => saveEntry.mutate()} disabled={!entryForm.sector_id || !entryForm.amount} className="w-full">{editingEntry ? "আপডেট" : "যোগ করুন"}</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showIncome} onOpenChange={(o) => { if (!o) { setEditingIncome(null); } setShowIncome(o); }}>
          <DialogTrigger asChild>
            <Button size="sm" variant="secondary"><TrendingUp className="w-4 h-4 mr-1" /> আয় যোগ</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingIncome ? "আয় এডিট" : "আয় এন্ট্রি"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Select value={incomeForm.sector_id} onValueChange={v => setIncomeForm({ ...incomeForm, sector_id: v })}>
                <SelectTrigger><SelectValue placeholder="খাত নির্বাচন করুন" /></SelectTrigger>
                <SelectContent>{sectors?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" placeholder="পরিমাণ (৳)" value={incomeForm.amount} onChange={e => setIncomeForm({ ...incomeForm, amount: e.target.value })} />
              <Input type="date" value={incomeForm.income_date} onChange={e => setIncomeForm({ ...incomeForm, income_date: e.target.value })} />
              <Input placeholder="উৎস (কোথা থেকে এসেছে)" value={incomeForm.source} onChange={e => setIncomeForm({ ...incomeForm, source: e.target.value })} />
              <Input placeholder="উদ্দেশ্য" value={incomeForm.purpose} onChange={e => setIncomeForm({ ...incomeForm, purpose: e.target.value })} />
              <Textarea placeholder="নোটস" value={incomeForm.notes} onChange={e => setIncomeForm({ ...incomeForm, notes: e.target.value })} />
              <Button onClick={() => saveIncome.mutate()} disabled={!incomeForm.sector_id || !incomeForm.amount} className="w-full">{editingIncome ? "আপডেট" : "যোগ করুন"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Sector Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sectorStats.map(s => (
          <Card key={s.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  {s.description && <p className="text-xs text-muted-foreground mt-1">{s.description}</p>}
                </div>
                <div className="flex gap-1">
                  {s.is_default && <Badge variant="secondary" className="text-[10px]">ডিফল্ট</Badge>}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditSector(s)}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                  {!s.is_default && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("খাত মুছে ফেলবেন?")) deleteSector.mutate(s.id); }}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                <div className="p-2 rounded bg-muted/50"><div className="text-muted-foreground">জমা</div><div className="font-bold text-primary">৳{s.totalDeposit.toLocaleString('bn-BD')}</div></div>
                <div className="p-2 rounded bg-muted/50"><div className="text-muted-foreground">উত্তোলন</div><div className="font-bold text-destructive">৳{s.totalWithdraw.toLocaleString('bn-BD')}</div></div>
                <div className="p-2 rounded bg-primary/10"><div className="text-muted-foreground">নেট বিনিয়োগ</div><div className="font-bold text-primary">৳{s.netInvestment.toLocaleString('bn-BD')}</div></div>
                <div className="p-2 rounded bg-accent/10"><div className="text-muted-foreground">আয়</div><div className="font-bold text-accent">৳{s.totalIncome.toLocaleString('bn-BD')}</div></div>
              </div>
              <div className={`p-2 rounded text-center ${s.profit >= 0 ? 'bg-green-500/10' : 'bg-destructive/10'}`}>
                <div className="text-xs text-muted-foreground">লাভ/ক্ষতি</div>
                <div className={`font-bold ${s.profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>৳{s.profit.toLocaleString('bn-BD')}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <CollapsibleSection storageKey="investments-filters" title={<h3 className="text-sm font-bold">🔍 ফিল্টার</h3>}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Select value={filterSector} onValueChange={setFilterSector}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">সকল খাত</SelectItem>
              {sectors?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="শুরু" />
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="শেষ" />
          <Button variant="outline" onClick={() => { setFilterSector("all"); setDateFrom(""); setDateTo(""); }}>রিসেট</Button>
        </div>
        </CollapsibleSection>
      </Card>

      {/* Entries & Incomes lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ArrowDownCircle className="w-5 h-5 text-primary" /> ইনভেস্টমেন্ট এন্ট্রি ({filteredEntries.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredEntries.length === 0 && <p className="text-xs text-center text-muted-foreground py-4">কোনো এন্ট্রি নেই</p>}
            {filteredEntries.map(e => (
              <div key={e.id} className="flex justify-between items-center p-3 rounded-lg bg-muted/30 border">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={e.entry_type === 'deposit' ? 'default' : 'destructive'} className="text-[10px]">
                      {e.entry_type === 'deposit' ? '➕ জমা' : '➖ উত্তোলন'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{(e as any).investment_sectors?.name}</span>
                  </div>
                  {e.purpose && <p className="text-xs mt-1">{e.purpose}</p>}
                  {e.notes && <p className="text-[10px] italic text-muted-foreground">{e.notes}</p>}
                  <p className="text-[10px] text-muted-foreground">{format(new Date(e.entry_date), 'dd MMM yyyy', { locale: dateLocale })}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className={`font-bold text-sm ${e.entry_type === 'deposit' ? 'text-primary' : 'text-destructive'}`}>
                    {e.entry_type === 'deposit' ? '+' : '-'}৳{Number(e.amount).toLocaleString('bn-BD')}
                  </p>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEditEntry(e)}><Pencil className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { if (confirm("মুছে ফেলবেন?")) deleteEntry.mutate(e.id); }}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ArrowUpCircle className="w-5 h-5 text-accent" /> আয়ের তালিকা ({filteredIncomes.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredIncomes.length === 0 && <p className="text-xs text-center text-muted-foreground py-4">কোনো আয় নেই</p>}
            {filteredIncomes.map(i => (
              <div key={i.id} className="flex justify-between items-center p-3 rounded-lg bg-accent/5 border border-accent/20">
                <div className="flex-1">
                  <span className="text-xs font-medium text-accent">{(i as any).investment_sectors?.name}</span>
                  {i.source && <p className="text-xs">উৎস: {i.source}</p>}
                  {i.purpose && <p className="text-xs text-muted-foreground">{i.purpose}</p>}
                  {i.notes && <p className="text-[10px] italic text-muted-foreground">{i.notes}</p>}
                  <p className="text-[10px] text-muted-foreground">{format(new Date(i.income_date), 'dd MMM yyyy', { locale: dateLocale })}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="font-bold text-sm text-accent">+৳{Number(i.amount).toLocaleString('bn-BD')}</p>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEditIncome(i)}><Pencil className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { if (confirm("মুছে ফেলবেন?")) deleteIncome.mutate(i.id); }}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
