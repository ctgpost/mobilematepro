-- Safe restore and single-device IMEI stock invariants.
-- Restore never revives a stale quantity: it returns the archived record at zero stock.
-- A physical reacquisition must be recorded through the purchase flow (0 -> 1).

CREATE OR REPLACE FUNCTION public.enforce_single_imei_device_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.imei IS NOT NULL AND btrim(NEW.imei) <> '' THEN
    IF regexp_replace(NEW.imei, '[^0-9]', '', 'g') !~ '^[0-9]{15}$' THEN
      RAISE EXCEPTION 'IMEI must contain exactly 15 digits' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(NEW.stock_quantity,0) NOT IN (0,1) THEN
      RAISE EXCEPTION 'An IMEI device can only have stock quantity 0 or 1'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_imei_device_stock ON public.products;
CREATE TRIGGER trg_enforce_single_imei_device_stock
BEFORE INSERT OR UPDATE OF imei, stock_quantity ON public.products
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_imei_device_stock();

CREATE OR REPLACE FUNCTION public.restore_archived_product_safe(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_registry public.imei_registry%ROWTYPE;
  v_imei text;
  v_conflict public.products%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_product
    FROM public.products
   WHERE id = p_product_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_product.archived_at IS NULL THEN
    RAISE EXCEPTION 'Product is not archived' USING ERRCODE = '22023';
  END IF;

  v_imei := regexp_replace(COALESCE(v_product.imei,''), '[^0-9]', '', 'g');

  IF v_imei ~ '^[0-9]{15}$' THEN
    SELECT * INTO v_conflict
      FROM public.products
     WHERE imei = v_imei
       AND id <> v_product.id
       AND archived_at IS NULL
       AND COALESCE(stock_quantity,0) > 0
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
      RAISE EXCEPTION 'IMEI % is already in stock on product %',
        v_imei, v_conflict.id USING ERRCODE = '23505';
    END IF;

    SELECT * INTO v_registry
      FROM public.imei_registry
     WHERE imei = v_imei
     FOR UPDATE;

    IF FOUND AND v_registry.product_id <> v_product.id THEN
      -- Reassign the single registry pointer only when no other active stock owns it.
      UPDATE public.imei_registry
         SET product_id = v_product.id,
             status = 'sold',
             supplier_id = v_product.supplier_id,
             supplier_name = v_product.supplier_name,
             purchase_cost = COALESCE(v_product.cost,0),
             sold_reference = NULL,
             customer_id = NULL,
             customer_name = NULL,
             customer_phone = NULL,
             updated_at = now()
       WHERE id = v_registry.id;

      INSERT INTO public.imei_lifecycle_events
        (registry_id, imei, product_id, event_type, from_status, to_status,
         reference_type, reference_id, notes, details, created_by)
      VALUES
        (v_registry.id, v_imei, v_product.id, 'restored', v_registry.status, 'sold',
         'product', v_product.id,
         'Archived product restored with stock reset to zero',
         jsonb_build_object('previous_product_id',v_registry.product_id,
                            'restored_product_id',v_product.id,
                            'stock_reset_to',0),
         auth.uid());
    END IF;
    IF NOT FOUND THEN
      INSERT INTO public.imei_registry
        (imei, product_id, status, supplier_id, supplier_name, purchase_cost, created_by)
      VALUES
        (v_imei, v_product.id, 'sold', v_product.supplier_id,
         v_product.supplier_name, COALESCE(v_product.cost,0), auth.uid())
      RETURNING * INTO v_registry;

      INSERT INTO public.imei_lifecycle_events
        (registry_id, imei, product_id, event_type, to_status,
         reference_type, reference_id, notes, details, created_by)
      VALUES
        (v_registry.id, v_imei, v_product.id, 'restored', 'sold',
         'product', v_product.id,
         'Archived product restored with stock reset to zero; registry repaired',
         jsonb_build_object('stock_reset_to',0,'registry_repaired',true),
         auth.uid());
    END IF;
  END IF;

  -- Never restore archived quantity as sellable stock. It must be physically
  -- verified and entered as a fresh purchase/reacquisition.
  UPDATE public.products
     SET archived_at = NULL,
         stock_quantity = CASE WHEN v_imei ~ '^[0-9]{15}$' THEN 0 ELSE COALESCE(stock_quantity,0) END
   WHERE id = v_product.id;

  RETURN jsonb_build_object(
    'product_id',v_product.id,
    'imei',NULLIF(v_imei,''),
    'stock_quantity',CASE WHEN v_imei ~ '^[0-9]{15}$' THEN 0 ELSE COALESCE(v_product.stock_quantity,0) END,
    'restored',true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_archived_product_safe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_archived_product_safe(uuid) TO authenticated;
