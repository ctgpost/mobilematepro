import { useEffect, useRef } from "react";
import {
  loadBackupSettings,
  saveBackupSettings,
} from "@/components/BackupExportSettings";
import {
  generateFullBackup,
  uploadBackupToCloudinary,
} from "@/lib/backupExport";
import { saveBlobToFolder } from "@/lib/backupFolder";
import { logBackupRun } from "@/lib/backupHistory";
import { toast } from "sonner";

const LAST_RUN_KEY = "auto-backup:last-run-date"; // YYYY-MM-DD

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

async function runScheduledBackup() {
  const s = loadBackupSettings();
  if (!s.enabled || s.tables.length === 0) return;

  const t = toast.loading("⏰ স্বয়ংক্রিয় ব্যাকআপ চলছে...");
  let downloadOk = false;
  let cloudUrl: string | null = null;
  let counts: Record<string, number> = {};
  let filename = "";
  let errMsg: string | null = null;
  try {
    const result = await generateFullBackup({
      tables: s.tables,
      dateFrom: s.dateFrom,
      dateTo: s.dateTo,
    });
    counts = result.counts;
    filename = `mobile-mate-pro-auto-${result.timestamp}.zip`;

    // Save locally — to chosen folder if set, else default downloads
    await saveBlobToFolder(result.xlsxBlob, `mobile-mate-pro-auto-${result.timestamp}.xlsx`);
    await saveBlobToFolder(result.zipBlob, filename);
    downloadOk = true;

    if (s.uploadCloud) {
      cloudUrl = await uploadBackupToCloudinary(result.zipBlob, filename);
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    toast.success(
      `✅ অটো ব্যাকআপ সম্পন্ন (${total} রেকর্ড)${cloudUrl ? " — ক্লাউডে সংরক্ষিত" : ""}`,
      { id: t, duration: 8000 },
    );
    localStorage.setItem(LAST_RUN_KEY, todayKey());
  } catch (e: any) {
    errMsg = e?.message || "";
    console.error("auto-backup failed", e);
    toast.error(`অটো ব্যাকআপ ব্যর্থ: ${errMsg}`, { id: t });
  } finally {
    await logBackupRun({
      tables: s.tables,
      counts,
      download_ok: downloadOk,
      cloud_ok: !!cloudUrl,
      cloud_url: cloudUrl,
      filename,
      trigger_type: "auto",
      error: errMsg,
    });
  }
}

/**
 * Checks every minute. If the configured time has passed today and no backup
 * has been run yet today, runs it. Also catches up on first open of the day
 * if scheduled time was missed earlier.
 */
export function useAutoBackup() {
  const ranRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      const s = loadBackupSettings();
      if (!s.enabled) return;

      const now = new Date();
      const [hh, mm] = (s.time || "23:00").split(":").map(Number);
      const scheduled = new Date(now);
      scheduled.setHours(hh || 23, mm || 0, 0, 0);

      const last = localStorage.getItem(LAST_RUN_KEY);
      const today = todayKey(now);
      if (last === today || ranRef.current) return;

      // Trigger if we're at/after the scheduled time today
      if (now.getTime() >= scheduled.getTime()) {
        ranRef.current = true;
        void runScheduledBackup();
      }
    };

    // Initial check + every minute
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
}

// Re-export so consumers can persist updates programmatically.
export { saveBackupSettings };
