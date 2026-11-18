-- Expense management and double-entry journal foundation.
-- No historical business transactions are rewritten by this migration.

CREATE TABLE IF NOT EXISTS public.accounting_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code text NOT NULL UNIQUE,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit','credit')),
  is_system boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.accounting_accounts (account_code, account_name, account_type, normal_balance) VALUES
('1000','Cash on Hand','asset','debit'),
('1010','Bank Account','asset','debit'),
('1020','Mobile Financial Services','asset','debit'),
('1100','Inventory','asset','debit'),
('1200','Accounts Receivable','asset','debit'),
('2000','Accounts Payable','liability','credit'),
('3000','Owner Capital','equity','credit'),
('3100','Retained Earnings / Opening Equity','equity','credit'),
('4000','Sales Revenue','revenue','credit'),
('4050','Sales Returns','revenue','debit'),
('5000','Cost of Goods Sold','expense','debit'),
('7000','Investment Income','revenue','credit'),
('6100','Rent Expense','expense','debit'),
('6110','Salary & Wages','expense','debit'),
('6120','Utility Expense','expense','debit'),
('6130','Transport & Delivery','expense','debit'),
('6140','Repair & Maintenance','expense','debit'),
('6150','Marketing & Advertising','expense','debit'),
('6160','Office & Shop Supplies','expense','debit'),
('6190','Other Operating Expense','expense','debit')
ON CONFLICT (account_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  account_code text NOT NULL REFERENCES public.accounting_accounts(account_code),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.expense_categories (name, account_code) VALUES
('দোকান ভাড়া','6100'),
('বেতন ও মজুরি','6110'),
('বিদ্যুৎ, পানি ও গ্যাস','6120'),
('পরিবহন ও ডেলিভারি','6130'),
('মেরামত ও রক্ষণাবেক্ষণ','6140'),
('মার্কেটিং ও বিজ্ঞাপন','6150'),
('অফিস ও দোকানের সামগ্রী','6160'),
('অন্যান্য পরিচালন ব্যয়','6190')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.accounting_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL,
  description text NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  is_reversal boolean NOT NULL DEFAULT false,
  reversal_of uuid REFERENCES public.accounting_journal_entries(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);

CREATE TABLE IF NOT EXISTS public.accounting_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES public.accounting_journal_entries(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  line_number integer NOT NULL,
  debit numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journal_entry_id, line_number),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category_id uuid NOT NULL REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
  description text NOT NULL,
  payee text,
  reference_number text,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  payment_method text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','bank','mobile','card','other')),
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  CHECK (paid_amount <= amount),
  CHECK ((paid_amount = 0) OR payment_method IN ('cash','bank','mobile','card','other'))
);

CREATE INDEX IF NOT EXISTS expenses_date_idx ON public.expenses(expense_date DESC) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS journal_entries_date_idx ON public.accounting_journal_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON public.accounting_journal_lines(account_id, journal_entry_id);

ALTER TABLE public.accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.accounting_accounts, public.expense_categories TO authenticated;
GRANT SELECT ON public.accounting_journal_entries, public.accounting_journal_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.expenses TO authenticated;
GRANT INSERT ON public.accounting_journal_entries, public.accounting_journal_lines TO authenticated;
GRANT ALL ON public.accounting_accounts, public.expense_categories, public.accounting_journal_entries, public.accounting_journal_lines, public.expenses TO service_role;

CREATE POLICY "authenticated read accounting accounts" ON public.accounting_accounts
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated read expense categories" ON public.expense_categories
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin manager read accounting journals" ON public.accounting_journal_entries
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "admin manager read accounting journal lines" ON public.accounting_journal_lines
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "admin manager insert accounting journal entries" ON public.accounting_journal_entries
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "admin manager insert accounting journal lines" ON public.accounting_journal_lines
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "admin manager read expenses" ON public.expenses
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "admin manager insert expenses" ON public.expenses
  FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND created_by = auth.uid());
CREATE POLICY "admin manager update expenses" ON public.expenses
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE OR REPLACE FUNCTION public.create_expense_atomic(p_expense jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_expense_id uuid;
  v_journal_id uuid;
  v_category public.expense_categories%ROWTYPE;
  v_expense_account public.accounting_accounts%ROWTYPE;
  v_cash_account public.accounting_accounts%ROWTYPE;
  v_amount numeric(14,2);
  v_paid numeric(14,2);
  v_method text;
  v_date date;
  v_description text;
  v_payable numeric(14,2);
  v_cash_code text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT (public.has_role(v_user_id,'admin') OR public.has_role(v_user_id,'manager')) THEN
    RAISE EXCEPTION 'Only admin or manager can record expenses';
  END IF;

  v_amount := round((p_expense->>'amount')::numeric,2);
  v_paid := round(coalesce((p_expense->>'paid_amount')::numeric,0),2);
  v_method := coalesce(p_expense->>'payment_method','cash');
  v_date := coalesce(nullif(p_expense->>'expense_date','')::date,current_date);
  v_description := nullif(trim(p_expense->>'description'),'');
  IF v_amount IS NULL OR v_amount <= 0 OR v_paid < 0 OR v_paid > v_amount THEN
    RAISE EXCEPTION 'Invalid expense amount or paid amount';
  END IF;
  IF v_description IS NULL THEN RAISE EXCEPTION 'Expense description is required'; END IF;
  IF v_method NOT IN ('cash','bank','mobile','card','other') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;

  SELECT * INTO v_category FROM public.expense_categories
  WHERE id = (p_expense->>'category_id')::uuid AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense category not found or inactive'; END IF;
  SELECT * INTO v_expense_account FROM public.accounting_accounts WHERE account_code=v_category.account_code AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense account mapping is missing'; END IF;

  v_cash_code := CASE v_method WHEN 'bank' THEN '1010' WHEN 'mobile' THEN '1020' ELSE '1000' END;
  SELECT * INTO v_cash_account FROM public.accounting_accounts WHERE account_code=v_cash_code AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment account is missing'; END IF;

  INSERT INTO public.expenses(expense_date,category_id,description,payee,reference_number,amount,paid_amount,payment_method,notes,created_by)
  VALUES(v_date,(p_expense->>'category_id')::uuid,v_description,nullif(trim(p_expense->>'payee'),''),nullif(trim(p_expense->>'reference_number'),''),v_amount,v_paid,v_method,nullif(trim(p_expense->>'notes'),''),v_user_id)
  RETURNING id INTO v_expense_id;

  INSERT INTO public.accounting_journal_entries(entry_date,description,source_type,source_id,created_by)
  VALUES(v_date,'Expense: '||v_description,'expense',v_expense_id,v_user_id)
  RETURNING id INTO v_journal_id;

  INSERT INTO public.accounting_journal_lines(journal_entry_id,account_id,line_number,debit,credit,memo)
  VALUES(v_journal_id,v_expense_account.id,1,v_amount,0,v_description);

  v_payable := v_amount-v_paid;
  IF v_paid > 0 THEN
    INSERT INTO public.accounting_journal_lines(journal_entry_id,account_id,line_number,debit,credit,memo)
    VALUES(v_journal_id,v_cash_account.id,2,0,v_paid,'Paid by '||v_method);
  END IF;
  IF v_payable > 0 THEN
    INSERT INTO public.accounting_journal_lines(journal_entry_id,account_id,line_number,debit,credit,memo)
    SELECT v_journal_id,id,3,0,v_payable,'Unpaid expense payable'
    FROM public.accounting_accounts WHERE account_code='2000';
  END IF;
  RETURN v_expense_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_expense_atomic(p_expense_id uuid,p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_expense public.expenses%ROWTYPE;
  v_original public.accounting_journal_entries%ROWTYPE;
  v_reversal_id uuid;
BEGIN
  IF v_user_id IS NULL OR NOT (public.has_role(v_user_id,'admin') OR public.has_role(v_user_id,'manager')) THEN
    RAISE EXCEPTION 'Only admin or manager can void expenses';
  END IF;
  SELECT * INTO v_expense FROM public.expenses WHERE id=p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF v_expense.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Expense is already voided'; END IF;
  SELECT * INTO v_original FROM public.accounting_journal_entries WHERE source_type='expense' AND source_id=p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original journal entry is missing'; END IF;

  INSERT INTO public.accounting_journal_entries(entry_date,description,source_type,source_id,is_reversal,reversal_of,created_by)
  VALUES(current_date,'Reversal: '||v_expense.description,'expense_void',p_expense_id,true,v_original.id,v_user_id)
  RETURNING id INTO v_reversal_id;

  INSERT INTO public.accounting_journal_lines(journal_entry_id,account_id,line_number,debit,credit,memo)
  SELECT v_reversal_id,account_id,line_number,credit,debit,'Reversal of '||coalesce(memo,v_expense.description)
  FROM public.accounting_journal_lines WHERE journal_entry_id=v_original.id;

  UPDATE public.expenses SET voided_at=now(),voided_by=v_user_id,void_reason=nullif(trim(p_reason),'')
  WHERE id=p_expense_id;
  RETURN v_reversal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_expense_atomic(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_expense_atomic(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_expense_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_expense_atomic(uuid,text) TO authenticated;
