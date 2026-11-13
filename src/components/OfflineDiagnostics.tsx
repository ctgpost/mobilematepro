import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Cloud,
  CloudOff,
  Database,
  Download,
  Upload,
  Trash2,
  RefreshCw,
  HardDrive,
  Activity,
  ListChecks,
  Pause,
  Play,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  exportOfflineData,
  importOfflineData,
  clearOfflineCache,
  clearAllOfflineData,
  getStorageEstimate,
  formatBytes,
  getServiceWorkerStatus,
} from "@/lib/offlineExport";
import {
  listOutbox,
  deleteOutbox,
  setOutboxPaused,
  type OutboxItem,
} from "@/lib/offlineDB";
import { drainOutbox, retryOutboxItem } from "@/lib/offlineMutate";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { supabase } from "@/integrations/supabase/client";
import { CollapsibleSection } from "./CollapsibleSection";

const QUOTA_KEY = "offline:quota_threshold";
const AUTO_CLEAR_KEY = "offline:auto_clear_cache";

export function OfflineDiagnostics() {
  const online = useOnlineStatus();
  const [storage, setStorage] = useState({ usage: 0, quota: 0, percent: 0 });
  const [sw, setSw] = useState({
    supported: false,
    registered: false,
    active: false,
    scope: null as string | null,
  });
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [threshold, setThreshold] = useState<number>(() => {
    const v = Number(localStorage.getItem(QUOTA_KEY));
    return Number.isFinite(v) && v > 0 ? v : 80;
  });
  const [autoClear, setAutoClear] = useState<boolean>(
    () => localStorage.getItem(AUTO_CLEAR_KEY) === "1"
  );
  const lastAutoClearRef = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setStorage(await getStorageEstimate());
    setSw(await getServiceWorkerStatus());
    const { data: { session } } = await supabase.auth.getSession();
    setOutbox(session?.user?.id ? await listOutbox(session.user.id) : []);
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  // Auto-clear read cache when threshold exceeded
  useEffect(() => {
    if (!autoClear) return;
    if (storage.percent < threshold) return;
    if (Date.now() - lastAutoClearRef.current < 60_000) return;
    lastAutoClearRef.current = Date.now();
    clearOfflineCache().then(() => {
      toast.info(
        `🧹 স্টোরেজ ${storage.percent.toFixed(0)}% — রিড-ক্যাশ অটো ক্লিয়ার করা হলো`
      );
      refresh();
    });
  }, [storage.percent, threshold, autoClear]);

  const overThreshold = storage.percent >= threshold;

  const handleExport = async () => {
    setBusy(true);
    try {
      await exportOfflineData();
      toast.success("✅ অফলাইন ডাটা এক্সপোর্ট হয়েছে");
    } catch (e: any) {
      toast.error("এক্সপোর্ট ব্যর্থ: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (file: File) => {
    setBusy(true);
    try {
      const r = await importOfflineData(file);
      toast.success(
        `✅ ইম্পোর্ট সফল — ${r.outboxCount}টি queue item, cache ${r.cacheRestored ? "restored" : "skipped"}`
      );
      await refresh();
    } catch (e: any) {
      toast.error("ইম্পোর্ট ব্যর্থ: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleClearCache = async () => {
    if (!confirm("ক্যাশ মুছতে চান? Queue করা পরিবর্তন রক্ষিত থাকবে।")) return;
    setBusy(true);
    try {
      await clearOfflineCache();
      toast.success("✅ ক্যাশ মুছে ফেলা হয়েছে (queue অক্ষত)");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("⚠️ সব অফলাইন ডাটা ও queue মুছতে চান? এই কাজ ফেরত আনা যাবে না।")) return;
    setBusy(true);
    try {
      await clearAllOfflineData();
      toast.success("সব অফলাইন ডাটা মুছে ফেলা হয়েছে");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    if (!online) {
      toast.error("ইন্টারনেট নেই");
      return;
    }
    setBusy(true);
    try {
      const r = await drainOutbox();
      toast.success(`✅ ${r.processed}টি সিঙ্ক হয়েছে, ${r.failed}টি ব্যর্থ`);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const togglePause = async (it: OutboxItem) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    await setOutboxPaused(it.id!, !it.paused, session.user.id);
    toast.success(it.paused ? "▶ পুনরায় চালু" : "⏸ Pause করা হলো");
    refresh();
  };

  const retryOne = async (it: OutboxItem) => {
    if (!online) return toast.error("ইন্টারনেট নেই");
    const r = await retryOutboxItem(it.id!);
    if (r.ok) toast.success("✅ সফলভাবে সিঙ্ক হয়েছে");
    else toast.error("ব্যর্থ: " + (r.error || ""));
    refresh();
  };

  const cancelOne = async (it: OutboxItem) => {
    if (!confirm(`${it.table}/${it.op} বাতিল করতে চান?`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    await deleteOutbox(it.id!, session.user.id);
    toast.success("বাতিল করা হলো");
    refresh();
  };

  const pauseAll = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    for (const it of outbox) await setOutboxPaused(it.id!, true, session.user.id);
    toast.success("সব Queue Pause করা হলো");
    refresh();
  };

  const resumeAll = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    for (const it of outbox) await setOutboxPaused(it.id!, false, session.user.id);
    toast.success("সব Queue পুনরায় চালু করা হলো");
    refresh();
  };

  const saveThreshold = (v: number) => {
    const n = Math.max(10, Math.min(99, Math.round(v)));
    setThreshold(n);
    localStorage.setItem(QUOTA_KEY, String(n));
  };

  const toggleAutoClear = (v: boolean) => {
    setAutoClear(v);
    localStorage.setItem(AUTO_CLEAR_KEY, v ? "1" : "0");
  };

  return (
    <CollapsibleSection
      title={
        <span className="flex items-center gap-2">
          <Activity className="w-5 h-5" /> অফলাইন ডায়াগনস্টিকস ও ম্যানেজমেন্ট
        </span>
      }
      defaultOpen={false}
    >
      <div className="space-y-4">
        {/* Status row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {online ? (
                <Cloud className="w-4 h-4 text-green-600" />
              ) : (
                <CloudOff className="w-4 h-4 text-destructive" />
              )}
              নেটওয়ার্ক
            </div>
            <div className="text-lg font-semibold mt-1">
              {online ? "অনলাইন" : "অফলাইন"}
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="w-4 h-4" />
              Service Worker
            </div>
            <div className="text-sm font-semibold mt-1 flex items-center gap-1">
              {!sw.supported ? (
                <Badge variant="secondary">Unsupported</Badge>
              ) : sw.active ? (
                <Badge className="bg-green-600">Active</Badge>
              ) : sw.registered ? (
                <Badge variant="secondary">Registered</Badge>
              ) : (
                <Badge variant="outline">Not registered</Badge>
              )}
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ListChecks className="w-4 h-4" />
              Queue Length
            </div>
            <div className="text-lg font-semibold mt-1">{outbox.length}</div>
          </Card>

          <Card className={`p-3 ${overThreshold ? "border-destructive" : ""}`}>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <HardDrive className="w-4 h-4" />
              Storage
              {overThreshold && (
                <AlertTriangle className="w-3 h-3 text-destructive" />
              )}
            </div>
            <div className="text-sm font-semibold mt-1">
              {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
            </div>
            <Progress value={storage.percent} className="h-1 mt-2" />
            <div className="text-[10px] text-muted-foreground mt-1">
              {storage.percent.toFixed(1)}% ব্যবহৃত
            </div>
          </Card>
        </div>

        {/* Threshold warning */}
        {overThreshold && (
          <Card className="p-3 border-destructive bg-destructive/5">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4" />
              ⚠️ স্টোরেজ {storage.percent.toFixed(0)}% পূর্ণ — রিড-ক্যাশ ক্লিয়ার
              করার পরামর্শ দেওয়া হচ্ছে।
            </div>
          </Card>
        )}

        {/* Quota settings */}
        <Card className="p-4">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
            <HardDrive className="w-4 h-4" /> স্টোরেজ কোটা সেটিংস
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="quota-threshold" className="text-xs">
                সতর্কতা থ্রেশহোল্ড (%)
              </Label>
              <Input
                id="quota-threshold"
                type="number"
                min={10}
                max={99}
                value={threshold}
                onChange={(e) => saveThreshold(Number(e.target.value))}
                className="w-20"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="auto-clear"
                checked={autoClear}
                onCheckedChange={toggleAutoClear}
              />
              <Label htmlFor="auto-clear" className="text-xs">
                থ্রেশহোল্ড অতিক্রম হলে অটো রিড-ক্যাশ ক্লিয়ার (queue অক্ষত)
              </Label>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <Card className="p-4">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Database className="w-4 h-4" /> ডাটা ম্যানেজমেন্ট
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSync} disabled={busy || !online} size="sm">
              <RefreshCw className="w-4 h-4 mr-1" /> এখনই সিঙ্ক
            </Button>
            {outbox.length > 0 &&
              (outbox.every((i) => i.paused) ? (
                <Button onClick={resumeAll} disabled={busy} variant="outline" size="sm">
                  <Play className="w-4 h-4 mr-1" /> সব Resume
                </Button>
              ) : (
                <Button onClick={pauseAll} disabled={busy} variant="outline" size="sm">
                  <Pause className="w-4 h-4 mr-1" /> সব Pause
                </Button>
              ))}
            <Button onClick={handleExport} disabled={busy} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-1" /> এক্সপোর্ট (JSON)
            </Button>
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              variant="outline"
              size="sm"
            >
              <Upload className="w-4 h-4 mr-1" /> ইম্পোর্ট
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }}
            />
            <Button onClick={handleClearCache} disabled={busy} variant="outline" size="sm">
              <Trash2 className="w-4 h-4 mr-1" /> ক্যাশ মুছুন (queue রাখুন)
            </Button>
            <Button onClick={handleClearAll} disabled={busy} variant="destructive" size="sm">
              <Trash2 className="w-4 h-4 mr-1" /> সব মুছুন
            </Button>
          </div>
        </Card>

        {/* Outbox preview */}
        {outbox.length > 0 && (
          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">
              পেন্ডিং Queue ({outbox.length})
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1 text-xs">
              {outbox.slice(0, 100).map((it) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between gap-2 border-b border-border/40 py-1.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {it.op}
                      </Badge>
                      <span className="font-medium truncate">{it.table}</span>
                      {it.paused && (
                        <Badge variant="secondary" className="text-[10px]">
                          Paused
                        </Badge>
                      )}
                      {it.retryCount > 0 && (
                        <span className="text-muted-foreground">↻ {it.retryCount}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(it.createdAt).toLocaleString("bn-BD")}
                      {it.lastError && (
                        <span className="text-destructive ml-2">⚠ {it.lastError.slice(0, 60)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      onClick={() => togglePause(it)}
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title={it.paused ? "Resume" : "Pause"}
                    >
                      {it.paused ? (
                        <Play className="w-3.5 h-3.5" />
                      ) : (
                        <Pause className="w-3.5 h-3.5" />
                      )}
                    </Button>
                    <Button
                      onClick={() => retryOne(it)}
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={!online}
                      title="Retry now"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      onClick={() => cancelOne(it)}
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      title="বাতিল"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </CollapsibleSection>
  );
}
