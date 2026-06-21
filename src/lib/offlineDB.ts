import { openDB, type IDBPDatabase } from "idb";

export type OutboxOp = "insert" | "update" | "delete" | "upsert" | "compound_sale";

export interface OutboxItem {
  id?: number;
  table: string;
  op: OutboxOp;
  payload: any; // for insert/upsert: row(s); for update: { values, match }; for delete: { match }
  tempId?: string; // optimistic temp id for inserts
  createdAt: number;
  retryCount: number;
  lastError?: string;
  paused?: boolean;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getOfflineDB() {
  if (!dbPromise) {
    dbPromise = openDB("apple-store-offline", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", {
            keyPath: "id",
            autoIncrement: true,
          });
        }
        if (!db.objectStoreNames.contains("kv")) {
          db.createObjectStore("kv");
        }
      },
    });
  }
  return dbPromise;
}

export async function enqueueOutbox(item: Omit<OutboxItem, "id" | "createdAt" | "retryCount">) {
  const db = await getOfflineDB();
  const fullItem: Omit<OutboxItem, "id"> = {
    ...item,
    createdAt: Date.now(),
    retryCount: 0,
  };
  const id = await db.add("outbox", fullItem as any);
  return id as number;
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const db = await getOfflineDB();
  return (await db.getAll("outbox")) as OutboxItem[];
}

export async function deleteOutbox(id: number) {
  const db = await getOfflineDB();
  await db.delete("outbox", id);
}

export async function updateOutbox(item: OutboxItem) {
  const db = await getOfflineDB();
  await db.put("outbox", item);
}

export async function clearOutbox() {
  const db = await getOfflineDB();
  await db.clear("outbox");
}

export async function getOutboxCount(): Promise<number> {
  const db = await getOfflineDB();
  return await db.count("outbox");
}

export async function getOutboxItem(id: number): Promise<OutboxItem | undefined> {
  const db = await getOfflineDB();
  return (await db.get("outbox", id)) as OutboxItem | undefined;
}

export async function setOutboxPaused(id: number, paused: boolean) {
  const item = await getOutboxItem(id);
  if (!item) return;
  await updateOutbox({ ...item, paused });
}

export async function setKV(key: string, value: any) {
  const db = await getOfflineDB();
  await db.put("kv", value, key);
}

export async function getKV<T = any>(key: string): Promise<T | undefined> {
  const db = await getOfflineDB();
  return (await db.get("kv", key)) as T | undefined;
}
