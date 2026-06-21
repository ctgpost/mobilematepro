import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";

export type RefundMode = "cash" | "due_adjust" | "mixed" | "credit" | "exchange";

export interface SettlementPlan {
  mode: RefundMode;
  due_adjusted: number;
  cash_refunded: number;
  customer_credit: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  refundAmount: number;
  saleDueAmount: number;
  customerName?: string | null;
  customerId?: string | null;
  productName?: string;
  quantity: number;
  loading?: boolean;
  onConfirm: (plan: SettlementPlan) => void;
}

export function RefundSettlementDialog({
  open, onOpenChange, refundAmount, saleDueAmount, customerName, customerId,
  productName, quantity, loading, onConfirm,
}: Props) {
  const hasCustomer = !!customerId;
  const hasDue = saleDueAmount > 0;

  // default: if due exists → mixed, else cash
  const [mode, setMode] = useState<RefundMode>(hasDue ? "mixed" : "cash");
  const [dueAdjusted, setDueAdjusted] = useState(0);
  const [cashRefunded, setCashRefunded] = useState(0);
  const [credit, setCredit] = useState(0);

  useEffect(() => {
    if (!open) return;
    const m: RefundMode = hasDue ? "mixed" : "cash";
    setMode(m);
    recompute(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refundAmount, saleDueAmount]);

  const recompute = (m: RefundMode) => {
    if (m === "cash") {
      setDueAdjusted(0); setCashRefunded(refundAmount); setCredit(0);
    } else if (m === "due_adjust") {
      const adj = Math.min(refundAmount, saleDueAmount);
      setDueAdjusted(adj); setCashRefunded(0); setCredit(0);
    } else if (m === "mixed") {
      const adj = Math.min(refundAmount, saleDueAmount);
      setDueAdjusted(adj); setCashRefunded(refundAmount - adj); setCredit(0);
    } else if (m === "credit") {
      setDueAdjusted(0); setCashRefunded(0); setCredit(refundAmount);
    } else if (m === "exchange") {
      // Full amount becomes store credit usable in next POS sale
      setDueAdjusted(0); setCashRefunded(0); setCredit(refundAmount);
    }
  };

  const handleMode = (m: RefundMode) => { setMode(m); recompute(m); };

  const total = dueAdjusted + cashRefunded + credit;
  const valid = Math.abs(total - refundAmount) < 0.01
    && dueAdjusted >= 0 && cashRefunded >= 0 && credit >= 0
    && dueAdjusted <= saleDueAmount + 0.01;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>রিটার্ন সমন্বয় — কীভাবে ফেরত দেবেন?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3 bg-muted/40 text-sm space-y-1">
            <div className="flex justify-between"><span>পণ্য:</span><span className="font-medium">{productName} × {quantity}</span></div>
            <div className="flex justify-between"><span>গ্রাহক:</span><span className="font-medium">{customerName || "সাধারণ"}</span></div>
            <div className="flex justify-between"><span>রিফান্ড পরিমাণ:</span><span className="font-semibold text-primary">৳{refundAmount.toLocaleString("bn-BD")}</span></div>
            <div className="flex justify-between">
              <span>মূল বিক্রয়ের বাকি:</span>
              <span className={hasDue ? "font-semibold text-destructive" : ""}>৳{saleDueAmount.toLocaleString("bn-BD")}</span>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">সমন্বয় পদ্ধতি</Label>
            <RadioGroup value={mode} onValueChange={(v) => handleMode(v as RefundMode)} className="space-y-2">
              <label className="flex items-start gap-2 border rounded-md p-2 cursor-pointer hover:bg-accent/30">
                <RadioGroupItem value="cash" id="m-cash" />
                <div className="text-sm">
                  <div className="font-medium">নগদ ফেরত</div>
                  <div className="text-xs text-muted-foreground">পুরো টাকা নগদ ফেরত দিন।</div>
                </div>
              </label>
              {hasDue && (
                <label className="flex items-start gap-2 border rounded-md p-2 cursor-pointer hover:bg-accent/30">
                  <RadioGroupItem value="due_adjust" id="m-due" />
                  <div className="text-sm">
                    <div className="font-medium">বাকির সাথে সমন্বয়</div>
                    <div className="text-xs text-muted-foreground">রিফান্ড দিয়ে মূল বিক্রয়ের বাকি কমানো হবে (সর্বোচ্চ ৳{saleDueAmount.toLocaleString("bn-BD")})।</div>
                  </div>
                </label>
              )}
              {hasDue && (
                <label className="flex items-start gap-2 border rounded-md p-2 cursor-pointer hover:bg-accent/30">
                  <RadioGroupItem value="mixed" id="m-mix" />
                  <div className="text-sm">
                    <div className="font-medium">মিশ্র (স্বয়ংক্রিয়)</div>
                    <div className="text-xs text-muted-foreground">আগে বাকি কাটবে, অতিরিক্ত অংশ নগদ ফেরত।</div>
                  </div>
                </label>
              )}
              {hasCustomer && (
                <label className="flex items-start gap-2 border rounded-md p-2 cursor-pointer hover:bg-accent/30">
                  <RadioGroupItem value="credit" id="m-cr" />
                  <div className="text-sm">
                    <div className="font-medium">স্টোর ক্রেডিট</div>
                    <div className="text-xs text-muted-foreground">গ্রাহকের লেজারে ক্রেডিট হিসেবে জমা — পরে যেকোনো বিক্রয়ে ব্যবহারযোগ্য।</div>
                  </div>
                </label>
              )}
              {hasCustomer && (
                <label className="flex items-start gap-2 border rounded-md p-2 cursor-pointer hover:bg-accent/30">
                  <RadioGroupItem value="exchange" id="m-ex" />
                  <div className="text-sm">
                    <div className="font-medium">বিনিময় (Exchange)</div>
                    <div className="text-xs text-muted-foreground">গ্রাহক অন্য পণ্য নেবেন — অনুমোদনের পর POS এ যান, এই টাকা ক্রেডিট থেকে কাটবে।</div>
                  </div>
                </label>
              )}
            </RadioGroup>
          </div>

          {mode !== "exchange" && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">বাকি সমন্বয়</Label>
                <Input type="number" min={0} value={dueAdjusted}
                  onChange={(e) => setDueAdjusted(Number(e.target.value) || 0)}
                  disabled={!hasDue}/>
              </div>
              <div>
                <Label className="text-xs">নগদ ফেরত</Label>
                <Input type="number" min={0} value={cashRefunded}
                  onChange={(e) => setCashRefunded(Number(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-xs">স্টোর ক্রেডিট</Label>
                <Input type="number" min={0} value={credit}
                  onChange={(e) => setCredit(Number(e.target.value) || 0)}
                  disabled={!hasCustomer} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-md bg-muted/40 p-2 text-sm">
            <span>মোট সমন্বয়:</span>
            <span className={valid ? "font-semibold text-primary" : "font-semibold text-destructive"}>
              ৳{total.toLocaleString("bn-BD")} / ৳{refundAmount.toLocaleString("bn-BD")}
            </span>
          </div>

          {mode === "exchange" && (
            <Badge variant="secondary" className="w-full justify-center py-1">অনুমোদনের পর POS এ গিয়ে নতুন পণ্য যোগ করুন</Badge>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>বাতিল</Button>
          <Button
            disabled={!valid || loading}
            onClick={() => onConfirm({
              mode,
              due_adjusted: dueAdjusted,
              cash_refunded: cashRefunded,
              customer_credit: credit,
            })}>
            {loading ? "প্রসেস হচ্ছে..." : "নিশ্চিত করুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
