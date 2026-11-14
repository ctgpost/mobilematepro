-- Archive products without deleting their IMEI, sales, purchase, or audit history.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS products_active_name_idx
  ON public.products (name)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN public.products.archived_at IS
  'When set, the product is archived and excluded from POS checkout. The product row and all linked history remain intact.';

CREATE OR REPLACE FUNCTION public.reject_archived_product_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_archived_at timestamptz;
BEGIN
  SELECT p.archived_at
    INTO v_archived_at
    FROM public.products p
   WHERE p.id = NEW.product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF v_archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Archived products cannot be sold';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_archived_product_sale ON public.sale_items;
CREATE TRIGGER trg_reject_archived_product_sale
BEFORE INSERT OR UPDATE OF product_id
ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION public.reject_archived_product_sale();

REVOKE ALL ON FUNCTION public.reject_archived_product_sale() FROM PUBLIC, anon, authenticated;
