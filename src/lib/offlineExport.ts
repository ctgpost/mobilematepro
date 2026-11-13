import { saveAs } from "file-saver";
import { getOfflineDB, listOutbox, clearOutbox } from "./offlineDB";
import { get as kvGet, set as kvSet, del as kvDel } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";

interface OfflineSnapshot {
  version: 1;
  exportedAt: string;
  outbox: any[];
  reactQueryCache: string | null;
}

export async function exportOfflineData() {
  const outbox = await listOutbox();
  const cache = (await kvGet("mobile-mate-pro-rq-cache")) as string | null;
  const snapshot: OfflineSnapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    outbox,
    reactQueryCache: cache ?? null,
  };
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: "application/json",
  });
  saveAs(blob, `mobile-mate-pro-offline-${Date.now()}.json`);
}

export async function importOfflineData(file: File): Promise<{
  outboxCount: number;
  cacheRestored: boolean;
}> {
  const text = await file.text();
  let parsed: OfflineSnapshot;
  try { parsed = JSON.parse(text) as OfflineSnapshot; }
  catch { throw new Error("অফলাইন ব্যাকআপের JSON সঠিক নয়"); }
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.outbox)) throw new Error("অসমর্থিত বা অসম্পূর্ণ অফলাইন ব্যাকআপ");
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Sign in required");
  if (parsed.outbox.length > 10000) throw new Error("অফলাইন ব্যাকআপে অতিরিক্ত Queue Item রয়েছে");
  const allowedOps = new Set(["insert", "update", "delete", "upsert", "compound_sale"]);
  const allowedTables = new Set(["products","sales","sale_items","customers","suppliers","categories","returns","supplier_returns","due_payments","customer_ledger_entries","investment_entries","investment_incomes","investment_sectors","activity_logs","shop_settings"]);
  for (const item of parsed.outbox) {
    if (!item || item.userId !== userId || !allowedOps.has(item.op) || !allowedTables.has(item.table) || !item.payload || typeof item.payload !== "object") {
      throw new Error("অন্য ব্যবহারকারীর বা অবৈধ Queue Item পাওয়া গেছে। Import বাতিল করা হয়েছে");
    }
  }
  const db = await getOfflineDB();
  for (const item of parsed.outbox) {
    const { id, ...rest } = item;
    await db.add("outbox", rest as any);
  }
  if (parsed.reactQueryCache) await kvSet(`mobile-mate-pro-rq-cache:${userId}`, parsed.reactQueryCache);

  return {
    outboxCount: parsed.outbox?.length || 0,
    cacheRestored: !!parsed.reactQueryCache,
  };
}

/**
 * Clear cached read data but PRESERVE outbox (queued writes).
 */
export async function clearOfflineCache() {
  const all = await kvKeys();
  for (const k of all) {
    await kvDel(k);
  }
  // Clear SW caches
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.map((n) => caches.delete(n)));
  }
}

export async function clearAllOfflineData() {
  await clearOfflineCache();
  await clearOutbox();
}

export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
  percent: number;
}> {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    const usage = est.usage || 0;
    const quota = est.quota || 0;
    return { usage, quota, percent: quota ? (usage / quota) * 100 : 0 };
  }
  return { usage: 0, quota: 0, percent: 0 };
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(2)} ${units[i]}`;
}

export async function getServiceWorkerStatus(): Promise<{
  supported: boolean;
  registered: boolean;
  active: boolean;
  scope: string | null;
}> {
  if (!("serviceWorker" in navigator)) {
    return { supported: false, registered: false, active: false, scope: null };
  }
  const regs = await navigator.serviceWorker.getRegistrations();
  const reg = regs[0];
  return {
    supported: true,
    registered: !!reg,
    active: !!reg?.active,
    scope: reg?.scope || null,
  };
}
