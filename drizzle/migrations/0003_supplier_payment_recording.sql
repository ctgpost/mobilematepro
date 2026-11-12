CREATE OR REPLACE FUNCTION public.record_supplier_payment(
  p_supplier_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_supplier_name text;
  v_entry_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Sign in is required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
  SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = p_supplier_id;
  IF v_supplier_name IS NULL THEN RAISE EXCEPTION 'Supplier not found'; END IF;
  INSERT INTO public.supplier_ledger_entries (
    supplier_id, supplier_name, transaction_type, amount, payment_method,
    source_key, notes, created_by
  ) VALUES (
    p_supplier_id, v_supplier_name, 'payment', -p_amount, p_payment_method,
    'supplier-payment:' || gen_random_uuid()::text, nullif(trim(p_notes), ''), v_user_id
  ) RETURNING id INTO v_entry_id;
  INSERT INTO public.product_transaction_history (
    transaction_type, supplier_id, supplier_name, product_name, quantity,
    total_amount, payment_method, notes, source_key
  ) VALUES (
    'supplier_payment', p_supplier_id, v_supplier_name, 'Supplier account payment', 0,
    p_amount, p_payment_method, nullif(trim(p_notes), ''), 'supplier-payment-history:' || v_entry_id::text
  );
  RETURN v_entry_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_supplier_payment(uuid, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_supplier_payment(uuid, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment(uuid, numeric, text, text) TO authenticated;

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
    SELECT coalesce(OLD.supplier_id, p.supplier_id), coalesce(OLD.supplier_name, s.name, p.supplier_name, 'Unknown supplier'), OLD.product_id,
      'adjustment', abs(OLD.return_amount), OLD.quantity, coalesce(p.name, 'Deleted product'),
      p.imei, p.condition, p.cost, 'supplier-return-reversal:' || OLD.id::text || ':' || gen_random_uuid()::text,
      'Reversed supplier return ' || OLD.id::text, auth.uid(), now()
    FROM (SELECT 1) seed LEFT JOIN public.products p ON p.id = OLD.product_id
    LEFT JOIN public.suppliers s ON s.id = coalesce(OLD.supplier_id, p.supplier_id);
    INSERT INTO public.product_transaction_history (
      transaction_type, transaction_id, reference_id, product_id, supplier_id, supplier_name,
      product_name, product_imei, product_condition, quantity, unit_cost, total_amount,
      notes, source_key, created_at
    )
    SELECT 'supplier_return_reversal', OLD.id, 'SUP-RETURN-' || left(OLD.id::text, 8), OLD.product_id,
      coalesce(OLD.supplier_id, p.supplier_id), coalesce(OLD.supplier_name, s.name, p.supplier_name),
      coalesce(p.name, 'Deleted product'), p.imei, p.condition, OLD.quantity, p.cost, OLD.return_amount,
      'Supplier return reversed', 'supplier-return-reversal-history:' || OLD.id::text || ':' || gen_random_uuid()::text, now()
    FROM (SELECT 1) seed LEFT JOIN public.products p ON p.id = OLD.product_id
    LEFT JOIN public.suppliers s ON s.id = coalesce(OLD.supplier_id, p.supplier_id);
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
    'supplier-return:' || NEW.id::text || ':' || gen_random_uuid()::text,
    coalesce(NEW.reason, 'Supplier return') || coalesce(': ' || NEW.notes, ''),
    coalesce(NEW.created_by, auth.uid()), NEW.created_at
  );
  INSERT INTO public.product_transaction_history (
    transaction_type, transaction_id, reference_id, product_id, supplier_id, supplier_name,
    product_name, product_imei, product_condition, quantity, unit_cost, total_amount,
    notes, source_key, created_at
  ) VALUES (
    'supplier_return', NEW.id, 'SUP-RETURN-' || left(NEW.id::text, 8), NEW.product_id,
    v_supplier_id, v_supplier_name, coalesce(v_product_name, 'Deleted product'), v_imei,
    v_condition, NEW.quantity, v_cost, NEW.return_amount,
    coalesce(NEW.reason, 'Supplier return') || coalesce(': ' || NEW.notes, ''),
    'supplier-return-history:' || NEW.id::text || ':' || gen_random_uuid()::text, NEW.created_at
  );
  RETURN NEW;
END;
$function$;