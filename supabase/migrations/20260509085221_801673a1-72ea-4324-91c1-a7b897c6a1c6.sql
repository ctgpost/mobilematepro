
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS default_paper_size text NOT NULL DEFAULT '80mm',
  ADD COLUMN IF NOT EXISTS print_item_barcodes boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS barcode_format text NOT NULL DEFAULT 'CODE128';
