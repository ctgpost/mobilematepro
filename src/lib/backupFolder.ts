/**
 * Persistent download-folder handle using File System Access API (Chrome/Edge desktop).
 * Falls back to standard browser download for mobile/Safari/Firefox.
 */
import { saveAs } from "file-saver";

const DB_NAME = "mobile-mate-pro-backup";
const STORE = "handles";
const KEY = "download-dir";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const isFolderPickerSupported = () =>
  typeof (window as any).showDirectoryPicker === "function";

export async function pickDownloadFolder(): Promise<string | null> {
  if (!isFolderPickerSupported()) return null;
  const handle = await (window as any).showDirectoryPicker({
    mode: "readwrite",
    id: "mobile-mate-pro-backups",
    startIn: "documents",
  });
  await idbSet(KEY, handle);
  return handle.name;
}

export async function getStoredFolderName(): Promise<string | null> {
  const handle: any = await idbGet(KEY);
  return handle?.name || null;
}

export async function clearDownloadFolder() {
  await idbDel(KEY);
}

async function ensurePermission(handle: any): Promise<boolean> {
  const opts = { mode: "readwrite" as const };
  if ((await handle.queryPermission?.(opts)) === "granted") return true;
  return (await handle.requestPermission?.(opts)) === "granted";
}

/**
 * Save a blob. If user has chosen a folder + permissions are granted, write
 * directly into it. Otherwise fallback to a normal browser download.
 */
export async function saveBlobToFolder(
  blob: Blob,
  filename: string,
  opts?: { silentFallback?: boolean },
): Promise<"folder" | "download"> {
  try {
    const handle: any = await idbGet(KEY);
    if (handle && (await ensurePermission(handle))) {
      // Optional: organize by date subfolder YYYY-MM
      const d = new Date();
      const sub = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const subDir = await handle.getDirectoryHandle(sub, { create: true });
      const fileHandle = await subDir.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "folder";
    }
  } catch (e) {
    console.warn("saveBlobToFolder fallback", e);
  }
  saveAs(blob, filename);
  return "download";
}
