# Product purchases and supplier account history

## What will change
- Each newly added phone will automatically create a saved supplier purchase record, including its IMEI, condition, cost and date.
- Add a paid-now amount to product entry; the remaining supplier balance will be calculated and recorded with the purchase.
- Add supplier account history and payment entry so purchase, payment, return and balance details remain available after refresh and sign-in changes.
- Preserve purchase and sales history independently of the live product card, and keep lists paginated.

## Technical details
- Use an additive Lovable Cloud migration for a supplier ledger, row-level access, and a transaction-safe product-insert trigger; preserve existing schema and records.
- Update purchase/supplier screens and product history to read the durable ledger and all matching sales through paginated queries.
- Verify with live authenticated records and browser flows. Do not create test transactions in the user's real shop; use read-only checks unless the user supplies a real transaction to enter.
