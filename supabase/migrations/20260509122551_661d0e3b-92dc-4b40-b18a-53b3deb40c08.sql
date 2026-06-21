-- Enforce one-IMEI-one-mobile rule: no two in-stock products share an IMEI
CREATE UNIQUE INDEX IF NOT EXISTS products_imei_in_stock_unique
ON public.products (imei)
WHERE imei IS NOT NULL AND imei <> '' AND stock_quantity > 0;