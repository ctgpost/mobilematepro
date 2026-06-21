import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ALL_TABLES,
  TableKey,
  generateFullBackup,
  uploadBackupToCloudinary,
} from "@/lib/backupExport";
import {
  isFolderPickerSupported,
  pickDownloadFolder,
  getStoredFolderName,
  clearDownloadFolder,
  saveBlobToFolder,
} from "@/lib/backupFolder";
import { logBackupRun } from "@/lib/backupHistory";
import { BackupHistory } from "@/components/BackupHistory";
import { Download, Cloud, Calendar, Clock, FolderOpen, FolderX } from "lucide-react";

const STORAGE_KEY = "auto-backup:settings";

export interface AutoBackupSettings {
  enabled: boolean;
  time: string; // HH:MM
  tables: TableKey[];
  uploadCloud: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
}

const defaults: AutoBackupSettings = {
  enabled: true,
  time: "23:00",
  tables: ALL_TABLES.map((t) => t.key),
  uploadCloud: true,
  dateFrom: null,
  dateTo: null,
};

export function loadBackupSettings(): AutoBackupSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
}

export function saveBackupSettings(s: AutoBackupSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function BackupExportSettings() {
  const [settings, setSettings] = useState<AutoBackupSettings>(loadBackupSettings());
  const [busy, setBusy] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const folderSupported = isFolderPickerSupported();

  useEffect(() => {
    saveBackupSettings(settings);
  }, [settings]);

  useEffect(() => {
    getStoredFolderName().then(setFolderName);
  }, []);

  const handlePickFolder = async () => {
    try {
      const name = await pickDownloadFolder();
      if (name) {
        setFolderName(name);
        toast.success(`ফোল্ডার সেট হয়েছে: ${name}`);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error("ফোল্ডার নির্বাচন ব্যর্থ");
    }
  };

  const handleClearFolder = async () => {
    await clearDownloadFolder();
    setFolderName(null);
    toast.success("ফোল্ডার বাদ দেওয়া হয়েছে");
  };

  const toggleTable = (key: TableKey) => {
    setSettings((s) => ({
      ...s,
      tables: s.tables.includes(key)
        ? s.tables.filter((k) => k !== key)
        : [...s.tables, key],
    }));
  };

  const runExport = async () => {
    if (settings.tables.length === 0) {
      toast.error("কমপক্ষে একটি টেবিল নির্বাচন করুন");
      return;
    }
    setBusy(true);
    const t = toast.loading("সম্পূর্ণ ব্যাকআপ তৈরি হচ্ছে...");
    let downloadOk = false;
    let cloudUrl: string | null = null;
    let errMsg: string | null = null;
    let counts: Record<string, number> = {};
    let filename = "";
    try {
      const result = await generateFullBackup({
        tables: settings.tables,
        dateFrom: settings.dateFrom,
        dateTo: settings.dateTo,
      });
      counts = result.counts;
      filename = `mobile-mate-pro-backup-${result.timestamp}.zip`;

      // Save both files (folder if chosen, else browser download)
      const where1 = await saveBlobToFolder(
        result.xlsxBlob,
        `mobile-mate-pro-backup-${result.timestamp}.xlsx`,
      );
      const where2 = await saveBlobToFolder(result.zipBlob, filename);
      downloadOk = true;
      const savedToFolder = where1 === "folder" && where2 === "folder";

      // Cloud upload
      if (settings.uploadCloud) {
        toast.loading("ক্লাউডে আপলোড হচ্ছে...", { id: t });
        cloudUrl = await uploadBackupToCloudinary(result.zipBlob, filename);
      }

      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      toast.success(
        `✅ ব্যাকআপ সম্পন্ন: ${total} রেকর্ড${savedToFolder ? " (ফোল্ডারে সংরক্ষিত)" : ""}${cloudUrl ? " + ক্লাউড" : ""}`,
        { id: t, duration: 6000 },
      );
    } catch (e: any) {
      errMsg = e?.message || "ব্যাকআপ ব্যর্থ";
      console.error(e);
      toast.error(errMsg, { id: t });
    } finally {
      await logBackupRun({
        tables: settings.tables,
        counts,
        download_ok: downloadOk,
        cloud_ok: !!cloudUrl,
        cloud_url: cloudUrl,
        filename,
        trigger_type: "manual",
        error: errMsg,
      });
      setBusy(false);
    }
  };

  return (
    <>
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Cloud className="h-5 w-5" /> সম্পূর্ণ ব্যাকআপ ও অটোমেশন
        </h2>
      </div>

      <div className="space-y-6">
        {/* One-click export */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            এক ক্লিকে Excel + ZIP (JSON সহ) উভয় ফরম্যাটে সম্পূর্ণ ডাটাবেস ডাউনলোড + ক্লাউডে ব্যাকআপ।
          </p>
          <Button onClick={runExport} disabled={busy} size="lg" className="w-full md:w-auto">
            <Download className="h-4 w-4 mr-2" />
            {busy ? "প্রসেস হচ্ছে..." : "এখনই সম্পূর্ণ ব্যাকআপ ডাউনলোড করুন"}
          </Button>
        </div>

        {/* Download folder */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Label className="text-base font-medium flex items-center gap-2">
                <FolderOpen className="h-4 w-4" /> ডাউনলোড ফোল্ডার
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {folderSupported
                  ? "একবার ফোল্ডার নির্বাচন করলে অটো ব্যাকআপ ও ম্যানুয়াল ডাউনলোড সরাসরি সেখানে YYYY-MM সাবফোল্ডারে সেভ হবে।"
                  : "এই ব্রাউজার/ডিভাইস ফোল্ডার পিকার সাপোর্ট করে না — ফাইলগুলো ডিফল্ট Downloads ফোল্ডারে সেভ হবে। (Chrome/Edge ডেস্কটপে এই ফিচার পাওয়া যায়)"}
              </p>
              {folderName && (
                <p className="text-sm mt-2 text-primary font-medium">
                  📁 {folderName}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePickFolder}
              disabled={!folderSupported}
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              {folderName ? "ফোল্ডার পরিবর্তন" : "ফোল্ডার নির্বাচন"}
            </Button>
            {folderName && (
              <Button size="sm" variant="ghost" onClick={handleClearFolder}>
                <FolderX className="h-4 w-4 mr-2" /> বাদ দিন
              </Button>
            )}
          </div>
        </div>

        {/* Auto schedule */}
        <div className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">অটো ব্যাকআপ চালু</Label>
              <p className="text-xs text-muted-foreground">
                নির্ধারিত সময়ে অ্যাপ ওপেন থাকলে অটো ব্যাকআপ চলবে
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" /> দৈনিক ব্যাকআপের সময়
              </Label>
              <Input
                type="time"
                value={settings.time}
                onChange={(e) => setSettings((s) => ({ ...s, time: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={settings.uploadCloud}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, uploadCloud: v }))}
              />
              <Label>ক্লাউডে অটো আপলোড (Cloudinary)</Label>
            </div>
          </div>

          {/* Date range */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4" /> ডেট রেঞ্জ ফিল্টার (ঐচ্ছিক)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={settings.dateFrom || ""}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, dateFrom: e.target.value || null }))
                }
                placeholder="শুরু"
              />
              <Input
                type="date"
                value={settings.dateTo || ""}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, dateTo: e.target.value || null }))
                }
                placeholder="শেষ"
              />
            </div>
          </div>

          {/* Table selection */}
          <div>
            <Label className="mb-2 block">কোন কোন টেবিল অন্তর্ভুক্ত হবে</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {ALL_TABLES.map((t) => (
                <label
                  key={t.key}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={settings.tables.includes(t.key)}
                    onCheckedChange={() => toggleTable(t.key)}
                  />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setSettings((s) => ({ ...s, tables: ALL_TABLES.map((t) => t.key) }))
                }
              >
                সব নির্বাচন
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSettings((s) => ({ ...s, tables: [] }))}
              >
                সব বাদ
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
    <BackupHistory />
    </>
  );
}
