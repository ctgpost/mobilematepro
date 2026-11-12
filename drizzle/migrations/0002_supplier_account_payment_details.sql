ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supplier_payment_method text;
ALTER TABLE public.supplier_ledger_entries ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.product_transaction_history ADD COLUMN IF NOT EXISTS payment_method text;

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
  IF EXISTS (SELECT 1 FROM public.supplier_ledger_entries WHERE source_key = 'product-purchase:' || NEW.id::text) THEN
    RETURN NEW;
  END IF;
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Sign in is required to record supplier purchases'; END IF;
  v_supplier_id := NEW.supplier_id;
  IF v_supplier_id IS NULL THEN
    SELECT s.id INTO v_supplier_id FROM public.suppliers s
    WHERE lower(trim(s.name)) = lower(trim(NEW.supplier_name)) ORDER BY s.created_at, s.id LIMIT 1;
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
    quantity, product_name, product_imei, product_condition, unit_cost, source_key,
    notes, created_by, created_at
  ) VALUES (
    v_supplier_id, v_supplier_name, NEW.id, v_purchase_id, 'purchase', coalesce(NEW.cost, 0),
    1, NEW.name, NEW.imei, NEW.condition, coalesce(NEW.cost, 0), 'product-purchase:' || NEW.id::text,
    'Supplier purchase ' || v_purchase_number, v_user_id, coalesce(NEW.created_at, now())
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
  IF v_paid <> 0 THEN
    INSERT INTO public.supplier_ledger_entries (
      supplier_id, supplier_name, product_id, purchase_id, transaction_type, amount,
      quantity, product_name, product_imei, product_condition, unit_cost, payment_method,
      source_key, notes, created_by, created_at
    ) VALUES (
      v_supplier_id, v_supplier_name, NEW.id, v_purchase_id, 'payment', -v_paid,
      1, NEW.name, NEW.imei, NEW.condition, coalesce(NEW.cost, 0), NEW.supplier_payment_method,
      'product-purchase-payment:' || NEW.id::text, 'Paid when product was added', v_user_id, coalesce(NEW.created_at, now())
    );
    INSERT INTO public.product_transaction_history (
      transaction_type, transaction_id, reference_id, product_id, supplier_id, supplier_name,
      product_name, product_imei, product_condition, quantity, unit_cost, total_amount,
      payment_method, notes, source_key, created_at
    ) VALUES (
      'payment', v_purchase_id, v_purchase_number, NEW.id, v_supplier_id, v_supplier_name,
      NEW.name, NEW.imei, NEW.condition, 1, coalesce(NEW.cost, 0), v_paid,
      NEW.supplier_payment_method, 'Paid when product was added',
      'product-purchase-payment:' || NEW.id::text, coalesce(NEW.created_at, now())
    );
  END IF;
  RETURN NEW;
END;
$function$;

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
      supplier_id, supplier_name, product_id, transaction_type, amount, quantity,
      product_name, product_imei, product_condition, unit_cost, source_key,
      notes, created_by, created_at
    )
    SELECT OLD.supplier_id, coalesce(OLD.supplier_name, s.name, 'Unknown supplier'), OLD.product_id,
      'adjustment', abs(OLD.return_amount), OLD.quantity, coalesce(p.name, 'Deleted product'),
      p.imei, p.condition, p.cost, 'supplier-return-reversal:' || gen_random_uuid()::text,
      'Reversed supplier return ' || OLD.id::text, auth.uid(), now()
    FROM (SELECT 1) seed
    LEFT JOIN public.products p ON p.id = OLD.product_id
    LEFT JOIN public.suppliers s ON s.id = OLD.supplier_id;
    INSERT INTO public.product_transaction_history (
      transaction_type, transaction_id, reference_id, product_id, supplier_id, supplier_name,
      product_name, product_imei, product_condition, quantity, unit_cost, total_amount,
      notes, source_key, created_at
    )
    SELECT 'supplier_return_reversal', OLD.id, 'SUP-RETURN-' || left(OLD.id::text, 8), OLD.product_id,
      coalesce(OLD.supplier_id, p.supplier_id), coalesce(OLD.supplier_name, s.name, p.supplier_name),
      coalesce(p.name, 'Deleted product'), p.imei, p.condition, OLD.quantity, p.cost, OLD.return_amount,
      'Supplier return reversed', 'supplier-return-reversal:' || gen_random_uuid()::text, now()
    FROM (SELECT 1) seed LEFT JOIN public.products p ON p.id = OLD.product_id
    LEFT JOIN public.suppliers s ON s.id = OLD.supplier_id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  SELECT p.supplier_id, coalesce(nullif(trim(NEW.supplier_name), ''), s.name), p.name, p.imei, p.condition, p.cost
  INTO v_supplier_id, v_supplier_name, v_product_name, v_imei, v_condition, v_cost
  FROM public.products p LEFT JOIN public.suppliers s ON s.id = p.supplier_id WHERE p.id = NEW.product_id;
  v_supplier_id := coalesce(NEW.supplier_id, v_supplier_id);
  v_supplier_name := coalesce(nullif(trim(NEW.supplier_name), ''), v_supplier_name, 'Unknown supplier');
  INSERT INTO public.supplier_ledger_entries (
    supplier_id, supplier_name, product_id, transaction_type, amount, quantity,
    product_name, product_imei, product_condition, unit_cost, source_key,
    notes, created_by, created_at
  ) VALUES (
    v_supplier_id, v_supplier_name, NEW.product_id, 'supplier_return', -abs(NEW.return_amount),
    NEW.quantity, coalesce(v_product_name, 'Deleted product'), v_imei, v_condition, v_cost,
    'supplier-return:' || NEW.id::text, coalesce(NEW.reason, 'Supplier return') || coalesce(': ' || NEW.notes, ''),
    coalesce(NEW.created_by, auth.uid()), NEW.created_at
  ) ON CONFLICT (source_key) DO NOTHING;
  INSERT INTO public.product_transaction_history (
    transaction_type, transaction_id, reference_id, product_id, supplier_id, supplier_name,
    product_name, product_imei, product_condition, quantity, unit_cost, total_amount,
    notes, source_key, created_at
  ) VALUES (
    'supplier_return', NEW.id, 'SUP-RETURN-' || left(NEW.id::text, 8), NEW.product_id,
    v_supplier_id, v_supplier_name, coalesce(v_product_name, 'Deleted product'), v_imei,
    v_condition, NEW.quantity, v_cost, NEW.return_amount,
    coalesce(NEW.reason, 'Supplier return') || coalesce(': ' || NEW.notes, ''),
    'supplier-return:' || NEW.id::text, NEW.created_at
  ) ON CONFLICT (source_key) DO NOTHING;
  RETURN NEW;
END;
$function$;