DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'products','sales','sale_items','customers','suppliers','categories',
    'due_payments','returns','supplier_returns','customer_ledger_entries',
    'investment_entries','investment_incomes','investment_sectors',
    'activity_logs','shop_settings','user_roles','profiles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;