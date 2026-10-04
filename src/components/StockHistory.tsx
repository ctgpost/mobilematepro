import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fetchAll } from "@/lib/fetchAll";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw } from "lucide-react";

const TYPE_LABEL: Record<string, string> = {
  add: "যোগ",
  update: "আপডেট",
  sale: "বিক্রি",
  return: "রিটার্ন",
};

type Movement = {
  id: string;
  product_id: string;
  product_name: string | null;
  imei: string | null;
  movement_type: string;
  reason: string | null;
  ref_id: string | null;
  old_quantity: number;
  new_quantity: number;
  change: number;
  created_at: string;
};

const fmtTime = (d: string) => format(new Date(d), "dd/MM/yyyy hh:mm a");

export function StockHistory() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");

  const movementsQ = useQuery({
    queryKey: ["stock-movements"],
    queryFn: () =>
      fetchAll<Movement>("stock_movements", "*", (q) => q.order("created_at", { ascending: false })),
  });

  const movements = movementsQ.data || [];
  const trackingStart = movements.length
    ? movements[movements.length - 1].created_at
    : null;

  const reconQ = useQuery({
    queryKey: ["stock-movements", "recon", trackingStart],
    enabled: !!trackingStart,
    queryFn: async () => {
      const [items, products] = await Promise.all([
        fetchAll<any>("sale_items", "id, sale_id, product_id, quantity, created_at, sales(created_at)", (q) =>
          q.gte("created_at", trackingStart!).order("created_at", { ascending: false })
        ),
        fetchAll<any>("products", "id, name, imei, stock_quantity"),
      ]);
      return { items, products };
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return movements.filter(
      (m) =>
        (type === "all" || m.movement_type === type) &&
        (!s ||
          m.product_name?.toLowerCase().includes(s) ||
          m.imei?.includes(s) ||
          m.reason?.toLowerCase().includes(s))
    );
  }, [movements, search, type]);

  const issues = useMemo(() => {
    if (!reconQ.data) return null;
    const { items, products } = reconQ.data;
    const prodMap = new Map(products.map((p: any) => [p.id, p]));

    // 1) Sold items with no matching stock deduction
    const deducted = new Map<string, number>();
    movements
      .filter((m) => m.movement_type === "sale" && m.ref_id)
      .forEach((m) => {
        const k = `${m.ref_id}|${m.product_id}`;
        deducted.set(k, (deducted.get(k) || 0) + -m.change);
      });
    const soldBy = new Map<string, any>();
    items.forEach((it: any) => {
      const k = `${it.sale_id}|${it.product_id}`;
      const cur = soldBy.get(k) || { ...it, quantity: 0 };
      cur.quantity += it.quantity;
      soldBy.set(k, cur);
    });
    const saleMismatch: any[] = [];
    soldBy.forEach((it, k) => {
      const d = deducted.get(k) || 0;
      if (d !== it.quantity) {
        const p: any = prodMap.get(it.product_id);
        saleMismatch.push({
          ...it,
          name: p?.name || "(অজানা)",
          imei: p?.imei,
          deducted: d,
          stock: p?.stock_quantity,
        });
      }
    });

    // 2) Current stock differs from last recorded movement
    const latest = new Map<string, Movement>();
    movements.forEach((m) => {
      if (!latest.has(m.product_id)) latest.set(m.product_id, m);
    });
    const ledgerMismatch: any[] = [];
    latest.forEach((m, pid) => {
      const p: any = prodMap.get(pid);
      if (p && p.stock_quantity !== m.new_quantity) {
        ledgerMismatch.push({ ...p, recorded: m.new_quantity, at: m.created_at });
      }
    });
    const negative = products.filter((p: any) => p.stock_quantity < 0);
    return { saleMismatch, ledgerMismatch, negative, saleCount: soldBy.size };
  }, [reconQ.data, movements]);

  const refresh = () => {
    movementsQ.refetch();
    reconQ.refetch();
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">স্টক ইতিহাস ও মিলকরণ</h1>
          <p className="text-sm text-muted-foreground">প্রতিটি পণ্যের স্টক পরিবর্তন এবং বিক্রির সাথে মিল যাচাই</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={movementsQ.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${movementsQ.isFetching ? "animate-spin" : ""}`} /> রিফ্রেশ
        </Button>
      </div>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">স্টক ইতিহাস</TabsTrigger>
          <TabsTrigger value="recon">
            মিলকরণ রিপোর্ট
            {issues && issues.saleMismatch.length + issues.ledgerMismatch.length + issues.negative.length > 0 && (
              <span className="ml-2 h-2 w-2 rounded-full bg-destructive inline-block" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="পণ্যের নাম, IMEI বা কারণ দিয়ে খুঁজুন" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">সব ধরন</SelectItem>
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {movementsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">লোড হচ্ছে...</p>
          ) : filtered.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground text-sm">
              এখনও কোনো স্টক পরিবর্তন রেকর্ড হয়নি। এখন থেকে যোগ, আপডেট, বিক্রি ও রিটার্ন স্বয়ংক্রিয়ভাবে এখানে দেখাবে।
            </Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">সময়</th>
                    <th className="text-left p-2">পণ্য</th>
                    <th className="text-left p-2">ধরন</th>
                    <th className="text-left p-2">কারণ</th>
                    <th className="text-right p-2">আগে</th>
                    <th className="text-right p-2">পরিবর্তন</th>
                    <th className="text-right p-2">পরে</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 500).map((m) => (
                    <tr key={m.id} className="border-t border-border">
                      <td className="p-2 whitespace-nowrap">{fmtTime(m.created_at)}</td>
                      <td className="p-2">
                        <div className="font-medium text-foreground">{m.product_name}</div>
                        {m.imei && <div className="text-xs text-muted-foreground">IMEI: {m.imei}</div>}
                      </td>
                      <td className="p-2">{TYPE_LABEL[m.movement_type] || m.movement_type}</td>
                      <td className="p-2">
                        {m.reason}
                        {m.ref_id && <div className="text-xs text-muted-foreground">#{m.ref_id.slice(0, 8)}</div>}
                      </td>
                      <td className="p-2 text-right">{m.old_quantity}</td>
                      <td className={`p-2 text-right font-semibold ${m.change < 0 ? "text-destructive" : "text-primary"}`}>
                        {m.change > 0 ? `+${m.change}` : m.change}
                      </td>
                      <td className="p-2 text-right">{m.new_quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 500 && (
                <p className="p-2 text-xs text-muted-foreground">প্রথম ৫০০টি দেখানো হচ্ছে — খুঁজে সংকুচিত করুন।</p>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="recon" className="space-y-3">
          {!trackingStart ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              ইতিহাস রেকর্ড শুরু হলে মিলকরণ রিপোর্ট দেখাবে।
            </Card>
          ) : !issues ? (
            <p className="text-sm text-muted-foreground">যাচাই করা হচ্ছে...</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {fmtTime(trackingStart)} থেকে {issues.saleCount}টি বিক্রির পণ্য যাচাই করা হয়েছে।
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="p-4"><p className="text-xs text-muted-foreground">স্টক না কমা বিক্রি</p><p className="text-2xl font-bold">{issues.saleMismatch.length}</p></Card>
                <Card className="p-4"><p className="text-xs text-muted-foreground">রেকর্ডের সাথে স্টক অমিল</p><p className="text-2xl font-bold">{issues.ledgerMismatch.length}</p></Card>
                <Card className="p-4"><p className="text-xs text-muted-foreground">নেগেটিভ স্টক</p><p className="text-2xl font-bold">{issues.negative.length}</p></Card>
              </div>

              {issues.saleMismatch.length + issues.ledgerMismatch.length + issues.negative.length === 0 && (
                <Card className="p-6 text-center text-sm text-primary font-medium">✅ সব বিক্রি ও স্টক মিলে গেছে।</Card>
              )}

              {issues.saleMismatch.length > 0 && (
                <Card className="p-4 space-y-2">
                  <h3 className="font-semibold text-foreground">বিক্রি হয়েছে কিন্তু স্টক সঠিকভাবে কমেনি</h3>
                  {issues.saleMismatch.map((i: any) => (
                    <div key={`${i.sale_id}${i.product_id}`} className="text-sm border-t border-border pt-2">
                      <span className="font-medium">{i.name}</span>
                      {i.imei && <span className="text-muted-foreground"> · IMEI {i.imei}</span>}
                      <div className="text-xs text-muted-foreground">
                        বিক্রি #{i.sale_id.slice(0, 8)} · {fmtTime(i.created_at)} · বিক্রি {i.quantity}, কমেছে {i.deducted}, বর্তমান স্টক {i.stock ?? "-"}
                      </div>
                    </div>
                  ))}
                </Card>
              )}

              {issues.ledgerMismatch.length > 0 && (
                <Card className="p-4 space-y-2">
                  <h3 className="font-semibold text-foreground">বর্তমান স্টক শেষ রেকর্ডের সাথে মিলছে না</h3>
                  {issues.ledgerMismatch.map((p: any) => (
                    <div key={p.id} className="text-sm border-t border-border pt-2">
                      <span className="font-medium">{p.name}</span>
                      <div className="text-xs text-muted-foreground">রেকর্ড {p.recorded} ({fmtTime(p.at)}) · বর্তমান {p.stock_quantity}</div>
                    </div>
                  ))}
                </Card>
              )}

              {issues.negative.length > 0 && (
                <Card className="p-4 space-y-2">
                  <h3 className="font-semibold text-foreground">নেগেটিভ স্টক</h3>
                  {issues.negative.map((p: any) => (
                    <div key={p.id} className="text-sm border-t border-border pt-2">{p.name} · {p.stock_quantity}</div>
                  ))}
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
