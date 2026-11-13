import { supabase } from "@/integrations/supabase/client";
import {
  enqueueOutbox,
  listOutbox,
  deleteOutbox,
  updateOutbox,
  getOutboxItem,
  type OutboxItem,
} from "./offlineDB";

type AnyTable = any;

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/**
 * Unified offline-aware mutate helper.
 * If online: performs the Supabase op directly.
 * If offline: enqueues into IndexedDB outbox and returns an optimistic temp row.
 */
export async function offlineMutate<T = any>(
  table: string,
  op: "insert" | "update" | "delete" | "upsert",
  payload: any
): Promise<{ data: T | null; error: any; queued: boolean; tempId?: string }> {
  if (isOnline()) {
    try {
      let res: any;
      const t = supabase.from(table as AnyTable);
      if (op === "insert") {
        res = await t.insert(payload).select();
      } else if (op === "upsert") {
        res = await t.upsert(payload).select();
      } else if (op === "update") {
        let q: any = t.update(payload.values);
        for (const [k, v] of Object.entries(payload.match || {})) {
          q = q.eq(k, v);
        }
        res = await q.select();
      } else if (op === "delete") {
        let q: any = t.delete();
        for (const [k, v] of Object.entries(payload.match || {})) {
          q = q.eq(k, v);
        }
        res = await q.select();
      }
      if (res?.error) throw res.error;
      return { data: res?.data ?? null, error: null, queued: false };
    } catch (err) {
      // If network failure mid-flight, queue it
      const msg = (err as any)?.message || "";
      if (
        /Failed to fetch|Network|NetworkError|TypeError/i.test(msg) &&
        !isOnline()
      ) {
        const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await enqueueOutbox({ table, op, payload, tempId });
        return { data: null, error: null, queued: true, tempId };
      }
      return { data: null, error: err, queued: false };
    }
  } else {
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await enqueueOutbox({ table, op, payload, tempId });
    return { data: null, error: null, queued: true, tempId };
  }
}

/**
 * Queue a complete sale (sale + sale_items + stock decrements) as a single
 * compound operation that will be replayed atomically when back online.
 * Returns a synthetic sale object usable for invoice display while offline.
 */
export async function enqueueCompoundSale(saleData: {
  user_id: string;
  customer_id: string | null;
  total_amount: number;
  payment_method: string;
  instant_customer_name: string | null;
  instant_customer_phone: string | null;
  paid_amount: number;
  due_amount: number;
  customer_photo_url: string | null;
  items: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    product_snapshot?: any;
  }>;
  customer_snapshot?: any;
}): Promise<{ tempSaleId: string; queuedAt: number }> {
  const tempSaleId = `tmp_sale_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const queuedAt = Date.now();
  const idempotencyKey = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  await enqueueOutbox({
    table: "sales",
    op: "compound_sale",
    payload: { tempSaleId, queuedAt, idempotencyKey, ...saleData },
    tempId: tempSaleId,
  });
  return { tempSaleId, queuedAt };
}

/**
 * Process pending outbox items in order.
 */
export async function drainOutbox(): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId || !isOnline()) return { processed: 0, failed: 0, errors: [] };

  const items = (await listOutbox(userId))
    .filter((i) => !i.paused)
    .sort((a, b) => a.createdAt - b.createdAt);
  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      await processOutboxItem(item);
      await deleteOutbox(item.id!, userId);
      processed++;
    } catch (err: any) {
      failed++;
      // Never drop queued work: after repeated failures the item is paused,
      // not deleted — no product, sale or ledger entry may ever be lost.
      // The user can retry paused items from the offline diagnostics panel.
      const retryCount = (item.retryCount || 0) + 1;
      const updated: OutboxItem = {
        ...item,
        retryCount,
        lastError: err?.message || String(err),
        paused: retryCount >= 5,
      };
      await updateOutbox(updated, userId);
      if (updated.paused) {
        errors.push(`${item.table}/${item.op}: ${updated.lastError} (paused for manual retry)`);
      }
    }
  }

  return { processed, failed, errors };
}

/**
 * Retry a single outbox item right now (ignoring its paused flag).
 */
export async function retryOutboxItem(id: number): Promise<{ ok: boolean; error?: string }> {
  if (!isOnline()) return { ok: false, error: "offline" };
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "not authenticated" };
  const item = await getOutboxItem(id, userId);
  if (!item) return { ok: false, error: "not found" };
  try {
    await processOutboxItem(item);
    await deleteOutbox(item.id!, userId);
    return { ok: true };
  } catch (err: any) {
    const msg = err?.message || String(err);
    await updateOutbox({
      ...item,
      retryCount: (item.retryCount || 0) + 1,
      lastError: msg,
    }, userId);
    return { ok: false, error: msg };
  }
}

/**
 * Execute a single outbox item against Supabase. Throws on error.
 * Handles standard ops as well as `compound_sale` which inserts a sale,
 * its sale_items, and decrements stock atomically.
 */
async function processOutboxItem(item: OutboxItem): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id || item.userId !== session.user.id) {
    throw new Error("Offline operation belongs to a different or signed-out user");
  }
  if (item.op === "compound_sale") {
    const p = item.payload || {};
    const { error } = await (supabase.rpc as any)("create_sale_atomic", {
      p_idempotency_key: p.idempotencyKey,
      p_sale: {
        user_id: p.user_id,
        customer_id: p.customer_id,
        total_amount: p.total_amount,
        payment_method: p.payment_method,
        instant_customer_name: p.instant_customer_name,
        instant_customer_phone: p.instant_customer_phone,
        customer_photo_url: p.customer_photo_url,
        paid_amount: p.paid_amount,
        due_amount: p.due_amount,
        created_at: new Date(p.queuedAt || Date.now()).toISOString(),
      },
      p_items: (p.items || []).map((it: any) => ({
        product_id: it.product_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.total_price,
      })),
    });
    if (error) throw error;
    return;
  }

  const t = supabase.from(item.table as any);
  let res: any;
  if (item.op === "insert") res = await t.insert(item.payload).select();
  else if (item.op === "upsert") res = await t.upsert(item.payload).select();
  else if (item.op === "update") {
    let q: any = t.update(item.payload.values);
    for (const [k, v] of Object.entries(item.payload.match || {})) q = q.eq(k, v);
    res = await q.select();
  } else if (item.op === "delete") {
    let q: any = t.delete();
    for (const [k, v] of Object.entries(item.payload.match || {})) q = q.eq(k, v);
    res = await q.select();
  }
  if (res?.error) throw res.error;
}
