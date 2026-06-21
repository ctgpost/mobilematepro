-- Add brand and condition fields to products
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS brand TEXT,
ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'new' CHECK (condition IN ('new', 'used')),
ADD COLUMN IF NOT EXISTS imei TEXT UNIQUE;

-- Update products to have imei index
CREATE INDEX IF NOT EXISTS idx_products_imei ON public.products(imei);
CREATE INDEX IF NOT EXISTS idx_products_brand ON public.products(brand);
CREATE INDEX IF NOT EXISTS idx_products_condition ON public.products(condition);

-- Add purchase history tracking to customers
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS total_purchases DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS purchase_count INTEGER DEFAULT 0;

-- Add condition field to sale_items
ALTER TABLE public.sale_items
ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'new';