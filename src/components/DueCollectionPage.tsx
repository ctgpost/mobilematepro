import { useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { PageHeader } from "./PageHeader";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DueCollection } from "./DueCollection";
import { format } from "date-fns";
import { bn } from "date-fns/locale";
import { Search, Wallet } from "lucide-react";

export function DueCollectionPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ id: string; due: number; name: string } | null>(null);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["due-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, instant_customer_name, instant_customer_phone, total_amount, paid_amount, due_amount, created_at, customer_id, customers(name, phone)")
        .gt("due_amount", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = sales.filter((s: any) => {
    const q = search.toLowerCase();
    const name = s.customers?.name || s.instant_customer_name || "";
    const phone = s.customers?.phone || s.instant_customer_phone || "";
    return (
      !q ||
      name.toLowerCase().includes(q) ||
      phone.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  });

  const totalDue = filtered.reduce((sum: number, s: any) => sum + Number(s.due_amount || 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        storageKey="due-collection"
        title={<span className="flex items-center gap-2"><Wallet className="w-6 h-6 sm:w-7 sm:h-7 text-accent" /> বাকি আদায়</span>}
        subtitle="পেন্ডিং বাকির তালিকা ও আদায় ব্যবস্থাপনা"
        actions={
          <Card className="px-4 py-2">
            <div className="text-xs text-muted-foreground">মোট বাকি</div>
            <div className="text-xl sm:text-2xl font-bold text-destructive">৳{totalDue.toLocaleString("bn-BD")}</div>
          </Card>
        }
      />

      <CollapsibleSection storageKey="due-filters" title={<h3 className="text-sm font-bold">🔍 সার্চ</h3>}>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="ক্রেতা / ফোন / ইনভয়েস খুঁজুন"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      </CollapsibleSection>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">লোড হচ্ছে...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            কোনো বাকি নেই 🎉
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((s: any) => {
            const name = s.customers?.name || s.instant_customer_name || "অজানা ক্রেতা";
            const phone = s.customers?.phone || s.instant_customer_phone || "—";
            return (
            <Card
              key={s.id}
              className="cursor-pointer hover:border-accent transition-colors"
              onClick={() =>
                setSelected({
                  id: s.id,
                  due: Number(s.due_amount),
                  name,
                })
              }
            >
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="font-semibold">{name}</div>
                  <div className="text-xs text-muted-foreground">
                    {phone} · #{s.id.slice(0, 8)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {format(new Date(s.created_at), "dd MMM yyyy, hh:mm a", { locale: bn })}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">মোট ৳{Number(s.total_amount).toLocaleString("bn-BD")}</div>
                    <Badge variant="destructive" className="mt-1">
                      বাকি ৳{Number(s.due_amount).toLocaleString("bn-BD")}
                    </Badge>
                  </div>
                  <Button size="sm" variant="outline">আদায়</Button>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selected?.name} - বাকি আদায়</DialogTitle>
          </DialogHeader>
          {selected && <DueCollection saleId={selected.id} currentDue={selected.due} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
