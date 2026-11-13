-- Atomic customer return settlement and safe deletion.
CREATE OR REPLACE FUNCTION public.process_return_atomic(
  p_return_id uuid,
  p_status text,
  p_plan jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return public.returns%ROWTYPE;
  v_sale public.sales%ROWTYPE;
  v_item public.sale_items%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_due numeric := 0;
  v_cash numeric := 0;
  v_credit numeric := 0;
  v_total numeric := 0;
  v_mode text := 'cash';
  v_returned integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_status NOT IN ('approved','rejected','completed') THEN
    RAISE EXCEPTION 'Invalid return status';
  END IF;

  SELECT * INTO v_return FROM public.returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return not found'; END IF;
  IF v_return.status IN ('completed','rejected') THEN
    RAISE EXCEPTION 'Return has already been finalized';
  END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = v_return.sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original sale not found'; END IF;
  SELECT * INTO v_item FROM public.sale_items WHERE id = v_return.sale_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.sale_id <> v_return.sale_id OR v_item.product_id <> v_return.product_id THEN
    RAISE EXCEPTION 'Return item does not match original sale';
  END IF;

  IF p_status = 'completed' THEN
    SELECT COALESCE(SUM(quantity),0)::integer INTO v_returned
      FROM public.returns
      WHERE sale_item_id = v_return.sale_item_id
        AND status IN ('pending','approved','completed')
        AND id <> v_return.id;
    IF v_returned + v_return.quantity > v_item.quantity THEN
      RAISE EXCEPTION 'Returned quantity exceeds sold quantity';
    END IF;
    IF p_plan IS NULL THEN RAISE EXCEPTION 'Settlement plan is required'; END IF;

    v_due := COALESCE((p_plan->>'due_adjusted')::numeric,0);
    v_cash := COALESCE((p_plan->>'cash_refunded')::numeric,0);
    v_credit := COALESCE((p_plan->>'customer_credit')::numeric,0);
    v_mode := COALESCE(p_plan->>'mode','cash');
    IF v_due < 0 OR v_cash < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION 'Settlement values cannot be negative';
    END IF;
    v_total := v_due + v_cash + v_credit;
    IF abs(v_total - v_return.refund_amount) > 0.01 THEN
      RAISE EXCEPTION 'Settlement total must equal return amount';
    END IF;
    IF v_due > COALESCE(v_sale.due_amount,0) THEN
      RAISE EXCEPTION 'Due adjustment exceeds outstanding due';
    END IF;
    IF v_credit > 0 AND v_sale.customer_id IS NULL THEN
      RAISE EXCEPTION 'Store credit requires a registered customer';
    END IF;

    SELECT * INTO v_product FROM public.products WHERE id = v_return.product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    UPDATE public.products
       SET stock_quantity = stock_quantity + v_return.quantity,
           last_stock_reason = 'return',
           last_stock_ref = v_return.id::text,
           updated_at = now()
     WHERE id = v_return.product_id;

    IF v_due > 0 THEN
      UPDATE public.sales
         SET due_amount = due_amount - v_due,
             paid_amount = COALESCE(paid_amount,0) + v_due,
             updated_at = now()
       WHERE id = v_sale.id;
      INSERT INTO public.due_payments(sale_id, amount, payment_method, notes, collected_by)
      VALUES (v_sale.id, v_due, 'return_adjustment',
              'Return settlement ' || left(v_return.id::text,8), auth.uid());
    END IF;

    IF v_credit > 0 THEN
      INSERT INTO public.customer_ledger_entries(customer_id, amount, entry_type, description, created_by)
      VALUES (v_sale.customer_id, v_credit, 'credit',
              CASE WHEN v_mode = 'exchange' THEN 'Exchange credit ' ELSE 'Return store credit ' END || left(v_return.id::text,8),
              auth.uid());
    END IF;

    UPDATE public.returns
       SET status = 'completed',
           refund_mode = v_mode,
           due_adjusted = v_due,
           cash_refunded = v_cash,
           customer_credit = v_credit,
           processed_by = auth.uid(),
           updated_at = now()
     WHERE id = v_return.id;

    INSERT INTO public.return_audit_logs(
      return_type, return_id, action, user_id, product_id, quantity,
      stock_delta, amount_delta, previous_status, new_status, notes
    ) VALUES (
      'sales', v_return.id, 'completed', auth.uid(), v_return.product_id,
      v_return.quantity, v_return.quantity, v_return.refund_amount,
      v_return.status, 'completed',
      jsonb_build_object('plan',p_plan,'sale_id',v_sale.id)
    );
  ELSE
    UPDATE public.returns
       SET status = p_status, processed_by = auth.uid(), updated_at = now()
     WHERE id = v_return.id;
    INSERT INTO public.return_audit_logs(
      return_type, return_id, action, user_id, product_id, quantity,
      amount_delta, previous_status, new_status, notes
    ) VALUES (
      'sales', v_return.id, p_status, auth.uid(), v_return.product_id,
      v_return.quantity, v_return.refund_amount, v_return.status, p_status,
      jsonb_build_object('sale_id',v_sale.id)
    );
  END IF;

  RETURN jsonb_build_object('return_id',v_return.id,'status',p_status,'mode',v_mode);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_unprocessed_return_atomic(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_return public.returns%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_return FROM public.returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return not found'; END IF;
  IF v_return.status NOT IN ('pending','rejected') THEN
    RAISE EXCEPTION 'Approved or completed returns cannot be deleted; use an audited reversal workflow';
  END IF;
  INSERT INTO public.return_audit_logs(
    return_type, return_id, action, user_id, product_id, quantity,
    amount_delta, previous_status, new_status
  ) VALUES (
    'sales', v_return.id, 'deleted', auth.uid(), v_return.product_id,
    v_return.quantity, -v_return.refund_amount, v_return.status, NULL
  );
  DELETE FROM public.returns WHERE id = p_return_id;
END;
$$;

REVOKE ALL ON FUNCTION public.process_return_atomic(uuid,text,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_unprocessed_return_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_return_atomic(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_unprocessed_return_atomic(uuid) TO authenticated;
