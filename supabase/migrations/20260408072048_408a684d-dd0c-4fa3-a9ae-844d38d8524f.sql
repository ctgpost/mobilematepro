-- Update the default value for future rows
ALTER TABLE public.shop_settings 
ALTER COLUMN shop_subtitle SET DEFAULT 'Sales & Inventory Management System';

-- Update the existing default row
UPDATE public.shop_settings 
SET shop_subtitle = 'Sales & Inventory Management System'
WHERE shop_subtitle = 'Mobile Shop';