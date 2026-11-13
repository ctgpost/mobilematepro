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
    product_id = EXCLUDED.product_id,
    supplier_id = COALESCE(EXCLUDED.supplier_id, imei_registry.supplier_id),
    supplier_name = COALESCE(EXCLUDED.supplier_name, imei_registry.supplier_name),
    purchase_cost = CASE WHEN EXCLUDED.purchase_cost > 0 THEN EXCLUDED.purchase_cost ELSE imei_registry.purchase_cost END,
    updated_at = now()
  RETURNING id INTO v_registry_id;

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
  IF NEW.quantity <> 1 THEN RETURN NEW; END IF;
  SELECT * INTO v_product FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND OR v_product.imei IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = NEW.sale_id;
  SELECT * INTO v_registry FROM public.imei_registry
    WHERE imei = regexp_replace(v_product.imei, '[^0-9]', '', 'g') FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

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
  IF NOT FOUND OR v_product.imei IS NULL OR NEW.quantity <> 1 THEN RETURN NEW; END IF;
  SELECT * INTO v_registry FROM public.imei_registry
    WHERE imei = regexp_replace(v_product.imei, '[^0-9]', '', 'g') FOR UPDATE;
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
