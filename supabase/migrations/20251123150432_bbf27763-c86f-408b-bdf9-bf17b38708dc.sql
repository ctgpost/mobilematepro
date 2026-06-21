-- Add optional Quick Specifications fields
ALTER TABLE public.products
ADD COLUMN ram text,
ADD COLUMN storage text,
ADD COLUMN battery text;

-- Add optional Supplier Information fields
ALTER TABLE public.products
ADD COLUMN supplier_name text,
ADD COLUMN supplier_mobile text,
ADD COLUMN supplier_nid text;