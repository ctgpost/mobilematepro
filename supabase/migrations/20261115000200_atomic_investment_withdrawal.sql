-- Serialize withdrawals per investment sector to prevent overdrawing the available balance.
CREATE OR REPLACE FUNCTION public.create_investment_withdrawal_atomic(
  p_sector_id uuid, p_amount numeric, p_purpose text DEFAULT NULL,
  p_notes text DEFAULT NULL, p_entry_date date DEFAULT CURRENT_DATE
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_balance numeric;
  v_entry_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Withdrawal amount must be positive'; END IF;
  PERFORM 1 FROM public.investment_sectors WHERE id=p_sector_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Investment sector not found'; END IF;
  SELECT COALESCE(SUM(CASE WHEN entry_type='deposit' THEN amount WHEN entry_type='withdraw' THEN -amount ELSE 0 END),0)
    INTO v_balance FROM public.investment_entries WHERE sector_id=p_sector_id;
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'Withdrawal exceeds available investment balance (available: %)', v_balance;
  END IF;
  INSERT INTO public.investment_entries(sector_id,amount,entry_type,purpose,notes,entry_date,created_by)
  VALUES(p_sector_id,p_amount,'withdraw',p_purpose,p_notes,coalesce(p_entry_date,CURRENT_DATE),auth.uid())
  RETURNING id INTO v_entry_id;
  RETURN v_entry_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_investment_withdrawal_atomic(uuid,numeric,text,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_investment_withdrawal_atomic(uuid,numeric,text,text,date) TO authenticated;
