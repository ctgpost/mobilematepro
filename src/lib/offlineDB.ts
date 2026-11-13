import { openDB, type IDBPDatabase } from "idb";
import { supabase } from "@/integrations/supabase/client";

export type OutboxOp = "insert" | "update" | "delete" | "upsert" | "compound_sale";
export interface OutboxItem {
  id?: number;
  userId: string;
  table: string;
  op: OutboxOp;
  payload: any;
  tempId?: string;
  createdAt: number;
  retryCount: number;
  lastError?: string;
  paused?: boolean;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
export function getOfflineDB() {
  if (!dbPromise) {
    dbPromise = openDB("mobile-mate-pro-offline", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      },
    });
  }
  return dbPromise;
}

export async function enqueueOutbox(item: Omit<OutboxItem, "id" | "createdAt" | "retryCount" | "userId">) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Sign in is required before saving offline changes");
  const db = await getOfflineDB();
  return await db.add("outbox", { ...item, userId, createdAt: Date.now(), retryCount: 0 } as any) as number;
}

export async function listOutbox(userId: string): Promise<OutboxItem[]> {
  if (!userId) return [];
  const db = await getOfflineDB();
  return ((await db.getAll("outbox")) as OutboxItem[]).filter((item) => item.userId === userId);
}

export async function deleteOutbox(id: number, userId: string) {
  const db = await getOfflineDB();
  const item = await db.get("outbox", id) as OutboxItem | undefined;
  if (item?.userId === userId) await db.delete("outbox", id);
}

export async function updateOutbox(item: OutboxItem, userId: string) {
  const db = await getOfflineDB();
  const current = item.id ? await db.get("outbox", item.id) as OutboxItem | undefined : undefined;
  if (!current || current.userId !== userId || item.userId !== userId) throw new Error("Offline queue ownership mismatch");
  await db.put("outbox", item);
}

export async function clearOutbox(userId: string) {
  if (!userId) throw new Error("User scope is required");
  const db = await getOfflineDB();
  const tx = db.transaction("outbox", "readwrite");
  let cursor = await tx.store.openCursor();
  while (cursor) {
    if ((cursor.value as OutboxItem).userId === userId) await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function getOutboxCount(userId: string): Promise<number> {
  return (await listOutbox(userId)).length;
}

export async function getOutboxItem(id: number, userId: string): Promise<OutboxItem | undefined> {
  const db = await getOfflineDB();
  const item = await db.get("outbox", id) as OutboxItem | undefined;
  return item?.userId === userId ? item : undefined;
}

export async function setOutboxPaused(id: number, paused: boolean, userId: string) {
  const item = await getOutboxItem(id, userId);
  if (item) await updateOutbox({ ...item, paused }, userId);
}

export async function setKV(key: string, value: any) {
  const db = await getOfflineDB();
  await db.put("kv", value, key);
}

export async function getKV<T = any>(key: string): Promise<T | undefined> {
  const db = await getOfflineDB();
  return await db.get("kv", key) as T | undefined;
}
