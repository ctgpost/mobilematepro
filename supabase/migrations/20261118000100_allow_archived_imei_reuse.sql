-- Allow an IMEI to be registered to a new product after the previous product
-- is archived, its stock is exhausted, or that specific device was sold/returned.
-- The registry remains one-row-per-IMEI; immutable lifecycle events retain history.

CREATE OR REPLACE FUNCTION public.sync_product_imei_registry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_imei text;
  v_registry public.imei_registry%ROWTYPE;
  v_registry_id uuid;
  v_status text;
  v_previous_product public.products%ROWTYPE;
  v_reuse boolean := false;
BEGIN
  v_imei := regexp_replace(COALESCE(NEW.imei,''), '[^0-9]', '', 'g');
  IF v_imei !~ '^[0-9]{15}$' THEN
    RETURN NEW;
  END IF;

  v_status := CASE WHEN COALESCE(NEW.stock_quantity,0) > 0 THEN 'in_stock' ELSE 'sold' END;

  SELECT * INTO v_registry
    FROM public.imei_registry
   WHERE imei = v_imei
   FOR UPDATE;

  IF FOUND AND v_registry.product_id <> NEW.id THEN
    SELECT * INTO v_previous_product
      FROM public.products
     WHERE id = v_registry.product_id
     FOR UPDATE;

    -- An old zero-stock row may keep its IMEI forever for historical reference.
    -- A soft-deleted/archived row is also inactive even if its old stock field
    -- was not cleared at archive time.
    IF COALESCE(NEW.stock_quantity,0) = 0
       AND COALESCE(v_previous_product.stock_quantity,0) = 0 THEN
      RETURN NEW;
    END IF;

    IF v_previous_product.archived_at IS NULL
       AND COALESCE(v_previous_product.stock_quantity,0) > 0
       AND v_registry.status NOT IN ('sold','returned') THEN
      RAISE EXCEPTION 'IMEI % is currently assigned to active product % with available stock',
        v_imei, v_registry.product_id
        USING ERRCODE = '23505';
    END IF;

    v_reuse := true;
  END IF;

  IF v_reuse THEN
    UPDATE public.imei_registry
       SET product_id = NEW.id,
           status = v_status,
           supplier_id = NEW.supplier_id,
           supplier_name = NEW.supplier_name,
           purchase_cost = COALESCE(NEW.cost,0),
           sold_reference = NULL,
           customer_id = NULL,
           customer_name = NULL,
           customer_phone = NULL,
           updated_at = now()
     WHERE id = v_registry.id
     RETURNING id INTO v_registry_id;

    INSERT INTO public.imei_lifecycle_events
      (registry_id, imei, product_id, event_type, from_status, to_status,
       reference_type, reference_id, unit_cost, notes, details, created_by)
    VALUES
      (v_registry_id, v_imei, NEW.id, 'registered', v_registry.status, v_status,
       'product', NEW.id, COALESCE(NEW.cost,0),
       'IMEI reused after previous product was archived, sold, or reached zero stock',
       jsonb_build_object(
         'previous_product_id', v_registry.product_id,
         'previous_product_archived_at', v_previous_product.archived_at,
         'previous_product_stock', v_previous_product.stock_quantity,
         'previous_registry_status', v_registry.status,
         'reuse', true
       ),
       auth.uid());
  ELSE
    INSERT INTO public.imei_registry
      (imei, product_id, status, supplier_id, supplier_name, purchase_cost, created_by)
    VALUES
      (v_imei, NEW.id, v_status, NEW.supplier_id, NEW.supplier_name, COALESCE(NEW.cost,0), auth.uid())
    ON CONFLICT (imei) DO UPDATE SET
      supplier_id = COALESCE(EXCLUDED.supplier_id, imei_registry.supplier_id),
      supplier_name = COALESCE(EXCLUDED.supplier_name, imei_registry.supplier_name),
      purchase_cost = CASE
        WHEN EXCLUDED.purchase_cost > 0 THEN EXCLUDED.purchase_cost
        ELSE imei_registry.purchase_cost
      END,
      status = CASE
        WHEN imei_registry.product_id = EXCLUDED.product_id THEN v_status
        ELSE imei_registry.status
      END,
      updated_at = now()
    WHERE imei_registry.product_id = EXCLUDED.product_id
    RETURNING id INTO v_registry_id;

    IF v_registry_id IS NULL THEN
      RAISE EXCEPTION 'IMEI is already registered to a different active product'
        USING ERRCODE = '23505';
    END IF;

    IF TG_OP = 'INSERT' OR OLD.imei IS DISTINCT FROM NEW.imei THEN
      INSERT INTO public.imei_lifecycle_events
        (registry_id, imei, product_id, event_type, to_status,
         reference_type, reference_id, unit_cost, details, created_by)
      VALUES
        (v_registry_id, v_imei, NEW.id, 'registered', v_status,
         'product', NEW.id, COALESCE(NEW.cost,0),
         jsonb_build_object('source','product_trigger'), auth.uid())
      ON CONFLICT DO NOTHING;
    ELSIF OLD.stock_quantity IS DISTINCT FROM NEW.stock_quantity THEN
      INSERT INTO public.imei_lifecycle_events
        (registry_id, imei, product_id, event_type, from_status, to_status,
         reference_type, reference_id, unit_cost, details, created_by)
      VALUES
        (v_registry_id, v_imei, NEW.id, 'stock_changed',
         CASE WHEN COALESCE(OLD.stock_quantity,0) > 0 THEN 'in_stock' ELSE 'sold' END,
         v_status, 'product', NEW.id, COALESCE(NEW.cost,0),
         jsonb_build_object('old_stock',OLD.stock_quantity,'new_stock',NEW.stock_quantity),
         auth.uid());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
