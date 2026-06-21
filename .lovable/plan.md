## Goal
Make Sales Return and Supplier Return fully auditable, searchable, previewable, and accurately reflected in every report (daily, weekly, monthly, profit/loss). Add an offline POS test checklist.

## 1. Database — Return Audit Log (migration)

New table `return_audit_logs`:
- `id`, `return_type` ('sales' | 'supplier'), `return_id` (uuid)
- `action` ('created' | 'approved' | 'rejected' | 'completed' | 'deleted' | 'updated')
- `user_id`, `user_email`, `created_at`
- `stock_delta` (int), `amount_delta` (numeric), `previous_status`, `new_status`
- `product_id`, `quantity`, `notes` (jsonb for extra context)
- RLS: authenticated can insert/select; admins can delete
- Indexes on `return_type`, `return_id`, `created_at`

## 2. Returns module overhaul (`src/components/Returns.tsx`)

Convert into a unified dashboard with tabs:
- **Overview** — KPI cards: pending sales returns, pending supplier returns, total refund (today/week/month), stock restored count. Real-time via existing `useRealtimeSync`.
- **Sales Returns** — current list + filters (status, date, IMEI, invoice, return ID, customer).
- **Supplier Returns** — list with same filter style.
- **Reconciliation Report** — compares `sales` total vs `returns.refund_amount` per invoice; flags mismatches in product stock vs (sold − returned). Date range filter. Export Excel/PDF.

### Search
- Already supports IMEI / invoice / customer. Add explicit "Return Number" search (return id prefix) and live debounced search that updates results as user types (no need for Enter).

### Stock Impact Preview
Before approving any return, show modal:
- Product, current stock → new stock after approval
- Refund amount → ledger/cash impact
- Customer due balance change (if applicable)
- Effect on profit (cost basis × qty restored)
- Confirm/Cancel buttons

### Audit logging hooks
Wrap `createReturnMutation`, `processReturnMutation`, `deleteReturnMutation`, and supplier-return counterparts to insert into `return_audit_logs` with before/after stock and amount deltas.

## 3. Supplier Returns parity

Apply matching audit logging + stock preview to `supplier_returns` flows wherever they're created/approved/deleted (likely in `Suppliers.tsx` or dedicated supplier returns UI — locate and update).

## 4. Reports impact (`src/components/Reports.tsx`, `Dashboard.tsx`, `StaffPerformanceReport.tsx`)

Verify and update profit/loss + sales totals to subtract completed returns:
- **Net Sales** = sales total − completed sales returns refund
- **Net Profit** = (sale_price − cost) summed, minus profit on returned items + supplier return recoveries
- Apply to daily / weekly / monthly aggregations
- Dashboard widgets show "Returns Today/Week/Month" with refund amount

## 5. Offline POS test checklist (`src/components/POS.tsx` or new `POSOfflineChecklist.tsx`)

Add a collapsible checklist panel (toggle from POS header) that runs end-to-end self-tests:
1. Detect offline status
2. Add a test product offline → verify it appears in product cache
3. Create a test sale offline → verify outbox contains compound_sale entry + invoice opens
4. Confirm stock decremented optimistically
5. Show outbox queue size and pending sync items
6. When online: drain outbox + verify success
Each step shows pass/fail/pending state with timestamps.

## 6. Audit log viewer

Small new component `ReturnAuditLog.tsx` shown inside the Returns dashboard (drawer / dialog per return) listing all audit events with user, time, deltas, status transitions.

## Technical notes

- All audit writes happen inside the same mutation function before/after the data mutation; failures in audit are logged but don't roll back the primary action.
- Real-time: add `return_audit_logs` to `useRealtimeSync` TABLE_TO_KEYS map.
- Net profit/loss formulas adjusted in Reports queries — keep using `products.condition` per existing memory rule.
- Reconciliation uses client-side aggregation from already-fetched data; no new SQL views needed.

## Files

- migration: create `return_audit_logs` + RLS
- new: `src/components/returns/ReturnsDashboard.tsx`, `src/components/returns/StockImpactPreview.tsx`, `src/components/returns/ReconciliationReport.tsx`, `src/components/returns/ReturnAuditLog.tsx`, `src/components/POSOfflineChecklist.tsx`
- edit: `src/components/Returns.tsx`, `src/components/Suppliers.tsx` (supplier returns flow), `src/components/Reports.tsx`, `src/components/Dashboard.tsx`, `src/components/StaffPerformanceReport.tsx`, `src/components/POS.tsx`, `src/hooks/useRealtimeSync.ts`, `src/hooks/useActivityLog.ts`