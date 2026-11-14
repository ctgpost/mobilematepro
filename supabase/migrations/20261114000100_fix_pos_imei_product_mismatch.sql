-- Fix POS IMEI association when legacy products.imei is stale or belongs to another product.
-- Explicit sale_items.imei is authoritative; implicit fallback is scoped to the sold product.

CREATE OR REPLACE FUNCTION public.capture_imei_sale_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_sale public.sales%ROWTYPE;
  v_registry public.imei_registry%ROWTYPE;
  v_available_count integer;
  v_explicit_imei text := regexp_replace(COALESCE(NEW.imei,''), '[^0-9]', '', 'g');
BEGIN
  IF NEW.quantity <> 1 THEN
    IF NEW.imei IS NOT NULL THEN
      RAISE EXCEPTION 'An IMEI sale line must have quantity 1';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF COALESCE(v_product.stock_quantity,0) < 1 THEN
    RAISE EXCEPTION 'Product is out of stock; IMEI sale rejected';
  END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = NEW.sale_id;

  IF v_explicit_imei <> '' THEN
    -- An explicitly scanned/selected IMEI must match this exact product.
    SELECT * INTO v_registry FROM public.imei_registry
      WHERE imei = v_explicit_imei FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'IMEI is not registered'; END IF;
    IF v_registry.product_id <> NEW.product_id THEN
      RAISE EXCEPTION 'IMEI belongs to a different product';
    END IF;
  ELSE
    -- Never use products.imei blindly: older records may contain a stale IMEI
    -- copied from another product. Resolve only within this product's registry.
    SELECT COUNT(*) INTO v_available_count
      FROM public.imei_registry
      WHERE product_id = NEW.product_id AND status IN ('in_stock','returned');
    IF v_available_count > 1 THEN
      RAISE EXCEPTION 'Select an IMEI for this device before completing the sale';
    ELSIF v_available_count = 1 THEN
      SELECT * INTO v_registry FROM public.imei_registry
        WHERE product_id = NEW.product_id AND status IN ('in_stock','returned')
        ORDER BY created_at ASC LIMIT 1 FOR UPDATE;
      NEW.imei := v_registry.imei;
    ELSE
      -- Ordinary non-IMEI stock sale: no lifecycle row to update.
      RETURN NEW;
    END IF;
  END IF;

  IF v_registry.status NOT IN ('in_stock','returned') THEN
    RAISE EXCEPTION 'IMEI is not available for sale (current status: %)', v_registry.status;
  END IF;

  UPDATE public.imei_registry
     SET status = 'sold', sold_reference = NEW.sale_id::text,
         customer_id = v_sale.customer_id,
         customer_name = COALESCE(v_sale.instant_customer_name,
           (SELECT c.name FROM public.customers c WHERE c.id = v_sale.customer_id)),
         customer_phone = v_sale.instant_customer_phone,
         updated_at = now()
   WHERE id = v_registry.id;

  INSERT INTO public.imei_lifecycle_events
    (registry_id, imei, product_id, event_type, from_status, to_status,
     reference_type, reference_id, party_type, party_id, party_name,
     quantity, unit_cost, unit_price, amount, payment_method, details, created_by)
  VALUES
    (v_registry.id, v_registry.imei, NEW.product_id, 'sold', v_registry.status, 'sold',
     'sale', NEW.sale_id, 'customer', v_sale.customer_id,
     COALESCE(v_sale.instant_customer_name,
       (SELECT c.name FROM public.customers c WHERE c.id = v_sale.customer_id)),
     1, COALESCE(v_product.cost,0), NEW.unit_price, NEW.total_price,
     v_sale.payment_method, jsonb_build_object('sale_item_id',NEW.id), auth.uid());

  RETURN NEW;
END;
$$;
