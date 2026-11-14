-- Safe IMEI reuse after prior device stock is exhausted, plus atomic POS checkout.
-- Historical lifecycle events remain immutable and keep their original product references.

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

  SELECT * INTO v_registry FROM public.imei_registry WHERE imei = v_imei FOR UPDATE;
  IF FOUND AND v_registry.product_id <> NEW.id THEN
    SELECT * INTO v_previous_product FROM public.products WHERE id = v_registry.product_id FOR UPDATE;
    -- Old product may retain its legacy imei field at zero stock. Do not let
    -- harmless edits to that exhausted record reclaim the device.
    IF COALESCE(NEW.stock_quantity,0) = 0
       AND COALESCE(v_previous_product.stock_quantity,0) = 0 THEN
      RETURN NEW;
    END IF;
    IF COALESCE(v_previous_product.stock_quantity,0) > 0
       OR v_registry.status NOT IN ('sold','returned') THEN
      RAISE EXCEPTION 'IMEI % is currently assigned to product % with active inventory',
        v_imei, v_registry.product_id
        USING ERRCODE = '23505';
    END IF;
    v_reuse := true;
  END IF;

  IF v_reuse THEN
    UPDATE public.imei_registry
       SET product_id = NEW.id, status = v_status,
           supplier_id = NEW.supplier_id,
           supplier_name = NEW.supplier_name,
           purchase_cost = COALESCE(NEW.cost,0),
           sold_reference = NULL, customer_id = NULL,
           customer_name = NULL, customer_phone = NULL,
           updated_at = now()
     WHERE id = v_registry.id
     RETURNING id INTO v_registry_id;

    INSERT INTO public.imei_lifecycle_events
      (registry_id, imei, product_id, event_type, from_status, to_status,
       reference_type, reference_id, unit_cost, notes, details, created_by)
    VALUES
      (v_registry_id, v_imei, NEW.id, 'registered', v_registry.status, v_status,
       'product', NEW.id, COALESCE(NEW.cost,0),
       'IMEI reused after previous product reached zero stock',
       jsonb_build_object('previous_product_id',v_registry.product_id,'reuse',true), auth.uid());
  ELSE
    INSERT INTO public.imei_registry
      (imei, product_id, status, supplier_id, supplier_name, purchase_cost, created_by)
    VALUES
      (v_imei, NEW.id, v_status, NEW.supplier_id, NEW.supplier_name, COALESCE(NEW.cost,0), auth.uid())
    ON CONFLICT (imei) DO UPDATE SET
      supplier_id = COALESCE(EXCLUDED.supplier_id, imei_registry.supplier_id),
      supplier_name = COALESCE(EXCLUDED.supplier_name, imei_registry.supplier_name),
      purchase_cost = CASE WHEN EXCLUDED.purchase_cost > 0 THEN EXCLUDED.purchase_cost ELSE imei_registry.purchase_cost END,
      status = CASE WHEN imei_registry.product_id = EXCLUDED.product_id THEN v_status ELSE imei_registry.status END,
      updated_at = now()
    WHERE imei_registry.product_id = EXCLUDED.product_id
    RETURNING id INTO v_registry_id;

    IF v_registry_id IS NULL THEN
      RAISE EXCEPTION 'IMEI is already registered to a different active product'
        USING ERRCODE = '23505';
    END IF;

    IF TG_OP = 'INSERT' OR OLD.imei IS DISTINCT FROM NEW.imei THEN
      INSERT INTO public.imei_lifecycle_events
        (registry_id, imei, product_id, event_type, to_status, reference_type, reference_id,
         unit_cost, details, created_by)
      VALUES
        (v_registry_id, v_imei, NEW.id, 'registered', v_status, 'product', NEW.id,
         COALESCE(NEW.cost,0), jsonb_build_object('source','product_trigger'), auth.uid())
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

-- The frontend must not create sale rows, sale items and stock updates as
-- independent requests. This RPC makes checkout a single database transaction.
CREATE OR REPLACE FUNCTION public.complete_pos_sale(p_sale jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_sale_id uuid;
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_quantity integer;
  v_imei text;
  v_item_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF jsonb_typeof(p_sale->'items') <> 'array'
     OR jsonb_array_length(p_sale->'items') = 0 THEN
    RAISE EXCEPTION 'Sale cart is empty';
  END IF;

  INSERT INTO public.sales
    (user_id, customer_id, total_amount, payment_method, status,
     instant_customer_name, instant_customer_phone, paid_amount, due_amount,
     customer_photo_url)
  VALUES
    (v_user_id, NULLIF(p_sale->>'customer_id','')::uuid,
     (p_sale->>'total_amount')::numeric, p_sale->>'payment_method', 'completed',
     NULLIF(p_sale->>'instant_customer_name',''),
     NULLIF(p_sale->>'instant_customer_phone',''),
     COALESCE((p_sale->>'paid_amount')::numeric,0),
     COALESCE((p_sale->>'due_amount')::numeric,0),
     NULLIF(p_sale->>'customer_photo_url',''))
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_sale->'items')
  LOOP
    v_item_count := v_item_count + 1;
    v_quantity := COALESCE((v_item->>'quantity')::integer,0);
    IF v_quantity < 1 THEN RAISE EXCEPTION 'Sale quantity must be at least 1'; END IF;
    IF COALESCE((v_item->>'unit_price')::numeric,0) <= 0 THEN
      RAISE EXCEPTION 'Sale price must be greater than zero';
    END IF;
    IF (v_item->>'product_id') IS NULL THEN RAISE EXCEPTION 'Product ID is required'; END IF;

    SELECT * INTO v_product FROM public.products
      WHERE id = (v_item->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF COALESCE(v_product.stock_quantity,0) < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for % (available %, requested %)',
        v_product.name, COALESCE(v_product.stock_quantity,0), v_quantity;
    END IF;

    v_imei := NULLIF(regexp_replace(COALESCE(v_item->>'imei',''), '[^0-9]', '', 'g'),'');
    IF v_imei IS NOT NULL THEN
      IF v_quantity <> 1 OR v_imei !~ '^[0-9]{15}$' THEN
        RAISE EXCEPTION 'IMEI tracked sale requires exactly one unit and a 15 digit IMEI';
      END IF;
      PERFORM 1 FROM public.imei_registry
        WHERE imei = v_imei AND product_id = v_product.id
          AND status IN ('in_stock','returned') FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'IMEI is not available for this product'; END IF;
    END IF;

    INSERT INTO public.sale_items
      (sale_id, product_id, quantity, unit_price, total_price, imei)
    VALUES (v_sale_id, v_product.id, v_quantity,
      (v_item->>'unit_price')::numeric,
      COALESCE((v_item->>'total_price')::numeric,
        (v_item->>'unit_price')::numeric * v_quantity), v_imei);

    UPDATE public.products
       SET stock_quantity = stock_quantity - v_quantity,
           last_stock_reason = 'sale', last_stock_ref = v_sale_id
     WHERE id = v_product.id;
  END LOOP;

  RETURN v_sale_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_pos_sale(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_pos_sale(jsonb) TO authenticated;
