import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch ALL rows from a Supabase query, bypassing the default 1000-row limit
 * by paginating with .range(). Use for reports/dashboard where total accuracy
 * matters regardless of dataset size.
 */
export async function fetchAll<T = any>(
  table: string,
  select: string = "*",
  builder?: (q: any) => any,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q: any = (supabase as any).from(table).select(select);
    if (builder) q = builder(q);
    q = q.range(from, from + pageSize - 1);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
