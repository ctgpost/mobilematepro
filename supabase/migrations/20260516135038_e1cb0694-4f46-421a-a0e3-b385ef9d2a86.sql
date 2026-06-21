
ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS refund_mode text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS due_adjusted numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_refunded numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_credit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exchange_sale_id uuid;

CREATE INDEX IF NOT EXISTS idx_returns_exchange_sale_id ON public.returns(exchange_sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_sale_id ON public.returns(sale_id);
