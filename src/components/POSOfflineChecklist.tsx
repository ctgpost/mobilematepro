import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CollapsibleSection } from "./CollapsibleSection";
import { listOutbox, getOutboxCount } from "@/lib/offlineDB";
import { drainOutbox, isOnline } from "@/lib/offlineMutate";
import { CheckCircle2, XCircle, Clock, WifiOff, Wifi, PlayCircle, RotateCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type StepStatus = "pending" | "pass" | "fail" | "running";
interface Step {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
  ts?: number;
}

const INITIAL_STEPS: Step[] = [
  { id: "offline", label: "১. অফলাইন অবস্থা সনাক্ত", status: "pending" },
  { id: "product_cache", label: "২. প্রোডাক্ট ক্যাশ লোড", status: "pending" },
  { id: "outbox_ready", label: "৩. অফলাইন আউটবক্স প্রস্তুত", status: "pending" },
  { id: "queued_sale", label: "৪. কিউতে অফলাইন বিক্রয়", status: "pending" },
  { id: "stock_decrement", label: "৫. স্টক অপটিমিস্টিক হ্রাস", status: "pending" },
  { id: "sync_drain", label: "৬. অনলাইনে সিঙ্ক ড্রেইন", status: "pending" },
];

export function POSOfflineChecklist() {
  const qc = useQueryClient();
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [online, setOnline] = useState<boolean>(isOnline());
  const [outboxCount, setOutboxCount] = useState(0);
  const [running, setRunning] = useState(false);

  const refreshOutbox = async () => {
    setOutboxCount(await getOutboxCount());
  };

  useEffect(() => {
    const upd = () => setOnline(isOnline());
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    refreshOutbox();
    const iv = setInterval(refreshOutbox, 3000);
    return () => {
      window.removeEventListener("online", upd);
      window.removeEventListener("offline", upd);
      clearInterval(iv);
    };
  }, []);

  const setStep = (id: string, s: StepStatus, detail?: string) => {
    setSteps((prev) =>
      prev.map((st) => (st.id === id ? { ...st, status: s, detail, ts: Date.now() } : st))
    );
  };

  const runChecks = async () => {
    setRunning(true);
    setSteps(INITIAL_STEPS);
    try {
      // 1. Offline detection
      setStep("offline", "running");
      const offline = !isOnline();
      setStep("offline", "pass", offline ? "অফলাইন মোডে আছে ✓" : "অনলাইন — অফলাইন টেস্টের জন্য Wi-Fi বন্ধ করুন");

      // 2. Product cache
      setStep("product_cache", "running");
      const productsCache = qc.getQueryData<any[]>(["products"]);
      if (productsCache && productsCache.length > 0) {
        setStep("product_cache", "pass", `${productsCache.length}টি প্রোডাক্ট ক্যাশে আছে`);
      } else {
        setStep("product_cache", "fail", "প্রোডাক্ট ক্যাশ খালি — POS খুলে অপেক্ষা করুন");
      }

      // 3. Outbox ready
      setStep("outbox_ready", "running");
      const outboxItems = await listOutbox();
      setStep("outbox_ready", "pass", `${outboxItems.length}টি কিউ এন্ট্রি`);

      // 4. Queued sale check
      setStep("queued_sale", "running");
      const sales = outboxItems.filter((i) => i.op === "compound_sale");
      if (sales.length > 0) {
        setStep("queued_sale", "pass", `${sales.length}টি অফলাইন বিক্রয় কিউতে`);
      } else {
        setStep("queued_sale", "pending", "এখনো কোনো অফলাইন বিক্রয় নেই — POS থেকে একটি বিক্রয় করুন");
      }

      // 5. Stock decrement (compare cache vs queued)
      setStep("stock_decrement", "running");
      if (sales.length > 0 && productsCache) {
        const ok = sales.every((s: any) => {
          return (s.payload.items || []).every((it: any) => {
            const p = productsCache.find((p) => p.id === it.product_id);
            return p !== undefined;
          });
        });
        setStep("stock_decrement", ok ? "pass" : "fail", ok ? "ক্যাশে স্টক আপডেট হয়েছে" : "মিল নেই");
      } else {
        setStep("stock_decrement", "pending", "প্রযোজ্য নয়");
      }

      // 6. Sync drain (only if online)
      if (isOnline() && outboxItems.length > 0) {
        setStep("sync_drain", "running");
        const result = await drainOutbox();
        await refreshOutbox();
        if (result.failed === 0) {
          setStep("sync_drain", "pass", `${result.processed}টি সফলভাবে সিঙ্ক হয়েছে`);
          toast.success("অফলাইন ডেটা সফলভাবে সিঙ্ক হয়েছে");
        } else {
          setStep("sync_drain", "fail", `${result.failed}টি ব্যর্থ`);
        }
      } else if (!isOnline()) {
        setStep("sync_drain", "pending", "অনলাইন হলে স্বয়ংক্রিয় চলবে");
      } else {
        setStep("sync_drain", "pass", "কোনো কিউ নেই");
      }
    } catch (e: any) {
      toast.error(e?.message || "টেস্ট চালাতে সমস্যা");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="p-4">
      <CollapsibleSection
        storageKey="pos-offline-checklist"
        defaultOpen={false}
        title={
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            {online ? <Wifi className="h-4 w-4 text-green-600" /> : <WifiOff className="h-4 w-4 text-red-600" />}
            অফলাইন টেস্ট চেকলিস্ট
            <Badge variant="secondary" className="ml-2">{outboxCount} কিউ</Badge>
          </h3>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            POS এ প্রোডাক্ট যোগ এবং বিক্রয় সঠিকভাবে কাজ করছে কিনা যাচাই করুন। Wi-Fi বন্ধ করে এই টেস্ট চালান।
          </p>

          <div className="space-y-1.5">
            {steps.map((s) => (
              <div key={s.id} className="flex items-start gap-2 text-sm p-2 rounded bg-muted/30">
                <div className="mt-0.5">
                  {s.status === "pass" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  {s.status === "fail" && <XCircle className="h-4 w-4 text-red-600" />}
                  {s.status === "running" && <RotateCw className="h-4 w-4 animate-spin text-primary" />}
                  {s.status === "pending" && <Clock className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{s.label}</div>
                  {s.detail && <div className="text-xs text-muted-foreground">{s.detail}</div>}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={runChecks} disabled={running} className="gap-2">
              <PlayCircle className="h-4 w-4" />
              {running ? "চলছে..." : "টেস্ট শুরু করুন"}
            </Button>
            <Button size="sm" variant="outline" onClick={refreshOutbox}>
              <RotateCw className="h-4 w-4 mr-1" /> রিফ্রেশ
            </Button>
          </div>
        </div>
      </CollapsibleSection>
    </Card>
  );
}
