-- 360-degree IMEI lifecycle registry and immutable event history.
-- Safe to run more than once. Existing product and transaction data is preserved.

CREATE TABLE IF NOT EXISTS public.imei_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imei text NOT NULL UNIQUE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'in_stock'
    CHECK (status IN ('in_stock','reserved','sold','returned','repair','damaged','lost','retired')),
  serial_number text,
  purchase_reference text,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text,
  purchase_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (purchase_cost >= 0),
  sold_reference text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  warranty_start date,
  warranty_end date,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT imei_registry_format CHECK (imei ~ '^[0-9]{15}$')
);

CREATE INDEX IF NOT EXISTS imei_registry_product_idx ON public.imei_registry(product_id);
CREATE INDEX IF NOT EXISTS imei_registry_status_idx ON public.imei_registry(status);
CREATE INDEX IF NOT EXISTS imei_registry_customer_idx ON public.imei_registry(customer_id);
CREATE INDEX IF NOT EXISTS imei_registry_supplier_idx ON public.imei_registry(supplier_id);

CREATE TABLE IF NOT EXISTS public.imei_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id uuid NOT NULL REFERENCES public.imei_registry(id) ON DELETE RESTRICT,
  imei text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  reference_type text,
  reference_id uuid,
  party_type text,
  party_id uuid,
  party_name text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost numeric(14,2),
  unit_price numeric(14,2),
  amount numeric(14,2),
  payment_method text,
  notes text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS imei_events_imei_created_idx
  ON public.imei_lifecycle_events(imei, created_at DESC);
CREATE INDEX IF NOT EXISTS imei_events_product_created_idx
  ON public.imei_lifecycle_events(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS imei_events_reference_idx
  ON public.imei_lifecycle_events(reference_type, reference_id);

ALTER TABLE public.imei_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imei_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read IMEI registry" ON public.imei_registry;
CREATE POLICY "Authenticated users can read IMEI registry"
  ON public.imei_registry FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can manage IMEI registry" ON public.imei_registry;
CREATE POLICY "Authenticated users can manage IMEI registry"
  ON public.imei_registry FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can read IMEI lifecycle events" ON public.imei_lifecycle_events;
CREATE POLICY "Authenticated users can read IMEI lifecycle events"
  ON public.imei_lifecycle_events FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can append IMEI lifecycle events" ON public.imei_lifecycle_events;
CREATE POLICY "Authenticated users can append IMEI lifecycle events"
  ON public.imei_lifecycle_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (created_by IS NULL OR created_by = auth.uid()));

REVOKE UPDATE, DELETE ON public.imei_lifecycle_events FROM authenticated;
GRANT SELECT, INSERT ON public.imei_lifecycle_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.imei_registry TO authenticated;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS imei text;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS imei text;
CREATE INDEX IF NOT EXISTS sale_items_imei_idx ON public.sale_items(imei) WHERE imei IS NOT NULL;
CREATE INDEX IF NOT EXISTS returns_imei_idx ON public.returns(imei) WHERE imei IS NOT NULL;

-- Backfill one IMEI per existing product. Products without an IMEI remain searchable
-- by SKU/barcode and can be registered when a device-level IMEI is supplied.
INSERT INTO public.imei_registry (imei, product_id, status, supplier_id, supplier_name,
                                  purchase_cost, created_at, updated_at, created_by)
SELECT regexp_replace(p.imei, '[^0-9]', '', 'g'), p.id,
       CASE WHEN COALESCE(p.stock_quantity,0) > 0 THEN 'in_stock' ELSE 'sold' END,
       p.supplier_id, p.supplier_name, COALESCE(p.cost,0), p.created_at, now(), auth.uid()
FROM public.products p
WHERE p.imei IS NOT NULL
  AND regexp_replace(p.imei, '[^0-9]', '', 'g') ~ '^[0-9]{15}$'
ON CONFLICT (imei) DO NOTHING;

-- Backfill initial registration event only where no event exists.
INSERT INTO public.imei_lifecycle_events
  (registry_id, imei, product_id, event_type, to_status, reference_type, reference_id,
   unit_cost, notes, details, created_at, created_by)
SELECT r.id, r.imei, r.product_id, 'registered', r.status, 'product', r.product_id,
       r.purchase_cost, 'Imported from existing product record',
       jsonb_build_object('source','migration_backfill'), r.created_at, r.created_by
FROM public.imei_registry r
WHERE NOT EXISTS (
  SELECT 1 FROM public.imei_lifecycle_events e
  WHERE e.registry_id = r.id AND e.event_type = 'registered'
);

CREATE OR REPLACE FUNCTION public.sync_product_imei_registry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_imei text;
  v_registry_id uuid;
  v_status text;
BEGIN
  v_imei := regexp_replace(COALESCE(NEW.imei,''), '[^0-9]', '', 'g');
  IF v_imei !~ '^[0-9]{15}$' THEN
    RETURN NEW;
  END IF;

  v_status := CASE WHEN COALESCE(NEW.stock_quantity,0) > 0 THEN 'in_stock' ELSE 'sold' END;

  INSERT INTO public.imei_registry
    (imei, product_id, status, supplier_id, supplier_name, purchase_cost, created_by)
  VALUES
    (v_imei, NEW.id, v_status, NEW.supplier_id, NEW.supplier_name, COALESCE(NEW.cost,0), auth.uid())
  ON CONFLICT (imei) DO UPDATE SET
    supplier_id = COALESCE(EXCLUDED.supplier_id, imei_registry.supplier_id),
    supplier_name = COALESCE(EXCLUDED.supplier_name, imei_registry.supplier_name),
    purchase_cost = CASE WHEN EXCLUDED.purchase_cost > 0 THEN EXCLUDED.purchase_cost ELSE imei_registry.purchase_cost END,
    updated_at = now()
  WHERE imei_registry.product_id = EXCLUDED.product_id
  RETURNING id INTO v_registry_id;

  IF v_registry_id IS NULL THEN
    RAISE EXCEPTION 'IMEI is already registered to a different product';
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_imei_registry ON public.products;
CREATE TRIGGER trg_sync_product_imei_registry
AFTER INSERT OR UPDATE OF imei, stock_quantity, supplier_id, supplier_name, cost
ON public.products
FOR EACH ROW EXECUTE FUNCTION public.sync_product_imei_registry();

-- Attach sale and return references to the individual IMEI when the product has
-- a single registered device identifier. Bulk/multi-unit products are not guessed.
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
BEGIN
  IF NEW.quantity <> 1 THEN
    IF NEW.imei IS NOT NULL THEN RAISE EXCEPTION 'An IMEI sale line must have quantity 1'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO v_product FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = NEW.sale_id;
  SELECT * INTO v_registry FROM public.imei_registry
    WHERE imei = regexp_replace(COALESCE(NEW.imei, v_product.imei), '[^0-9]', '', 'g') FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
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

DROP TRIGGER IF EXISTS trg_capture_imei_sale_event ON public.sale_items;
CREATE TRIGGER trg_capture_imei_sale_event
AFTER INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.capture_imei_sale_event();

CREATE OR REPLACE FUNCTION public.capture_imei_return_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_registry public.imei_registry%ROWTYPE;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN RETURN NEW; END IF;
  SELECT * INTO v_product FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND OR NEW.quantity <> 1 THEN RETURN NEW; END IF;
  SELECT * INTO v_registry FROM public.imei_registry
    WHERE imei = regexp_replace(COALESCE(NEW.imei, v_product.imei), '[^0-9]', '', 'g') FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  UPDATE public.imei_registry
     SET status = 'returned', updated_at = now()
   WHERE id = v_registry.id;

  INSERT INTO public.imei_lifecycle_events
    (registry_id, imei, product_id, event_type, from_status, to_status,
     reference_type, reference_id, quantity, amount, details, created_by)
  VALUES
    (v_registry.id, v_registry.imei, NEW.product_id, 'returned', v_registry.status,
     'returned', 'return', NEW.id, NEW.quantity, NEW.refund_amount,
     jsonb_build_object('sale_id',NEW.sale_id,'refund_mode',NEW.refund_mode), auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_imei_return_event ON public.returns;
CREATE TRIGGER trg_capture_imei_return_event
AFTER UPDATE OF status ON public.returns
FOR EACH ROW EXECUTE FUNCTION public.capture_imei_return_event();

COMMENT ON TABLE public.imei_registry IS 'One row per physical device IMEI, current lifecycle state and commercial metadata.';
COMMENT ON TABLE public.imei_lifecycle_events IS 'Append-only audit trail of each IMEI lifecycle event.';


-- Atomic device registration: registry row and first audit event are one transaction.
CREATE OR REPLACE FUNCTION public.register_imei_device(
  p_imei text,
  p_product_id uuid,
  p_supplier_id uuid DEFAULT NULL,
  p_supplier_name text DEFAULT NULL,
  p_purchase_cost numeric DEFAULT 0,
  p_purchase_reference text DEFAULT NULL,
  p_warranty_end date DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_imei text := regexp_replace(COALESCE(p_imei,''), '[^0-9]', '', 'g');
  v_product public.products%ROWTYPE;
  v_registry_id uuid;
  v_active_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_imei !~ '^[0-9]{15}$' THEN RAISE EXCEPTION 'IMEI must contain exactly 15 digits'; END IF;
  IF COALESCE(p_purchase_cost,0) < 0 THEN RAISE EXCEPTION 'Purchase cost cannot be negative'; END IF;
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  SELECT COUNT(*) INTO v_active_count FROM public.imei_registry WHERE product_id = p_product_id AND status = 'in_stock';
  IF v_active_count >= COALESCE(v_product.stock_quantity,0) THEN
    RAISE EXCEPTION 'Registered in-stock IMEIs cannot exceed the product stock quantity';
  END IF;

  INSERT INTO public.imei_registry
    (imei, product_id, status, supplier_id, supplier_name, purchase_cost,
     purchase_reference, warranty_start, warranty_end, notes, created_by)
  VALUES
    (v_imei, p_product_id, 'in_stock', p_supplier_id,
     COALESCE(p_supplier_name,v_product.supplier_name), COALESCE(p_purchase_cost,0),
     p_purchase_reference, CASE WHEN p_warranty_end IS NOT NULL THEN CURRENT_DATE END,
     p_warranty_end, p_notes, auth.uid())
  RETURNING id INTO v_registry_id;

  INSERT INTO public.imei_lifecycle_events
    (registry_id, imei, product_id, event_type, to_status, reference_type,
     reference_id, party_type, party_id, party_name, unit_cost, notes, created_by)
  VALUES
    (v_registry_id, v_imei, p_product_id, 'registered', 'in_stock', 'product',
     p_product_id, 'supplier', p_supplier_id,
     COALESCE(p_supplier_name,v_product.supplier_name),
     COALESCE(p_purchase_cost,0), p_notes, auth.uid());
  RETURN v_registry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_imei_lifecycle_event(
  p_imei text,
  p_event_type text,
  p_to_status text DEFAULT NULL,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_party_type text DEFAULT NULL,
  p_party_id uuid DEFAULT NULL,
  p_party_name text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_imei text := regexp_replace(COALESCE(p_imei,''), '[^0-9]', '', 'g');
  v_registry public.imei_registry%ROWTYPE;
  v_event_id uuid;
  v_allowed_events text[] := ARRAY['reserved','sold','returned','repair_started','repair_completed','damaged','lost','found','warranty_claim','warranty_replaced','price_adjustment','status_note','retired'];
  v_allowed_status text[] := ARRAY['in_stock','reserved','sold','returned','repair','damaged','lost','retired'];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_event_type <> ALL(v_allowed_events) THEN RAISE EXCEPTION 'Unsupported IMEI event type'; END IF;
  IF p_to_status IS NOT NULL AND p_to_status <> ALL(v_allowed_status) THEN RAISE EXCEPTION 'Unsupported IMEI status'; END IF;
  IF p_amount IS NOT NULL AND p_amount < 0 THEN RAISE EXCEPTION 'Amount cannot be negative'; END IF;

  SELECT * INTO v_registry FROM public.imei_registry WHERE imei = v_imei FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'IMEI not found in registry'; END IF;

  IF p_to_status IS NOT NULL THEN
    UPDATE public.imei_registry
       SET status = p_to_status,
           sold_reference = CASE WHEN p_to_status = 'sold' AND p_reference_id IS NOT NULL THEN p_reference_id::text ELSE sold_reference END,
           customer_id = CASE WHEN p_party_type = 'customer' THEN p_party_id ELSE customer_id END,
           customer_name = CASE WHEN p_party_type = 'customer' THEN p_party_name ELSE customer_name END,
           updated_at = now()
     WHERE id = v_registry.id;
  END IF;

  INSERT INTO public.imei_lifecycle_events
    (registry_id, imei, product_id, event_type, from_status, to_status,
     reference_type, reference_id, party_type, party_id, party_name,
     unit_cost, amount, payment_method, notes, details, created_by)
  VALUES
    (v_registry.id, v_registry.imei, v_registry.product_id, p_event_type,
     v_registry.status, COALESCE(p_to_status,v_registry.status),
     p_reference_type, p_reference_id, p_party_type, p_party_id, p_party_name,
     v_registry.purchase_cost, p_amount, p_payment_method, p_notes,
     COALESCE(p_details,'{}'::jsonb), auth.uid())
  RETURNING id INTO v_event_id;
  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_imei_device(text,uuid,uuid,text,numeric,text,date,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_imei_lifecycle_event(text,text,text,text,uuid,text,uuid,text,numeric,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_imei_device(text,uuid,uuid,text,numeric,text,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_imei_lifecycle_event(text,text,text,text,uuid,text,uuid,text,numeric,text,text,jsonb) TO authenticated;


-- Enforce that a returned IMEI belongs to the selected original sale line.
CREATE OR REPLACE FUNCTION public.validate_imei_return_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_sale_item public.sale_items%ROWTYPE;
BEGIN
  IF NEW.imei IS NULL THEN RETURN NEW; END IF;
  IF NEW.quantity <> 1 THEN RAISE EXCEPTION 'An IMEI return must have quantity 1'; END IF;
  SELECT * INTO v_sale_item FROM public.sale_items WHERE id = NEW.sale_item_id;
  IF NOT FOUND OR v_sale_item.product_id <> NEW.product_id OR
     regexp_replace(COALESCE(v_sale_item.imei,''), '[^0-9]', '', 'g') <>
     regexp_replace(NEW.imei, '[^0-9]', '', 'g') THEN
    RAISE EXCEPTION 'Return IMEI does not match the original sale item';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_imei_return_link ON public.returns;
CREATE TRIGGER trg_validate_imei_return_link
BEFORE INSERT OR UPDATE OF imei, sale_item_id, product_id, quantity
ON public.returns
FOR EACH ROW EXECUTE FUNCTION public.validate_imei_return_link();


-- Preserve historical sale/return lineage for legacy products that had one IMEI field.
INSERT INTO public.imei_lifecycle_events
  (registry_id, imei, product_id, event_type, from_status, to_status,
   reference_type, reference_id, party_type, party_id, party_name,
   quantity, unit_cost, unit_price, amount, payment_method, details, created_at)
SELECT r.id, r.imei, si.product_id, 'sold', 'in_stock', 'sold',
       'sale', si.sale_id, 'customer', s.customer_id,
       COALESCE(s.instant_customer_name,c.name), 1, COALESCE(p.cost,0),
       si.unit_price, si.total_price, s.payment_method,
       jsonb_build_object('sale_item_id',si.id,'source','historical_backfill'),
       si.created_at
FROM public.sale_items si
JOIN public.products p ON p.id = si.product_id
JOIN public.sales s ON s.id = si.sale_id
LEFT JOIN public.customers c ON c.id = s.customer_id
JOIN public.imei_registry r
  ON r.imei = regexp_replace(COALESCE(si.imei,p.imei), '[^0-9]', '', 'g')
WHERE si.quantity = 1
  AND COALESCE(si.imei,p.imei) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.imei_lifecycle_events e
    WHERE e.event_type = 'sold' AND e.reference_type = 'sale'
      AND e.reference_id = si.sale_id
      AND e.details->>'sale_item_id' = si.id::text
  );

INSERT INTO public.imei_lifecycle_events
  (registry_id, imei, product_id, event_type, from_status, to_status,
   reference_type, reference_id, quantity, amount, details, created_at)
SELECT r.id, r.imei, rt.product_id, 'returned', 'sold', 'returned',
       'return', rt.id, rt.quantity, rt.refund_amount,
       jsonb_build_object('sale_id',rt.sale_id,'source','historical_backfill'),
       rt.updated_at
FROM public.returns rt
JOIN public.products p ON p.id = rt.product_id
JOIN public.imei_registry r
  ON r.imei = regexp_replace(COALESCE(rt.imei,p.imei), '[^0-9]', '', 'g')
WHERE rt.status = 'completed' AND rt.quantity = 1
  AND COALESCE(rt.imei,p.imei) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.imei_lifecycle_events e
    WHERE e.event_type = 'returned' AND e.reference_type = 'return'
      AND e.reference_id = rt.id
  );
