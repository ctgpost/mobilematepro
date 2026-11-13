-- Atomic due collection: lock sale, validate outstanding balance, record payment and update balance.
CREATE OR REPLACE FUNCTION public.collect_sale_due(
  p_sale_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_notes text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_new_due numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000 THEN RAISE EXCEPTION 'Invalid collection amount'; END IF;
  IF p_payment_method NOT IN ('cash','card','mobile','bank','other') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id=p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF v_sale.user_id <> auth.uid() AND NOT public.has_role(auth.uid(),'admin') AND NOT public.has_role(auth.uid(),'manager') THEN
    RAISE EXCEPTION 'Not allowed to collect this sale';
  END IF;
  IF COALESCE(v_sale.due_amount,0) < p_amount THEN RAISE EXCEPTION 'Collection exceeds outstanding due'; END IF;

  v_new_due := COALESCE(v_sale.due_amount,0)-p_amount;
  INSERT INTO public.due_payments(sale_id,amount,payment_method,notes,collected_by)
  VALUES (p_sale_id,p_amount,p_payment_method,p_notes,auth.uid());
  UPDATE public.sales SET due_amount=v_new_due,paid_amount=COALESCE(paid_amount,0)+p_amount WHERE id=p_sale_id;
  RETURN v_new_due;
END;
$$;
REVOKE ALL ON FUNCTION public.collect_sale_due(uuid,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collect_sale_due(uuid,numeric,text,text) TO authenticated;
