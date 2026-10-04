ALTER TABLE public.products ADD COLUMN IF NOT EXISTS last_stock_reason text, ADD COLUMN IF NOT EXISTS last_stock_ref text;

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  product_name text,
  imei text,
  movement_type text NOT NULL,
  reason text,
  ref_id text,
  old_quantity integer NOT NULL DEFAULT 0,
  new_quantity integer NOT NULL DEFAULT 0,
  change integer NOT NULL DEFAULT 0,
  user_id uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view stock movements" ON public.stock_movements FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_stock_movements_product ON public.stock_movements(product_id, created_at DESC);
CREATE INDEX idx_stock_movements_ref ON public.stock_movements(ref_id);

CREATE OR REPLACE FUNCTION public.log_stock_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text; t text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.stock_movements(product_id, product_name, imei, movement_type, reason, ref_id, old_quantity, new_quantity, change)
    VALUES (NEW.id, NEW.name, NEW.imei, 'add', COALESCE(NEW.last_stock_reason, 'নতুন পণ্য যোগ'), NEW.last_stock_ref, 0, NEW.stock_quantity, NEW.stock_quantity);
  ELSIF NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity THEN
    r := NEW.last_stock_reason;
    IF r IS NULL OR r IS NOT DISTINCT FROM OLD.last_stock_reason AND NEW.last_stock_ref IS NOT DISTINCT FROM OLD.last_stock_ref THEN
      r := 'ম্যানুয়াল আপডেট';
      t := 'update';
    ELSIF r = 'sale' THEN t := 'sale'; r := 'POS বিক্রি';
    ELSIF r = 'return' THEN t := 'return'; r := 'কাস্টমার রিটার্ন';
    ELSE t := 'update';
    END IF;
    INSERT INTO public.stock_movements(product_id, product_name, imei, movement_type, reason, ref_id, old_quantity, new_quantity, change)
    VALUES (NEW.id, NEW.name, NEW.imei, t, r, CASE WHEN t='update' AND r='ম্যানুয়াল আপডেট' THEN NULL ELSE NEW.last_stock_ref END, OLD.stock_quantity, NEW.stock_quantity, NEW.stock_quantity - OLD.stock_quantity);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_stock_movement() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_log_stock_movement AFTER INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.log_stock_movement();