
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS cloudinary_cloud_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cloudinary_upload_preset text NOT NULL DEFAULT '';

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS photo_url text;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS photo_url text;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_photo_url text;

CREATE TABLE IF NOT EXISTS public.customer_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  entry_type text NOT NULL DEFAULT 'debit',
  amount numeric NOT NULL DEFAULT 0,
  description text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_ledger_entries_customer_id
  ON public.customer_ledger_entries(customer_id);

ALTER TABLE public.customer_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage customer_ledger_entries"
  ON public.customer_ledger_entries
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TRIGGER update_customer_ledger_entries_updated_at
  BEFORE UPDATE ON public.customer_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
