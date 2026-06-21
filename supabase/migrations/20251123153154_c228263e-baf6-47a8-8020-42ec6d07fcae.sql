-- Create returns table for refund tracking
CREATE TABLE IF NOT EXISTS public.returns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  sale_item_id UUID NOT NULL REFERENCES public.sale_items(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  refund_amount NUMERIC NOT NULL DEFAULT 0,
  reason_code TEXT NOT NULL,
  reason_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  processed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for returns table
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

-- Create policies for returns
CREATE POLICY "Authenticated users can view returns"
ON public.returns
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create returns"
ON public.returns
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update returns"
ON public.returns
FOR UPDATE
USING (auth.uid() IS NOT NULL);

-- Create trigger for returns updated_at
CREATE TRIGGER update_returns_updated_at
BEFORE UPDATE ON public.returns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for better performance
CREATE INDEX idx_returns_sale_id ON public.returns(sale_id);
CREATE INDEX idx_returns_product_id ON public.returns(product_id);
CREATE INDEX idx_returns_status ON public.returns(status);