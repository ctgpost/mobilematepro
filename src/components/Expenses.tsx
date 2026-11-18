import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Receipt, Wallet, CircleDollarSign, Ban, Search, RefreshCw } from "lucide-react";

type ExpenseCategory = { id: string; name: string; account_code: string };
type ExpenseRow = {
  id: string;
  expense_date: string;
  category_id: string;
  description: string;
  payee: string | null;
  reference_number: string | null;
  amount: number;
  paid_amount: number;
  payment_method: string;
  notes: string | null;
  voided_at: string | null;
  void_reason: string | null;
  expense_categories?: { name: string } | null;
};

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) => `৳${Number(value || 0).toLocaleString("bn-BD", { maximumFractionDigits: 2 })}`;

export function Expenses() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [voidTarget, setVoidTarget] = useState<ExpenseRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [form, setForm] = useState({
    expense_date: today(), category_id: "", description: "", payee: "",
    reference_number: "", amount: "", paid_amount: "", payment_method: "cash", notes: "",
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: () => fetchAll<ExpenseCategory>("expense_categories", "*", (q) => q.eq("is_active", true).order("name")),
  });

  const { data: expenses = [], isLoading, refetch } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => fetchAll<ExpenseRow>("expenses", "*, expense_categories(name)", (q) => q.order("expense_date", { ascending: false }).order("created_at", { ascending: false })),
  });

  const createExpense = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      const paid = form.paid_amount === "" ? amount : Number(form.paid_amount);
      if (!form.category_id || !form.description.trim() || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(paid) || paid < 0 || paid > amount) {
        throw new Error("সঠিক ক্যাটাগরি, বিবরণ, মোট টাকা এবং পরিশোধিত টাকা দিন");
      }
      const { data, error } = await supabase.rpc("create_expense_atomic", {
        p_expense: {
          ...form,
          amount,
          paid_amount: paid,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("ব্যয় সংরক্ষণ এবং হিসাবের খাতায় পোস্ট হয়েছে");
      setShowForm(false);
      setForm({ expense_date: today(), category_id: "", description: "", payee: "", reference_number: "", amount: "", paid_amount: "", payment_method: "cash", notes: "" });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["accounting"] });
    },
    onError: (error: any) => toast.error(error.message || "ব্যয় সংরক্ষণ করা যায়নি"),
  });

  const voidExpense = useMutation({
    mutationFn: async () => {
      if (!voidTarget) throw new Error("ব্যয় নির্বাচন করা হয়নি");
      const { data, error } = await supabase.rpc("void_expense_atomic", {
        p_expense_id: voidTarget.id,
        p_reason: voidReason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("ব্যয়টি বাতিল করে বিপরীত হিসাব পোস্ট করা হয়েছে");
      setVoidTarget(null);
      setVoidReason("");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["accounting"] });
    },
    onError: (error: any) => toast.error(error.message || "ব্যয় বাতিল করা যায়নি"),
  });

  const filtered = useMemo(() => expenses.filter((item) => {
    const query = search.trim().toLowerCase();
    const matchesText = !query || [item.description, item.payee, item.reference_number, item.expense_categories?.name]
      .some((value) => String(value || "").toLowerCase().includes(query));
    return matchesText && (!dateFrom || item.expense_date >= dateFrom) && (!dateTo || item.expense_date <= dateTo);
  }), [expenses, search, dateFrom, dateTo]);

  const totals = useMemo(() => {
    const active = filtered.filter((item) => !item.voided_at);
    return {
      amount: active.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      paid: active.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0),
      due: active.reduce((sum, item) => sum + Number(item.amount || 0) - Number(item.paid_amount || 0), 0),
    };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="ব্যয় ব্যবস্থাপনা"
        subtitle="দোকানের পরিচালন ব্যয়, পরিশোধ এবং বকেয়া এক জায়গায় পরিচালনা করুন"
        icon={<Receipt className="h-5 w-5 text-primary" />}
        actions={<Button onClick={() => setShowForm(true)}><Plus className="mr-2 h-4 w-4" /> নতুন ব্যয়</Button>}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-primary/10 p-2"><Receipt className="h-5 w-5 text-primary" /></div><div><p className="text-xs text-muted-foreground">মোট ব্যয়</p><p className="text-xl font-bold">{money(totals.amount)}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-emerald-500/10 p-2"><Wallet className="h-5 w-5 text-emerald-600" /></div><div><p className="text-xs text-muted-foreground">পরিশোধিত</p><p className="text-xl font-bold">{money(totals.paid)}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-xl bg-amber-500/10 p-2"><CircleDollarSign className="h-5 w-5 text-amber-600" /></div><div><p className="text-xs text-muted-foreground">বকেয়া ব্যয়</p><p className="text-xl font-bold">{money(totals.due)}</p></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">ব্যয়ের তালিকা</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <div className="relative sm:col-span-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="ব্যয়, ক্যাটাগরি বা প্রাপক খুঁজুন" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="শুরুর তারিখ" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="শেষ তারিখ" />
          </div>
          <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); void refetch(); }}><RefreshCw className="mr-2 h-4 w-4" /> রিসেট</Button></div>
          {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">তথ্য লোড হচ্ছে...</p> : filtered.length === 0 ? <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">কোনো ব্যয়ের তথ্য পাওয়া যায়নি</div> : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/50"><tr className="text-left"><th className="p-3">তারিখ</th><th className="p-3">ক্যাটাগরি / বিবরণ</th><th className="p-3">প্রাপক</th><th className="p-3 text-right">মোট</th><th className="p-3 text-right">পরিশোধ</th><th className="p-3">অবস্থা</th><th className="p-3 text-right">অ্যাকশন</th></tr></thead>
                <tbody>
                  {filtered.map((item) => {
                    const due = Number(item.amount) - Number(item.paid_amount);
                    return <tr key={item.id} className="border-t">
                      <td className="whitespace-nowrap p-3">{item.expense_date}</td>
                      <td className="p-3"><div className="font-medium">{item.expense_categories?.name || "অন্যান্য"}</div><div className="text-xs text-muted-foreground">{item.description}</div>{item.reference_number && <div className="text-xs text-muted-foreground">Ref: {item.reference_number}</div>}</td>
                      <td className="p-3">{item.payee || "—"}</td>
                      <td className="p-3 text-right font-semibold">{money(item.amount)}</td>
                      <td className="p-3 text-right">{money(item.paid_amount)}</td>
                      <td className="p-3">{item.voided_at ? <Badge variant="destructive">বাতিল</Badge> : due > 0 ? <Badge variant="secondary">বকেয়া {money(due)}</Badge> : <Badge variant="outline">পরিশোধিত</Badge>}</td>
                      <td className="p-3 text-right">{!item.voided_at && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { setVoidTarget(item); setVoidReason(""); }}><Ban className="mr-1 h-4 w-4" /> বাতিল</Button>}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>নতুন পরিচালন ব্যয়</DialogTitle><DialogDescription>সংরক্ষণ করলে একই সঙ্গে ডাবল-এন্ট্রি হিসাবের খাতায় পোস্ট হবে। পোস্ট করা ব্যয় সম্পাদনা করা যাবে না, ভুল হলে বাতিল করে নতুন এন্ট্রি দিন।</DialogDescription></DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>ব্যয়ের তারিখ</Label><Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
            <div className="space-y-1"><Label>ক্যাটাগরি</Label><Select value={form.category_id} onValueChange={(value) => setForm({ ...form, category_id: value })}><SelectTrigger><SelectValue placeholder={categoriesLoading ? "লোড হচ্ছে..." : "ক্যাটাগরি নির্বাচন"} /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1 sm:col-span-2"><Label>ব্যয়ের বিবরণ *</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="যেমন: নভেম্বর মাসের দোকান ভাড়া" /></div>
            <div className="space-y-1"><Label>মোট ব্যয় (৳) *</Label><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="space-y-1"><Label>এখন পরিশোধ (৳)</Label><Input type="number" min="0" step="0.01" value={form.paid_amount} onChange={(e) => setForm({ ...form, paid_amount: e.target.value })} placeholder="ফাঁকা রাখলে সম্পূর্ণ পরিশোধিত" /></div>
            <div className="space-y-1"><Label>পেমেন্ট মাধ্যম</Label><Select value={form.payment_method} onValueChange={(value) => setForm({ ...form, payment_method: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">নগদ</SelectItem><SelectItem value="bank">ব্যাংক</SelectItem><SelectItem value="mobile">মোবাইল ব্যাংকিং</SelectItem><SelectItem value="card">কার্ড</SelectItem><SelectItem value="other">অন্যান্য</SelectItem></SelectContent></Select></div>
            <div className="space-y-1"><Label>প্রাপক / দোকান / ব্যক্তি</Label><Input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>রেফারেন্স নম্বর</Label><Input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} placeholder="রসিদ / ট্রানজেকশন নম্বর (ঐচ্ছিক)" /></div>
            <div className="space-y-1 sm:col-span-2"><Label>নোট</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowForm(false)}>বন্ধ</Button><Button disabled={createExpense.isPending || categories.length === 0} onClick={() => createExpense.mutate()}>{createExpense.isPending ? "সংরক্ষণ হচ্ছে..." : "ব্যয় সংরক্ষণ ও পোস্ট"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!voidTarget} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>ব্যয় বাতিল নিশ্চিত করুন</DialogTitle><DialogDescription>মূল এন্ট্রি মুছে ফেলা হবে না। একই অঙ্কের বিপরীত Journal Entry তৈরি করে হিসাব সংশোধন করা হবে।</DialogDescription></DialogHeader>
          {voidTarget && <div className="rounded-lg bg-muted p-3 text-sm"><div className="font-medium">{voidTarget.description}</div><div>{money(voidTarget.amount)}</div></div>}
          <div className="space-y-1"><Label>বাতিলের কারণ</Label><Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="কারণ লিখুন" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setVoidTarget(null)}>ফিরে যান</Button><Button variant="destructive" disabled={voidExpense.isPending} onClick={() => voidExpense.mutate()}>{voidExpense.isPending ? "বাতিল হচ্ছে..." : "বিপরীত এন্ট্রি পোস্ট করুন"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
