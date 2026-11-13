import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { CollapsibleCard } from "./CollapsibleCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  ALL_TABLES,
  TableKey,
  generateFullBackup,
  downloadBlob,
  uploadBackupToCloudinary,
} from "@/lib/backupExport";
import {
  fetchBackupZip,
  analyzeBackup,
  restoreFromZip,
  logRestoreRun,
  BackupAnalysis,
  analyzeJsonFiles,
  restoreFromJsonGroups,
  JsonGroup,
  MultiFileAnalysis,
} from "@/lib/backupRestore";
import { Switch } from "@/components/ui/switch";
import {
  Cloud,
  Download,
  History,
  RefreshCw,
  RotateCcw,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  Upload,
  FileJson,
  X,
  ChevronRight,
} from "lucide-react";

interface CloudResource {
  public_id: string;
  filename: string;
  created_at: string;
  bytes: number;
  secure_url: string;
  format?: string;
}

interface HistoryRow {
  id: string;
  ran_at: string;
  user_email: string | null;
  tables: string[];
  counts: Record<string, number>;
  total_records: number;
  download_ok: boolean;
  cloud_ok: boolean;
  cloud_url: string | null;
  filename: string | null;
  trigger_type: string;
  error: string | null;
}

const TABLE_LABEL: Record<string, string> = Object.fromEntries(
  ALL_TABLES.map((t) => [t.key, t.label]),
);

interface RestoreRow {
  id: string;
  ran_at: string;
  user_email: string | null;
  source_filename: string | null;
  source_url: string | null;
  tables: string[];
  results: Array<{ table: string; inserted: number; updated: number; processed: number; error?: string }>;
  total_processed: number;
  pre_backup_url: string | null;
  success: boolean;
  error: string | null;
}

function formatBytes(b: number) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export function BackupHistory() {
  const [tab, setTab] = useState<"log" | "cloud" | "restore">("log");

  // Local DB log
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [restoreLog, setRestoreLog] = useState<RestoreRow[]>([]);
  const [loadingRestoreLog, setLoadingRestoreLog] = useState(false);

  // Cloudinary list
  const [cloud, setCloud] = useState<CloudResource[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Restore state
  const [restoreUrl, setRestoreUrl] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<string>("");
  const [analysis, setAnalysis] = useState<BackupAnalysis | null>(null);
  const [selectedTables, setSelectedTables] = useState<TableKey[]>([]);
  const [analysing, setAnalysing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [preBackup, setPreBackup] = useState(true);

  // JSON restore state (multi-file)
  const [jsonDialog, setJsonDialog] = useState(false);
  const [jsonFiles, setJsonFiles] = useState<File[]>([]);
  const [jsonMulti, setJsonMulti] = useState<MultiFileAnalysis | null>(null);
  const [jsonAnalysing, setJsonAnalysing] = useState(false);
  const [jsonSelected, setJsonSelected] = useState<Set<TableKey>>(new Set());
  const [jsonBusy, setJsonBusy] = useState(false);
  const [jsonPreBackup, setJsonPreBackup] = useState(true);
  const [jsonExpanded, setJsonExpanded] = useState<Set<string>>(new Set());
  const [jsonManualMap, setJsonManualMap] = useState<Record<string, TableKey>>({});

  const loadHistory = async () => {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from("backup_history")
      .select("*")
      .order("ran_at", { ascending: false })
      .limit(100);
    if (error) {
      toast.error("ইতিহাস লোড ব্যর্থ");
    } else {
      setHistory((data as any) || []);
    }
    setLoadingHistory(false);
  };

  const loadRestoreLog = async () => {
    setLoadingRestoreLog(true);
    const { data, error } = await supabase
      .from("restore_history" as any)
      .select("*")
      .order("ran_at", { ascending: false })
      .limit(100);
    if (error) {
      toast.error("পুনরুদ্ধার লগ লোড ব্যর্থ");
    } else {
      setRestoreLog((data as any) || []);
    }
    setLoadingRestoreLog(false);
  };

  const loadCloud = async (append = false, cursor: string | null = null) => {
    if (append) setLoadingMore(true);
    else setLoadingCloud(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "cloudinary-list-backups",
        {
          body: {
            prefix: "mobile-mate-pro-backups",
            max_results: 100,
            next_cursor: cursor || undefined,
          },
        },
      );
      if (error) throw error;
      const newResources = data?.resources || [];
      setCloud((prev) => (append ? [...prev, ...newResources] : newResources));
      setNextCursor(data?.next_cursor || null);
    } catch (e: any) {
      toast.error(e?.message || "ক্লাউড তালিকা লোড ব্যর্থ");
    } finally {
      setLoadingCloud(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (tab === "cloud" && cloud.length === 0) loadCloud(false, null);
    if (tab === "restore" && restoreLog.length === 0) loadRestoreLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filteredCloud = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cloud;
    return cloud.filter(
      (r) =>
        r.filename.toLowerCase().includes(q) ||
        r.public_id.toLowerCase().includes(q) ||
        r.created_at.toLowerCase().includes(q),
    );
  }, [cloud, search]);

  const openRestore = async (url: string, filename: string) => {
    setRestoreUrl(url);
    setRestoreFile(filename);
    setAnalysing(true);
    setAnalysis(null);
    setSelectedTables([]);
    try {
      const zip = await fetchBackupZip(url);
      const a = await analyzeBackup(zip);
      setAnalysis(a);
      setSelectedTables(a.present.filter((p) => p.count > 0).map((p) => p.table));
    } catch (e: any) {
      toast.error(e?.message || "ZIP পড়া ব্যর্থ");
      setRestoreUrl(null);
    } finally {
      setAnalysing(false);
    }
  };

  const performRestore = async () => {
    if (!restoreUrl || selectedTables.length === 0) return;
    setRestoring(true);
    const t = toast.loading("পুনরুদ্ধার চলছে...");
    let preBackupUrl: string | null = null;
    let runErr: string | null = null;
    let results: Awaited<ReturnType<typeof restoreFromZip>> = [];
    try {
      if (preBackup) {
        toast.loading("পুনরুদ্ধারের আগে ব্যাকআপ তৈরি হচ্ছে...", { id: t });
        try {
          const r = await generateFullBackup({ tables: selectedTables });
          downloadBlob(r.zipBlob, `pre-restore-backup-${r.timestamp}.zip`);
          preBackupUrl = await uploadBackupToCloudinary(
            r.zipBlob,
            `pre-restore-backup-${r.timestamp}.zip`,
          );
        } catch (e) {
          console.warn("pre-restore backup failed", e);
          toast.warning("আগের ব্যাকআপ তৈরি ব্যর্থ — পুনরুদ্ধার চলবে");
        }
      }

      toast.loading("ZIP ডাউনলোড হচ্ছে...", { id: t });
      const zip = await fetchBackupZip(restoreUrl);
      results = await restoreFromZip(zip, selectedTables, {
        onProgress: (msg) => toast.loading(msg, { id: t }),
      });
      const okCount = results.filter((r) => !r.error).length;
      const inserted = results.reduce((s, r) => s + r.inserted, 0);
      const updated = results.reduce((s, r) => s + r.updated, 0);
      const failed = results.filter((r) => r.error);
      if (failed.length === 0) {
        toast.success(
          `✅ পুনরুদ্ধার: ${okCount} টেবিল • নতুন: ${inserted} • আপডেট: ${updated}`,
          { id: t, duration: 8000 },
        );
      } else {
        runErr = `Failed: ${failed.map((f) => f.table).join(", ")}`;
        toast.error(
          `আংশিক: ${okCount}/${results.length} ঠিক, ব্যর্থ: ${failed.map((f) => f.table).join(", ")}`,
          { id: t, duration: 10000 },
        );
      }
      setRestoreUrl(null);
    } catch (e: any) {
      runErr = e?.message || "পুনরুদ্ধার ব্যর্থ";
      toast.error(runErr, { id: t });
    } finally {
      await logRestoreRun({
        source_url: restoreUrl!,
        source_filename: restoreFile,
        tables: selectedTables,
        results,
        pre_backup_url: preBackupUrl,
        error: runErr,
      });
      setRestoring(false);
    }
  };

  const toggleTable = (k: TableKey) =>
    setSelectedTables((s) =>
      s.includes(k) ? s.filter((x) => x !== k) : [...s, k],
    );

  // ---------- JSON upload restore (multi-file) ----------
  const resetJsonState = () => {
    setJsonFiles([]);
    setJsonMulti(null);
    setJsonSelected(new Set());
    setJsonExpanded(new Set());
    setJsonManualMap({});
  };

  const runJsonAnalysis = async (files: File[]) => {
    if (!files.length) {
      setJsonMulti(null);
      setJsonSelected(new Set());
      return;
    }
    setJsonAnalysing(true);
    try {
      const m = await analyzeJsonFiles(files);
      setJsonMulti(m);
      setJsonSelected(new Set(m.merged.map((g) => g.table)));
      if (!m.merged.length && !m.unknown.length) {
        toast.warning("কোন পরিচিত টেবিল ম্যাচ হয়নি");
      }
    } catch (e: any) {
      toast.error(e?.message || "JSON বিশ্লেষণ ব্যর্থ");
    } finally {
      setJsonAnalysing(false);
    }
  };

  const handleJsonPick = async (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files).filter((f) => /\.json$/i.test(f.name));
    if (!arr.length) {
      toast.error("শুধু .json ফাইল অনুমোদিত");
      return;
    }
    // Append (avoid duplicates by name+size)
    const merged = [...jsonFiles];
    for (const f of arr) {
      if (!merged.some((x) => x.name === f.name && x.size === f.size)) merged.push(f);
    }
    setJsonFiles(merged);
    await runJsonAnalysis(merged);
  };

  const removeJsonFile = async (name: string, size: number) => {
    const next = jsonFiles.filter((f) => !(f.name === name && f.size === size));
    setJsonFiles(next);
    await runJsonAnalysis(next);
  };

  const toggleJsonTable = (k: TableKey) =>
    setJsonSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const toggleJsonExpand = (key: string) =>
    setJsonExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const performJsonRestore = async () => {
    if (!jsonMulti) return;
    // Merged groups selected by user
    const chosen: JsonGroup[] = jsonMulti.merged
      .filter((m) => jsonSelected.has(m.table))
      .map((m) => ({
        table: m.table,
        rows: m.rows,
        confidence: m.confidences[0] || "fingerprint",
        sourceFiles: m.sources,
      }));

    // Add manually-mapped unknown rows
    for (const u of jsonMulti.unknown) {
      const target = jsonManualMap[u.file];
      if (target) {
        const existing = chosen.find((c) => c.table === target);
        if (existing) existing.rows.push(...u.rows);
        else
          chosen.push({
            table: target,
            rows: [...u.rows],
            confidence: "manual",
            sourceFiles: [u.file],
          });
      }
    }

    if (!chosen.length) {
      toast.error("পুনরুদ্ধারের জন্য কোন টেবিল নির্বাচিত হয়নি");
      return;
    }

    setJsonBusy(true);
    const t = toast.loading("JSON পুনরুদ্ধার চলছে...");
    let preBackupUrl: string | null = null;
    let runErr: string | null = null;
    let results: Awaited<ReturnType<typeof restoreFromJsonGroups>> = [];
    const fileNames = jsonFiles.map((f) => f.name).join(", ");
    try {
      if (jsonPreBackup) {
        toast.loading("পুনরুদ্ধারের আগে ব্যাকআপ তৈরি হচ্ছে...", { id: t });
        try {
          const r = await generateFullBackup({
            tables: chosen.map((g) => g.table),
          });
          downloadBlob(r.zipBlob, `pre-json-restore-${r.timestamp}.zip`);
          preBackupUrl = await uploadBackupToCloudinary(
            r.zipBlob,
            `pre-json-restore-${r.timestamp}.zip`,
          );
        } catch (e) {
          console.warn("pre-restore backup failed", e);
          toast.warning("আগের ব্যাকআপ তৈরি ব্যর্থ — পুনরুদ্ধার চলবে");
        }
      }

      results = await restoreFromJsonGroups(chosen, {
        onProgress: (msg) => toast.loading(msg, { id: t }),
      });
      const ins = results.reduce((s, r) => s + r.inserted, 0);
      const upd = results.reduce((s, r) => s + r.updated, 0);
      const failed = results.filter((r) => r.error);
      if (failed.length === 0) {
        toast.success(
          `✅ JSON পুনরুদ্ধার: ${results.length} টেবিল • নতুন: ${ins} • আপডেট: ${upd}`,
          { id: t, duration: 8000 },
        );
        setJsonDialog(false);
        resetJsonState();
      } else {
        runErr = `Failed: ${failed.map((f) => f.table).join(", ")}`;
        toast.error(
          `আংশিক: ব্যর্থ ${failed.map((f) => f.table).join(", ")}`,
          { id: t, duration: 10000 },
        );
      }
    } catch (e: any) {
      runErr = e?.message || "JSON পুনরুদ্ধার ব্যর্থ";
      toast.error(runErr, { id: t });
    } finally {
      await logRestoreRun({
        source_url: "json-upload://" + fileNames,
        source_filename: fileNames || "unknown.json",
        tables: chosen.map((g) => g.table),
        results,
        pre_backup_url: preBackupUrl,
        error: runErr,
      });
      setJsonBusy(false);
      loadRestoreLog();
    }
  };

  return (
    <CollapsibleCard
      className="mt-4"
      storageKey="backup-history"
      title={
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <History className="h-5 w-5" /> ব্যাকআপ ইতিহাস ও পুনরুদ্ধার
        </h2>
      }
      actions={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={() => {
              resetJsonState();
              setJsonDialog(true);
            }}
          >
            <FileJson className="h-4 w-4 mr-1" /> JSON থেকে পুনরুদ্ধার
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              loadHistory();
              if (tab === "cloud") loadCloud(false, null);
              if (tab === "restore") loadRestoreLog();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> রিফ্রেশ
          </Button>
        </div>
      }
    >

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="log">
            <History className="h-4 w-4 mr-1" /> রান লগ
          </TabsTrigger>
          <TabsTrigger value="cloud">
            <Cloud className="h-4 w-4 mr-1" /> ক্লাউড ফাইল
          </TabsTrigger>
          <TabsTrigger value="restore">
            <RotateCcw className="h-4 w-4 mr-1" /> পুনরুদ্ধার লগ
          </TabsTrigger>
        </TabsList>

        {/* History */}
        <TabsContent value="log" className="mt-4">
          {loadingHistory ? (
            <p className="text-sm text-muted-foreground">লোড হচ্ছে...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">এখনও কোন ব্যাকআপ চালানো হয়নি</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>সময়</TableHead>
                    <TableHead>ট্রিগার</TableHead>
                    <TableHead>টেবিল</TableHead>
                    <TableHead className="text-right">রেকর্ড</TableHead>
                    <TableHead>ডাউনলোড</TableHead>
                    <TableHead>ক্লাউড</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(h.ran_at).toLocaleString("bn-BD")}
                        {h.user_email && (
                          <div className="text-muted-foreground">{h.user_email}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={h.trigger_type === "auto" ? "secondary" : "outline"}>
                          {h.trigger_type === "auto" ? "অটো" : "ম্যানুয়াল"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {(h.tables || []).slice(0, 4).map((t) => (
                            <Badge key={t} variant="outline" className="text-[10px]">
                              {TABLE_LABEL[t] || t}
                            </Badge>
                          ))}
                          {h.tables && h.tables.length > 4 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{h.tables.length - 4}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {h.total_records.toLocaleString("bn-BD")}
                      </TableCell>
                      <TableCell>
                        {h.download_ok ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </TableCell>
                      <TableCell>
                        {h.cloud_ok ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {h.cloud_url && (
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => window.open(h.cloud_url!, "_blank")}
                              title="ডাউনলোড"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                openRestore(h.cloud_url!, h.filename || "backup.zip")
                              }
                              title="পুনরুদ্ধার"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Cloudinary */}
        <TabsContent value="cloud" className="mt-4 space-y-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ফাইলনাম বা তারিখ অনুসারে খুঁজুন..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => loadCloud(false, null)} disabled={loadingCloud}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loadingCloud ? "animate-spin" : ""}`} />
              রিফ্রেশ
            </Button>
          </div>

          {loadingCloud ? (
            <p className="text-sm text-muted-foreground">ক্লাউড থেকে লোড হচ্ছে...</p>
          ) : filteredCloud.length === 0 ? (
            <p className="text-sm text-muted-foreground">কোন ব্যাকআপ ফাইল পাওয়া যায়নি</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ফাইলনাম</TableHead>
                    <TableHead>আপলোড সময়</TableHead>
                    <TableHead className="text-right">আকার</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCloud.map((r) => (
                    <TableRow key={r.public_id}>
                      <TableCell className="text-xs break-all">{r.filename}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString("bn-BD")}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatBytes(r.bytes)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(r.secure_url, "_blank")}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openRestore(r.secure_url, r.filename)}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" /> পুনরুদ্ধার
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {nextCursor && (
                <div className="flex justify-center mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadCloud(true, nextCursor)}
                    disabled={loadingMore}
                  >
                    <ChevronDown className={`h-4 w-4 mr-1 ${loadingMore ? "animate-bounce" : ""}`} />
                    {loadingMore ? "লোড হচ্ছে..." : "আরো লোড করুন"}
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center mt-2">
                {filteredCloud.length} টি ফাইল দেখানো হচ্ছে
              </p>
            </div>
          )}
        </TabsContent>

        {/* Restore Log */}
        <TabsContent value="restore" className="mt-4">
          {loadingRestoreLog ? (
            <p className="text-sm text-muted-foreground">লোড হচ্ছে...</p>
          ) : restoreLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">এখনও কোন পুনরুদ্ধার চালানো হয়নি</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>সময়</TableHead>
                    <TableHead>উৎস ফাইল</TableHead>
                    <TableHead>টেবিল ফলাফল</TableHead>
                    <TableHead className="text-right">মোট</TableHead>
                    <TableHead>অবস্থা</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {restoreLog.map((r) => {
                    const ins = (r.results || []).reduce((s, x) => s + (x.inserted || 0), 0);
                    const upd = (r.results || []).reduce((s, x) => s + (x.updated || 0), 0);
                    const errs = (r.results || []).filter((x) => x.error);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(r.ran_at).toLocaleString("bn-BD")}
                          {r.user_email && (
                            <div className="text-muted-foreground">{r.user_email}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs break-all max-w-[180px]">
                          {r.source_filename || "—"}
                          {r.pre_backup_url && (
                            <div className="text-[10px] text-green-600 mt-1">
                              ✓ আগের ব্যাকআপ সংরক্ষিত
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-wrap gap-1 max-w-md">
                            {(r.results || []).map((x) => (
                              <Badge
                                key={x.table}
                                variant={x.error ? "destructive" : "outline"}
                                className="text-[10px]"
                                title={x.error || ""}
                              >
                                {TABLE_LABEL[x.table] || x.table}: +{x.inserted}/~{x.updated}
                              </Badge>
                            ))}
                          </div>
                          {errs.length > 0 && (
                            <div className="text-destructive text-[10px] mt-1">
                              {errs.map((e) => `${e.table}: ${e.error}`).join(" | ")}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          <div>+{ins.toLocaleString("bn-BD")}</div>
                          <div className="text-muted-foreground">~{upd.toLocaleString("bn-BD")}</div>
                        </TableCell>
                        <TableCell>
                          {r.success ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Restore Dialog */}
      <Dialog open={!!restoreUrl} onOpenChange={(o) => !o && setRestoreUrl(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>ব্যাকআপ পুনরুদ্ধার</DialogTitle>
          </DialogHeader>

          <div className="text-xs text-muted-foreground break-all">{restoreFile}</div>

          {analysing ? (
            <p className="text-sm text-muted-foreground py-4">ZIP বিশ্লেষণ হচ্ছে...</p>
          ) : (
            <>
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 p-3 rounded text-xs">
                ⚠️ পুনরুদ্ধার বিদ্যমান রেকর্ড <b>id</b> অনুযায়ী আপডেট/যোগ করবে। এটি অপরিবর্তনীয়। বর্তমান ডাটার ব্যাকআপ আগেই নিন।
              </div>

              {/* Pre-restore backup toggle */}
              <div className="flex items-center justify-between rounded border p-3 bg-muted/30">
                <div>
                  <p className="text-sm font-medium">পুনরুদ্ধারের আগে ব্যাকআপ নিন</p>
                  <p className="text-xs text-muted-foreground">
                    নির্বাচিত টেবিলগুলোর বর্তমান অবস্থা ZIP-এ ডাউনলোড + ক্লাউডে আপলোড হবে
                  </p>
                </div>
                <Switch checked={preBackup} onCheckedChange={setPreBackup} />
              </div>

              {/* Missing files warning */}
              {analysis && analysis.missing.length > 0 && (
                <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 p-3 rounded text-xs flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                  <div>
                    <b>অনুপস্থিত JSON ফাইল ({analysis.missing.length}):</b>{" "}
                    {analysis.missing.map((m) => TABLE_LABEL[m] || m).join(", ")}
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-80 overflow-auto">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">প্রিভিউ ও টেবিল নির্বাচন</p>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSelectedTables(
                          (analysis?.present || []).map((p) => p.table),
                        )
                      }
                    >
                      সব
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedTables([])}
                    >
                      বাদ
                    </Button>
                  </div>
                </div>
                <div className="border rounded divide-y">
                  {(analysis?.present || []).map((p) => (
                    <label
                      key={p.table}
                      className="flex items-center gap-2 text-sm cursor-pointer px-3 py-2 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedTables.includes(p.table)}
                        onCheckedChange={() => toggleTable(p.table)}
                        disabled={p.count === 0}
                      />
                      <span className="flex-1">{TABLE_LABEL[p.table] || p.table}</span>
                      <Badge
                        variant={p.count > 0 ? "secondary" : "outline"}
                        className="tabular-nums"
                      >
                        {p.count.toLocaleString("bn-BD")} রেকর্ড
                      </Badge>
                    </label>
                  ))}
                </div>
                {analysis && analysis.present.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    এই ZIP-এ পুনরুদ্ধারযোগ্য JSON টেবিল পাওয়া যায়নি
                  </p>
                )}
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreUrl(null)}>
              বাতিল
            </Button>
            <Button
              onClick={performRestore}
              disabled={
                restoring || analysing || selectedTables.length === 0
              }
            >
              {restoring ? "পুনরুদ্ধার চলছে..." : "পুনরুদ্ধার করুন"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* JSON Upload Restore Dialog */}
      <Dialog open={jsonDialog} onOpenChange={(o) => !jsonBusy && setJsonDialog(o)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileJson className="h-5 w-5" /> JSON ফাইল থেকে পুনরুদ্ধার
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              একসাথে একাধিক JSON ফাইল আপলোড করুন — সিস্টেম প্রতিটি ফাইল পড়ে
              স্বয়ংক্রিয়ভাবে টেবিল শনাক্ত করবে এবং পুনরুদ্ধারের আগে কী কী যাবে
              সব দেখাবে। সাপোর্টেড: অ্যারে, একক অবজেক্ট,
              <code> {"{table, rows}"}</code>, মাল্টি-টেবিল অবজেক্ট।
            </p>

            {/* Drop zone */}
            <label
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer hover:bg-muted/50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleJsonPick(e.dataTransfer.files);
              }}
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium">
                একাধিক JSON ফাইল নির্বাচন করুন বা এখানে ড্রপ করুন
              </span>
              <span className="text-xs text-muted-foreground">
                {jsonFiles.length > 0
                  ? `${jsonFiles.length} টি ফাইল নির্বাচিত`
                  : "একসাথে অনেকগুলো ফাইল দেওয়া যাবে"}
              </span>
              <input
                type="file"
                multiple
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => handleJsonPick(e.target.files)}
              />
            </label>

            {jsonAnalysing && (
              <p className="text-sm text-muted-foreground">বিশ্লেষণ হচ্ছে...</p>
            )}

            {/* Per-file cards */}
            {jsonFiles.length > 0 && jsonMulti && (
              <div className="space-y-2">
                <p className="text-sm font-medium">আপলোডকৃত ফাইলসমূহ</p>
                {jsonMulti.perFile.map((pf) => {
                  const key = `${pf.file}:${pf.size}`;
                  const isOpen = jsonExpanded.has(key);
                  const totalRows =
                    pf.analysis.groups.reduce((s, g) => s + g.rows.length, 0) +
                    pf.analysis.unknown.rows.length;
                  return (
                    <div key={key} className="border rounded-lg overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40">
                        <button
                          type="button"
                          onClick={() => toggleJsonExpand(key)}
                          className="text-muted-foreground"
                          aria-label="toggle"
                        >
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                        <FileJson className="h-4 w-4 text-primary" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{pf.file}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatBytes(pf.size)} • {totalRows} রেকর্ড •{" "}
                            {pf.analysis.groups.length} টেবিল
                            {pf.analysis.unknown.rows.length > 0 &&
                              ` • ${pf.analysis.unknown.rows.length} অশনাক্ত`}
                          </p>
                        </div>
                        {pf.error && (
                          <Badge variant="destructive" className="text-[10px]">
                            ত্রুটি
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeJsonFile(pf.file, pf.size)}
                          disabled={jsonBusy}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {isOpen && (
                        <div className="px-3 py-2 space-y-2 text-xs">
                          {pf.error && (
                            <p className="text-destructive">{pf.error}</p>
                          )}
                          {pf.analysis.groups.map((g) => (
                            <div key={g.table} className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">
                                {TABLE_LABEL[g.table] || g.table}
                              </Badge>
                              <span className="text-muted-foreground">
                                {g.rows.length} রেকর্ড
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {g.confidence === "explicit"
                                  ? "নাম থেকে"
                                  : g.confidence === "filename"
                                    ? "ফাইলনাম থেকে"
                                    : g.confidence === "fingerprint"
                                      ? "ফিল্ড থেকে"
                                      : "ম্যানুয়াল"}
                              </Badge>
                            </div>
                          ))}
                          {pf.analysis.unknown.rows.length > 0 && (
                            <p className="text-orange-600">
                              ⚠️ {pf.analysis.unknown.rows.length} টি রেকর্ড শনাক্ত হয়নি
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Warnings */}
            {jsonMulti && jsonMulti.warnings.length > 0 && (
              <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 p-3 rounded text-xs space-y-1">
                {jsonMulti.warnings.map((w, i) => (
                  <div key={i} className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Merged table summary */}
            {jsonMulti && jsonMulti.merged.length > 0 && (
              <>
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 p-3 rounded text-xs">
                  ⚠️ <b>id</b> অনুযায়ী আপডেট/যোগ হবে। অপরিবর্তনীয় — প্রি-ব্যাকআপ রাখুন।
                </div>

                <div className="flex items-center justify-between rounded border p-3 bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">পুনরুদ্ধারের আগে ব্যাকআপ নিন</p>
                    <p className="text-xs text-muted-foreground">
                      নির্বাচিত টেবিলগুলোর বর্তমান অবস্থা ZIP + ক্লাউডে সেভ
                    </p>
                  </div>
                  <Switch checked={jsonPreBackup} onCheckedChange={setJsonPreBackup} />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">
                      পুনরুদ্ধারের সারাংশ ({jsonMulti.merged.length} টেবিল)
                    </p>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setJsonSelected(
                            new Set(jsonMulti.merged.map((m) => m.table)),
                          )
                        }
                      >
                        সব
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setJsonSelected(new Set())}
                      >
                        বাদ
                      </Button>
                    </div>
                  </div>
                  <div className="border rounded overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>টেবিল</TableHead>
                          <TableHead className="text-right">রেকর্ড</TableHead>
                          <TableHead className="text-right">নতুন</TableHead>
                          <TableHead className="text-right">আপডেট</TableHead>
                          <TableHead>উৎস ফাইল</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {jsonMulti.merged.map((m) => {
                          const sampleKey = `sample:${m.table}`;
                          const isOpen = jsonExpanded.has(sampleKey);
                          return (
                            <>
                              <TableRow key={m.table}>
                                <TableCell>
                                  <Checkbox
                                    checked={jsonSelected.has(m.table)}
                                    onCheckedChange={() => toggleJsonTable(m.table)}
                                  />
                                </TableCell>
                                <TableCell className="font-medium text-sm">
                                  {TABLE_LABEL[m.table] || m.table}
                                  <div className="text-[10px] text-muted-foreground">
                                    {m.table}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {m.rows.length.toLocaleString("bn-BD")}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-green-600">
                                  +{m.willInsert.toLocaleString("bn-BD")}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-amber-600">
                                  ~{m.willUpdate.toLocaleString("bn-BD")}
                                </TableCell>
                                <TableCell className="text-xs">
                                  <div className="flex flex-wrap gap-1 max-w-[180px]">
                                    {m.sources.map((s) => (
                                      <Badge
                                        key={s}
                                        variant="outline"
                                        className="text-[10px]"
                                      >
                                        {s}
                                      </Badge>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => toggleJsonExpand(sampleKey)}
                                  >
                                    {isOpen ? (
                                      <ChevronDown className="h-3 w-3" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3" />
                                    )}
                                    নমুনা
                                  </Button>
                                </TableCell>
                              </TableRow>
                              {isOpen && m.sampleRow && (
                                <TableRow>
                                  <TableCell colSpan={7} className="bg-muted/30">
                                    <pre className="text-[10px] overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                                      {JSON.stringify(m.sampleRow, null, 2)}
                                    </pre>
                                  </TableCell>
                                </TableRow>
                              )}
                            </>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}

            {/* Unknown rows — manual mapping */}
            {jsonMulti && jsonMulti.unknown.length > 0 && (
              <div className="border border-orange-300 rounded p-3 space-y-2 bg-orange-50/50 dark:bg-orange-950/20">
                <p className="text-sm font-medium text-orange-900 dark:text-orange-200">
                  অশনাক্তকৃত রেকর্ড — ম্যানুয়ালি টেবিল বাছুন
                </p>
                {jsonMulti.unknown.map((u) => (
                  <div key={u.file} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate">
                      <b>{u.file}</b> — {u.rows.length} রেকর্ড
                    </span>
                    <select
                      className="border rounded px-2 py-1 text-xs bg-background"
                      value={jsonManualMap[u.file] || ""}
                      onChange={(e) =>
                        setJsonManualMap((m) => ({
                          ...m,
                          [u.file]: e.target.value as TableKey,
                        }))
                      }
                    >
                      <option value="">— স্কিপ —</option>
                      {ALL_TABLES.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label} ({t.key})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setJsonDialog(false);
                resetJsonState();
              }}
              disabled={jsonBusy}
            >
              বাতিল
            </Button>
            <Button
              onClick={performJsonRestore}
              disabled={
                jsonBusy ||
                jsonAnalysing ||
                !jsonMulti ||
                (jsonSelected.size === 0 &&
                  Object.values(jsonManualMap).filter(Boolean).length === 0)
              }
            >
              {jsonBusy ? "পুনরুদ্ধার চলছে..." : "পুনরুদ্ধার করুন"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CollapsibleCard>
  );
}
