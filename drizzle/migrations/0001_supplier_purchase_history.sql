ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supplier_paid_amount numeric NOT NULL DEFAULT 0;

CREATE TABLE public.supplier_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  product_id uuid,
  purchase_id uuid,
  transaction_type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  quantity integer,
  product_name text,
  product_imei text,
  product_condition text,
  unit_cost numeric,
  source_key text NOT NULL DEFAULT gen_random_uuid()::text UNIQUE,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.supplier_ledger_entries TO authenticated;
GRANT ALL ON public.supplier_ledger_entries TO service_role;
ALTER TABLE public.supplier_ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read supplier ledger" ON public.supplier_ledger_entries FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can add supplier ledger entries" ON public.supplier_ledger_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND (created_by IS NULL OR created_by = auth.uid()));

CREATE TABLE public.product_transaction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type text NOT NULL,
  transaction_id uuid,
  reference_id text,
  product_id uuid,
  supplier_id uuid,
  supplier_name text,
  product_name text NOT NULL,
  product_imei text,
  product_condition text,
  quantity integer NOT NULL DEFAULT 1,
  unit_cost numeric,
  unit_price numeric,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  customer_id uuid,
  customer_name text,
  notes text,
  source_key text NOT NULL DEFAULT gen_random_uuid()::text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_transaction_history TO authenticated;
GRANT ALL ON public.product_transaction_history TO service_role;
ALTER TABLE public.product_transaction_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read product transaction history" ON public.product_transaction_history FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE INDEX supplier_ledger_supplier_created_idx ON public.supplier_ledger_entries (supplier_id, created_at DESC);
CREATE INDEX supplier_ledger_name_created_idx ON public.supplier_ledger_entries (lower(trim(supplier_name)), created_at DESC);
CREATE INDEX supplier_ledger_product_idx ON public.supplier_ledger_entries (product_id, created_at DESC);
CREATE INDEX product_history_product_created_idx ON public.product_transaction_history (product_id, created_at DESC);
CREATE INDEX product_history_imei_created_idx ON public.product_transaction_history (product_imei, created_at DESC);
CREATE INDEX product_history_supplier_created_idx ON public.product_transaction_history (supplier_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.record_product_supplier_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_supplier_id uuid;
  v_supplier_name text;
  v_purchase_id uuid;
  v_purchase_number text;
  v_user_id uuid;
  v_paid numeric;
BEGIN
  IF NEW.supplier_id IS NULL AND nullif(trim(NEW.supplier_name), '') IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.supplier_ledger_entries
    WHERE source_key = 'product-purchase:' || NEW.id::text
  ) THEN
    RETURN NEW;
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to record supplier purchases';
  END IF;

  v_supplier_id := NEW.supplier_id;
  IF v_supplier_id IS NULL THEN
    SELECT s.id INTO v_supplier_id
    FROM public.suppliers s
    WHERE lower(trim(s.name)) = lower(trim(NEW.supplier_name))
    ORDER BY s.created_at, s.id
    LIMIT 1;

    IF v_supplier_id IS NULL THEN
      INSERT INTO public.suppliers (name, phone, photo_url)
      VALUES (trim(NEW.supplier_name), nullif(trim(NEW.supplier_mobile), ''), nullif(trim(NEW.supplier_photo_url), ''))
      RETURNING id INTO v_supplier_id;
    END IF;

    UPDATE public.products SET supplier_id = v_supplier_id WHERE id = NEW.id AND supplier_id IS NULL;
  END IF;

  SELECT s.name INTO v_supplier_name FROM public.suppliers s WHERE s.id = v_supplier_id;
  v_supplier_name := coalesce(v_supplier_name, nullif(trim(NEW.supplier_name), ''), 'Unknown supplier');
  v_paid := coalesce(NEW.supplier_paid_amount, 0);
  v_purchase_id := gen_random_uuid();
  v_purchase_number := 'PUR-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(v_purchase_id::text, '-', ''), 1, 8));

  INSERT INTO public.purchases (id, user_id, supplier_id, purchase_number, total_amount, status, notes)
  VALUES (v_purchase_id, v_user_id, v_supplier_id, v_purchase_number, coalesce(NEW.cost, 0), 'received', 'Product stock-in; IMEI: ' || coalesce(NEW.imei, 'not provided'));

  INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_cost, total_cost, received_quantity)
  VALUES (v_purchase_id, NEW.id, 1, coalesce(NEW.cost, 0), coalesce(NEW.cost, 0), 1);

  INSERT INTO public.supplier_ledger_entries (
    supplier_id, supplier_name, product_id, purchase_id, transaction_type, amount,
    quantity, product_name, product_imei, product_condition, unit_cost,
    source_key, notes, created_by, created_at
  ) VALUES (
    v_supplier_id, v_supplier_name, NEW.id, v_purchase_id, 'purchase', coalesce(NEW.cost, 0),
    1, NEW.name, NEW.imei, NEW.condition, coalesce(NEW.cost, 0),
    'product-purchase:' || NEW.id::text, 'Supplier purchase ' || v_purchase_number, v_user_id, coalesce(NEW.created_at, now())
  );

  INSERT INTO public.product_transaction_history (
    transaction_type, transaction_id, reference_id, product_id, supplier_id, supplier_name,
    product_name, product_imei, product_condition, quantity, unit_cost, total_amount,
    notes, source_key, created_at
  ) VALUES (
    'purchase', v_purchase_id, v_purchase_number, NEW.id, v_supplier_id, v_supplier_name,
    NEW.name, NEW.imei, NEW.condition, 1, coalesce(NEW.cost, 0), coalesce(NEW.cost, 0),
    'Supplier purchase', 'product-purchase:' || NEW.id::text, coalesce(NEW.created_at, now())
  );

  IF v_paid > 0 THEN
    INSERT INTO public.supplier_ledger_entries (
      supplier_id, supplier_name, product_id, purchase_id, transaction_type, amount,
      quantity, product_name, product_imei, product_condition, unit_cost,
      source_key, notes, created_by, created_at
    ) VALUES (
      v_supplier_id, v_supplier_name, NEW.id, v_purchase_id, 'payment', v_paid,
      1, NEW.name, NEW.imei, NEW.condition, coalesce(NEW.cost, 0),
      'product-purchase-payment:' || NEW.id::text, 'Paid when product was added', v_user_id, coalesce(NEW.created_at, now())
    );

    INSERT INTO public.product_transaction_history (
      transaction_type, transaction_id, reference_id, product_id, supplier_id, supplier_name,
      product_name, product_imei, product_condition, quantity, unit_cost, total_amount,
      notes, source_key, created_at
    ) VALUES (
      'payment', v_purchase_id, v_purchase_number, NEW.id, v_supplier_id, v_supplier_name,
      NEW.name, NEW.imei, NEW.condition, 1, coalesce(NEW.cost, 0), v_paid,
      'Paid when product was added', 'product-purchase-payment:' || NEW.id::text, coalesce(NEW.created_at, now())
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_record_product_supplier_purchase
AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.record_product_supplier_purchase();

CREATE OR REPLACE FUNCTION public.record_sale_item_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.product_transaction_history (
    transaction_type, transaction_id, reference_id, product_id, supplier_id, supplier_name,
    product_name, product_imei, product_condition, quantity, unit_cost, unit_price,
    total_amount, payment_method, customer_id, customer_name, notes, source_key, created_at
  )
  SELECT
    'sale', NEW.sale_id, 'SALE-' || left(NEW.sale_id::text, 8), p.id, p.supplier_id,
    coalesce(sup.name, p.supplier_name), p.name, p.imei, coalesce(NEW.condition, p.condition),
    NEW.quantity, p.cost, NEW.unit_price, NEW.total_price, s.payment_method, s.customer_id,
    coalesce(c.name, s.instant_customer_name, 'Walk-in customer'), s.notes,
    'sale-item:' || NEW.id::text, NEW.created_at
  FROM public.products p
  JOIN public.sales s ON s.id = NEW.sale_id
  LEFT JOIN public.suppliers sup ON sup.id = p.supplier_id
  LEFT JOIN public.customers c ON c.id = s.customer_id
  WHERE p.id = NEW.product_id
  ON CONFLICT (source_key) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_record_sale_item_history
AFTER INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.record_sale_item_history();

CREATE OR REPLACE FUNCTION public.record_supplier_return_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_supplier_id uuid;
  v_supplier_name text;
  v_product_name text;
  v_imei text;
  v_condition text;
  v_cost numeric;
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    INSERT INTO public.supplier_ledger_entries (
      supplier_id, supplier_name, product_id, transaction_type, amount,
      quantity, product_name, product_imei, product_condition, unit_cost,
      source_key, notes, created_by, created_at
    )
    SELECT OLD.supplier_id, coalesce(OLD.supplier_name, s.name, 'Unknown supplier'), OLD.product_id,
      'adjustment', OLD.return_amount, OLD.quantity, coalesce(p.name, 'Deleted product'), p.imei,
      p.condition, p.cost, 'supplier-return-reversal:' || gen_random_uuid()::text,
      'Reversed supplier return ' || OLD.id::text, auth.uid(), now()
    FROM (SELECT 1) seed
    LEFT JOIN public.products p ON p.id = OLD.product_id
    LEFT JOIN public.suppliers s ON s.id = OLD.supplier_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT p.supplier_id, coalesce(nullif(trim(NEW.supplier_name), ''), s.name), p.name, p.imei, p.condition, p.cost
  INTO v_supplier_id, v_supplier_name, v_product_name, v_imei, v_condition, v_cost
  FROM public.products p LEFT JOIN public.suppliers s ON s.id = p.supplier_id
  WHERE p.id = NEW.product_id;

  v_supplier_id := coalesce(NEW.supplier_id, v_supplier_id);
  v_supplier_name := coalesce(nullif(trim(NEW.supplier_name), ''), v_supplier_name, 'Unknown supplier');

  INSERT INTO public.supplier_ledger_entries (
    supplier_id, supplier_name, product_id, transaction_type, amount,
    quantity, product_name, product_imei, product_condition, unit_cost,
    source_key, notes, created_by, created_at
  ) VALUES (
    v_supplier_id, v_supplier_name, NEW.product_id, 'supplier_return', NEW.return_amount,
    NEW.quantity, coalesce(v_product_name, 'Deleted product'), v_imei, v_condition, v_cost,
    'supplier-return:' || gen_random_uuid()::text, coalesce(NEW.reason, 'Supplier return') || coalesce(': ' || NEW.notes, ''),
    coalesce(NEW.created_by, auth.uid()), NEW.created_at
  );
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_record_supplier_return_ledger
AFTER INSERT OR UPDATE OR DELETE ON public.supplier_returns
FOR EACH ROW EXECUTE FUNCTION public.record_supplier_return_ledger();

INSERT INTO public.supplier_ledger_entries (
  supplier_id, supplier_name, product_id, transaction_type, amount, quantity,
  product_name, product_imei, product_condition, unit_cost, source_key, notes, created_at
)
SELECT p.supplier_id, coalesce(s.name, nullif(trim(p.supplier_name), ''), 'Unknown supplier'), p.id,
  'historical_purchase', coalesce(p.cost, 0), 1, p.name, p.imei, p.condition, p.cost,
  'legacy-product:' || p.id::text,
  'Legacy product purchase history. Previous payment status is unknown and is not included in the balance.',
  p.created_at
FROM public.products p
LEFT JOIN public.suppliers s ON s.id = p.supplier_id
WHERE (p.supplier_id IS NOT NULL OR nullif(trim(p.supplier_name), '') IS NOT NULL)
ON CONFLICT (source_key) DO NOTHING;

INSERT INTO public.product_transaction_history (
  transaction_type, reference_id, product_id, supplier_id, supplier_name,
  product_name, product_imei, product_condition, quantity, unit_cost, total_amount,
  notes, source_key, created_at
)
SELECT 'historical_purchase', 'LEGACY-' || left(p.id::text, 8), p.id, p.supplier_id,
  coalesce(s.name, nullif(trim(p.supplier_name), ''), 'Unknown supplier'), p.name, p.imei,
  p.condition, 1, p.cost, coalesce(p.cost, 0),
  'Legacy product cost snapshot. Previous payment status is unknown.', 'legacy-product:' || p.id::text, p.created_at
FROM public.products p
LEFT JOIN public.suppliers s ON s.id = p.supplier_id
WHERE (p.supplier_id IS NOT NULL OR nullif(trim(p.supplier_name), '') IS NOT NULL)
ON CONFLICT (source_key) DO NOTHING;

INSERT INTO public.product_transaction_history (
  transaction_type, transaction_id, reference_id, product_id, supplier_id, supplier_name,
  product_name, product_imei, product_condition, quantity, unit_cost, unit_price,
  total_amount, payment_method, customer_id, customer_name, notes, source_key, created_at
)
SELECT 'sale', si.sale_id, 'SALE-' || left(si.sale_id::text, 8), p.id, p.supplier_id,
  coalesce(sup.name, p.supplier_name), p.name, p.imei, coalesce(si.condition, p.condition),
  si.quantity, NULL, si.unit_price, si.total_price, s.payment_method, s.customer_id,
  coalesce(c.name, s.instant_customer_name, 'Walk-in customer'), s.notes,
  'sale-item:' || si.id::text, si.created_at
FROM public.sale_items si
JOIN public.products p ON p.id = si.product_id
JOIN public.sales s ON s.id = si.sale_id
LEFT JOIN public.suppliers sup ON sup.id = p.supplier_id
LEFT JOIN public.customers c ON c.id = s.customer_id
ON CONFLICT (source_key) DO NOTHING;

INSERT INTO public.supplier_ledger_entries (
  supplier_id, supplier_name, product_id, transaction_type, amount, quantity,
  product_name, product_imei, product_condition, unit_cost, source_key, notes, created_by, created_at
)
SELECT coalesce(sr.supplier_id, p.supplier_id), coalesce(nullif(trim(sr.supplier_name), ''), s.name, p.supplier_name, 'Unknown supplier'),
  sr.product_id, 'supplier_return', sr.return_amount, sr.quantity, coalesce(p.name, 'Deleted product'), p.imei,
  p.condition, p.cost, 'supplier-return:' || sr.id::text,
  coalesce(sr.reason, 'Supplier return') || coalesce(': ' || sr.notes, ''), sr.created_by, sr.created_at
FROM public.supplier_returns sr
LEFT JOIN public.products p ON p.id = sr.product_id
LEFT JOIN public.suppliers s ON s.id = coalesce(sr.supplier_id, p.supplier_id)
ON CONFLICT (source_key) DO NOTHING;

INSERT INTO public.product_transaction_history (
  transaction_type, transaction_id, reference_id, product_id, supplier_id, supplier_name,
  product_name, product_imei, product_condition, quantity, unit_cost, total_amount,
  notes, source_key, created_at
)
SELECT 'supplier_return', sr.id, 'SUP-RETURN-' || left(sr.id::text, 8), sr.product_id,
  coalesce(sr.supplier_id, p.supplier_id), coalesce(nullif(trim(sr.supplier_name), ''), s.name, p.supplier_name),
  coalesce(p.name, 'Deleted product'), p.imei, p.condition, sr.quantity, p.cost, sr.return_amount,
  coalesce(sr.reason, 'Supplier return') || coalesce(': ' || sr.notes, ''), 'supplier-return:' || sr.id::text, sr.created_at
FROM public.supplier_returns sr
LEFT JOIN public.products p ON p.id = sr.product_id
LEFT JOIN public.suppliers s ON s.id = coalesce(sr.supplier_id, p.supplier_id)
ON CONFLICT (source_key) DO NOTHING;