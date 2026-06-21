import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, FileText } from "lucide-react";

export function ReconciliationReport() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: sales } = useQuery({
    queryKey: ["recon-sales"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, total_amount, paid_amount, due_amount, created_at, sale_items(id, product_id, quantity, total_price, unit_price)");
      return data || [];
    },
  });

  const { data: returns } = useQuery({
    queryKey: ["recon-returns"],
    queryFn: async () => {
      const { data } = await supabase
        .from("returns")
        .select("id, sale_id, sale_item_id, product_id, quantity, refund_amount, status");
      return data || [];
    },
  });

  const { data: supplierReturns } = useQuery({
    queryKey: ["recon-supplier-returns"],
    queryFn: async () => {
      const { data } = await supabase.from("supplier_returns").select("id, product_id, quantity, return_amount, status");
      return data || [];
    },
  });

  const rows = useMemo(() => {
    if (!sales) return [];
    return sales
      .filter((s) => {
        if (dateFrom && new Date(s.created_at) < new Date(dateFrom)) return false;
        if (dateTo && new Date(s.created_at) > new Date(dateTo + "T23:59:59")) return false;
        return true;
      })
      .map((s) => {
        const rels = (returns || []).filter((r: any) => r.sale_id === s.id && r.status === "completed");
        const refunded = rels.reduce((sum, r: any) => sum + Number(r.refund_amount || 0), 0);
        const netAmount = Number(s.total_amount) - refunded;
        const itemsQty = (s.sale_items || []).reduce((sum: number, it: any) => sum + Number(it.quantity || 0), 0);
        const returnedQty = rels.reduce((sum, r: any) => sum + Number(r.quantity || 0), 0);
        const paid = Number(s.paid_amount || 0);
        const due = Number(s.due_amount || 0);
        const balanceMismatch = Math.abs(Number(s.total_amount) - (paid + due)) > 0.01;
        return {
          id: s.id,
          total: Number(s.total_amount),
          refunded,
          netAmount,
          itemsQty,
          returnedQty,
          paid,
          due,
          balanceMismatch,
          createdAt: s.created_at,
        };
      });
  }, [sales, returns, dateFrom, dateTo]);

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.total, 0);
    const refunded = rows.reduce((s, r) => s + r.refunded, 0);
    const net = total - refunded;
    const supplierRecovery = (supplierReturns || [])
      .filter((s: any) => s.status === "completed")
      .reduce((acc: number, s: any) => acc + Number(s.return_amount || 0), 0);
    const mismatches = rows.filter((r) => r.balanceMismatch).length;
    return { total, refunded, net, supplierRecovery, mismatches };
  }, [rows, supplierReturns]);

  const exportPDF = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Reconciliation Report</title>
      <style>body{font-family:Arial;padding:18px;font-size:12px}h1{color:#0066cc}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th,td{border:1px solid #ddd;padding:6px;text-align:left}th{background:#0066cc;color:#fff}</style></head><body>
      <h1>Mobile Mate — রিকনসিলিয়েশন রিপোর্ট</h1>
      <p>মোট বিক্রয়: ৳${totals.total.toLocaleString("bn-BD")} | রিফান্ড: ৳${totals.refunded.toLocaleString("bn-BD")} | নেট: ৳${totals.net.toLocaleString("bn-BD")} | সাপ্লায়ার রিকভারি: ৳${totals.supplierRecovery.toLocaleString("bn-BD")} | অসামঞ্জস্য: ${totals.mismatches}</p>
      <table><thead><tr><th>ইনভয়েস</th><th>মোট</th><th>রিফান্ড</th><th>নেট</th><th>আইটেম</th><th>রিটার্ন</th><th>পরিশোধিত</th><th>বকেয়া</th><th>অবস্থা</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${r.id.slice(0, 8)}</td><td>৳${r.total.toLocaleString("bn-BD")}</td><td>৳${r.refunded.toLocaleString("bn-BD")}</td><td>৳${r.netAmount.toLocaleString("bn-BD")}</td><td>${r.itemsQty}</td><td>${r.returnedQty}</td><td>৳${r.paid.toLocaleString("bn-BD")}</td><td>৳${r.due.toLocaleString("bn-BD")}</td><td>${r.balanceMismatch ? "❌ অসামঞ্জস্য" : "✅ ঠিক"}</td></tr>`).join("")}
      </tbody></table></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">শুরু</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">শেষ</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => { setDateFrom(""); setDateTo(""); }}>রিসেট</Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={exportPDF}>
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3"><p className="text-xs text-muted-foreground">মোট বিক্রয়</p><p className="text-lg font-bold">৳{totals.total.toLocaleString("bn-BD")}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">রিফান্ড</p><p className="text-lg font-bold text-red-600">৳{totals.refunded.toLocaleString("bn-BD")}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">নেট বিক্রয়</p><p className="text-lg font-bold text-primary">৳{totals.net.toLocaleString("bn-BD")}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">সাপ্লায়ার রিকভারি</p><p className="text-lg font-bold text-green-600">৳{totals.supplierRecovery.toLocaleString("bn-BD")}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">অসামঞ্জস্য</p><p className="text-lg font-bold text-yellow-600">{totals.mismatches}</p></Card>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">ইনভয়েস</th>
              <th className="text-right p-2">মোট</th>
              <th className="text-right p-2">রিফান্ড</th>
              <th className="text-right p-2">নেট</th>
              <th className="text-center p-2">আইটেম/রিটার্ন</th>
              <th className="text-right p-2">পরিশোধিত</th>
              <th className="text-right p-2">বকেয়া</th>
              <th className="text-center p-2">অবস্থা</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 font-mono">#{r.id.slice(0, 8)}</td>
                <td className="p-2 text-right">৳{r.total.toLocaleString("bn-BD")}</td>
                <td className="p-2 text-right text-red-600">৳{r.refunded.toLocaleString("bn-BD")}</td>
                <td className="p-2 text-right font-semibold">৳{r.netAmount.toLocaleString("bn-BD")}</td>
                <td className="p-2 text-center">{r.itemsQty} / {r.returnedQty}</td>
                <td className="p-2 text-right">৳{r.paid.toLocaleString("bn-BD")}</td>
                <td className="p-2 text-right">৳{r.due.toLocaleString("bn-BD")}</td>
                <td className="p-2 text-center">
                  {r.balanceMismatch ? (
                    <Badge className="bg-red-100 text-red-700 gap-1"><AlertTriangle className="h-3 w-3" /> অসামঞ্জস্য</Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-700 gap-1"><CheckCircle className="h-3 w-3" /> ঠিক</Badge>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">কোনো ডেটা নেই</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
