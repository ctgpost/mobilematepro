import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { bn, enUS } from "date-fns/locale";
import { useLanguage } from "@/components/LanguageProvider";

interface DueCollectionProps {
  saleId: string;
  currentDue: number;
}

export function DueCollection({ saleId, currentDue }: DueCollectionProps) {
  const { language } = useLanguage();
  const dateLocale = language === "bn" ? bn : enUS;
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");

  const { data: payments } = useQuery({
    queryKey: ["due-payments", saleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("due_payments")
        .select("*")
        .eq("sale_id", saleId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const collectMutation = useMutation({
    mutationFn: async () => {
      const collectAmount = Number(amount);
      if (collectAmount <= 0 || collectAmount > currentDue) {
        throw new Error("অবৈধ পরিমাণ");
      }

      const { data: { user } } = await supabase.auth.getUser();

      const { data: newDue, error } = await supabase.rpc("collect_sale_due", {
        p_sale_id: saleId,
        p_amount: collectAmount,
        p_payment_method: paymentMethod,
        p_notes: notes || null,
      });
      if (error) throw error;
      return newDue;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["due-payments", saleId] });
      toast.success("বাকি আদায় সফল হয়েছে!");
      setAmount("");
      setNotes("");
    },
    onError: (err: any) => toast.error(err.message || "বাকি আদায় ব্যর্থ"),
  });

  if (currentDue <= 0) return null;

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-destructive">💳 বাকি আদায়</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder={`সর্বোচ্চ ৳${currentDue}`}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="flex-1 h-8 text-sm"
            max={currentDue}
          />
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">নগদ</SelectItem>
              <SelectItem value="card">কার্ড</SelectItem>
              <SelectItem value="mobile">মোবাইল</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Textarea placeholder="নোটস (ঐচ্ছিক)" value={notes} onChange={e => setNotes(e.target.value)} className="text-xs h-16" />
        <Button
          size="sm"
          className="w-full"
          onClick={() => collectMutation.mutate()}
          disabled={!amount || Number(amount) <= 0 || Number(amount) > currentDue || collectMutation.isPending}
        >
          {collectMutation.isPending ? "প্রক্রিয়াকরণ..." : "বাকি আদায় করুন"}
        </Button>

        {/* Payment History */}
        {payments && payments.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs font-medium mb-2 text-muted-foreground">আদায়ের ইতিহাস:</p>
            {payments.map(p => (
              <div key={p.id} className="flex justify-between items-center text-xs py-1">
                <span className="text-muted-foreground">
                  {format(new Date(p.created_at), 'dd MMM yyyy, hh:mm a', { locale: dateLocale })}
                </span>
                <span className="font-semibold text-accent">৳{Number(p.amount).toLocaleString('bn-BD')}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
