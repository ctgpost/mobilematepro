/**
 * Remove archived product lines from sale-facing views and proportionally
 * allocate invoice totals/payments to the remaining active lines.
 * Original database rows are intentionally preserved for audit history.
 */
export function filterSalesWithActiveProducts<T extends Record<string, any>>(sales: T[] | null | undefined): T[] {
  return (sales || []).flatMap((sale) => {
    const originalItems = Array.isArray(sale.sale_items) ? sale.sale_items : [];
    const activeItems = originalItems.filter((item: any) => !item?.products?.archived_at);
    if (activeItems.length === 0) return [];

    const originalLineTotal = originalItems.reduce(
      (sum: number, item: any) => sum + Math.max(0, Number(item?.total_price) || 0), 0
    );
    const activeLineTotal = activeItems.reduce(
      (sum: number, item: any) => sum + Math.max(0, Number(item?.total_price) || 0), 0
    );
    const activeItemsRatio = originalLineTotal > 0
      ? Math.min(1, activeLineTotal / originalLineTotal)
      : activeItems.length / originalItems.length;
    const scale = (value: unknown) => Math.round((Number(value) || 0) * activeItemsRatio * 100) / 100;

    return [{
      ...sale,
      sale_items: activeItems,
      total_amount: scale(sale.total_amount),
      paid_amount: scale(sale.paid_amount),
      due_amount: scale(sale.due_amount),
      __activeItemsRatio: activeItemsRatio,
    } as T];
  });
}
