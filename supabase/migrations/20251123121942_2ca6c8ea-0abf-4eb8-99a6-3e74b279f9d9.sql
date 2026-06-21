-- Remove unique constraint on IMEI to allow duplicate IMEIs when stock is 0
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_imei_key;