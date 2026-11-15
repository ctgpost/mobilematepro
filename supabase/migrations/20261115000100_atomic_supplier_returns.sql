-- Atomic supplier return stock mutation. Ledger/history are maintained by existing
-- supplier_returns triggers in drizzle migrations 0001-0003.
CREATE OR REPLACE FUNCTION public.create_supplier_return_atomic(
  p_product_id uuid,
  p_supplier_id uuid,
  p_supplier_name text,
  p_quantity integer,
  p_return_amount numeric,
  p_reason text,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_return_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Return quantity must be positive'; END IF;
  IF p_return_amount IS NULL OR p_return_amount <= 0 THEN RAISE EXCEPTION 'Return amount must be positive'; END IF;
  SELECT * INTO v_product FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF v_product.stock_quantity < p_quantity THEN RAISE EXCEPTION 'Insufficient stock for supplier return'; END IF;
  INSERT INTO public.supplier_returns(product_id,supplier_id,supplier_name,quantity,return_amount,reason,notes,status,created_by)
  VALUES(p_product_id,p_supplier_id,coalesce(nullif(trim(p_supplier_name),''),v_product.supplier_name),
         p_quantity,p_return_amount,p_reason,p_notes,'completed',auth.uid())
  RETURNING id INTO v_return_id;
  UPDATE public.products SET stock_quantity=stock_quantity-p_quantity,
    last_stock_reason='supplier_return',last_stock_ref=v_return_id::text,updated_at=now()
  WHERE id=p_product_id;
  RETURN v_return_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_supplier_return_atomic(p_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_return public.supplier_returns%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_return FROM public.supplier_returns WHERE id=p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier return not found'; END IF;
  UPDATE public.products SET stock_quantity=stock_quantity+v_return.quantity,
    last_stock_reason='supplier_return_reversal',last_stock_ref=v_return.id::text,updated_at=now()
  WHERE id=v_return.product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Returned product no longer exists; cannot restore stock'; END IF;
  DELETE FROM public.supplier_returns WHERE id=v_return.id;
END; $$;

REVOKE ALL ON FUNCTION public.create_supplier_return_atomic(uuid,uuid,text,integer,numeric,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_supplier_return_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_return_atomic(uuid,uuid,text,integer,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_supplier_return_atomic(uuid) TO authenticated;
