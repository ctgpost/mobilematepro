-- Add supplier_id reference to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supplier_id UUID;

-- Supplier returns table
CREATE TABLE IF NOT EXISTS public.supplier_returns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  supplier_id UUID,
  supplier_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  return_amount NUMERIC NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'defective',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage supplier_returns"
ON public.supplier_returns FOR ALL TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE TRIGGER trg_supplier_returns_updated_at
BEFORE UPDATE ON public.supplier_returns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();