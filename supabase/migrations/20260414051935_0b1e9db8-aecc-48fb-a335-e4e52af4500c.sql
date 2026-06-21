
-- Add due tracking fields to sales table
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS due_amount numeric NOT NULL DEFAULT 0;

-- Due payments table for installment tracking
CREATE TABLE public.due_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_method text NOT NULL DEFAULT 'cash',
  notes text,
  collected_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.due_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage due_payments"
ON public.due_payments FOR ALL TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Investment sectors table
CREATE TABLE public.investment_sectors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.investment_sectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage investment_sectors"
ON public.investment_sectors FOR ALL TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Investment entries (money in/out of a sector)
CREATE TABLE public.investment_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sector_id uuid NOT NULL REFERENCES public.investment_sectors(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  entry_type text NOT NULL DEFAULT 'deposit', -- deposit or withdraw
  purpose text,
  notes text,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.investment_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage investment_entries"
ON public.investment_entries FOR ALL TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Investment incomes (revenue from a sector)
CREATE TABLE public.investment_incomes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sector_id uuid NOT NULL REFERENCES public.investment_sectors(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  source text,
  purpose text,
  notes text,
  income_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.investment_incomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage investment_incomes"
ON public.investment_incomes FOR ALL TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Insert default sectors
INSERT INTO public.investment_sectors (name, description, is_default) VALUES
('ফোন এক্সেসরিস', 'ফোন কভার, চার্জার, ইয়ারফোন, গ্লাস প্রটেক্টর ইত্যাদি', true),
('মোবাইল সার্ভিসিং', 'মোবাইল রিপেয়ার, সফটওয়্যার, হার্ডওয়্যার সার্ভিসিং', true);

-- Triggers for updated_at
CREATE TRIGGER update_investment_sectors_updated_at
BEFORE UPDATE ON public.investment_sectors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
