
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'staff');

CREATE TABLE public.user_roles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL, role app_role NOT NULL DEFAULT 'staff', created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), UNIQUE (user_id, role));
CREATE TABLE public.profiles (id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, email TEXT, full_name TEXT, avatar_url TEXT, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles, public.profiles TO authenticated;
GRANT ALL ON public.user_roles, public.profiles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM public, anon, authenticated;
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') $$;
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM public, anon, authenticated;
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID) RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1 $$;
REVOKE EXECUTE ON FUNCTION public.get_user_role(UUID) FROM public, anon, authenticated;

CREATE POLICY "Users can view their own role" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE user_count INTEGER; BEGIN INSERT INTO public.profiles (id, email, full_name) VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)); SELECT COUNT(*) INTO user_count FROM public.user_roles; IF user_count = 0 THEN INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin'); ELSE INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff'); END IF; RETURN NEW; END; $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.activity_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, user_email TEXT, action TEXT NOT NULL, action_type TEXT NOT NULL, details JSONB, ip_address TEXT, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all activity_logs" ON public.activity_logs FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_action_type ON public.activity_logs(action_type);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

CREATE TABLE public.shop_settings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_name text NOT NULL DEFAULT 'MOBILE MATE PRO', shop_subtitle text DEFAULT 'Sales & Stock Management System', shop_address text DEFAULT '', shop_phone text DEFAULT '', logo_url text DEFAULT '', favicon_url text DEFAULT '', default_paper_size text NOT NULL DEFAULT '80mm', print_item_barcodes boolean NOT NULL DEFAULT true, barcode_format text NOT NULL DEFAULT 'CODE128', cloudinary_cloud_name text NOT NULL DEFAULT '', cloudinary_upload_preset text NOT NULL DEFAULT '', created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_settings TO authenticated;
GRANT ALL ON public.shop_settings TO service_role;
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all shop_settings" ON public.shop_settings FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER update_shop_settings_updated_at BEFORE UPDATE ON public.shop_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.shop_settings (shop_name, shop_subtitle) VALUES ('MOBILE MATE PRO', 'Sales & Stock Management System');

ALTER TABLE public.sales ADD COLUMN instant_customer_name text, ADD COLUMN instant_customer_phone text, ADD COLUMN customer_photo_url text, ADD COLUMN paid_amount numeric NOT NULL DEFAULT 0, ADD COLUMN due_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN photo_url text;
ALTER TABLE public.suppliers ADD COLUMN photo_url text;
ALTER TABLE public.products ADD COLUMN supplier_id uuid;
ALTER TABLE public.products ADD COLUMN supplier_photo_url text;
CREATE UNIQUE INDEX products_imei_in_stock_unique ON public.products (imei) WHERE imei IS NOT NULL AND imei <> '' AND stock_quantity > 0;

CREATE TABLE public.due_payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE, amount numeric NOT NULL, payment_method text NOT NULL DEFAULT 'cash', notes text, collected_by uuid, created_at timestamp with time zone NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.due_payments TO authenticated;
GRANT ALL ON public.due_payments TO service_role;
ALTER TABLE public.due_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all due_payments" ON public.due_payments FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE public.investment_sectors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, description text, is_default boolean NOT NULL DEFAULT false, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.investment_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sector_id uuid NOT NULL REFERENCES public.investment_sectors(id) ON DELETE CASCADE, amount numeric NOT NULL, entry_type text NOT NULL DEFAULT 'deposit', purpose text, notes text, entry_date date NOT NULL DEFAULT CURRENT_DATE, created_by uuid, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.investment_incomes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sector_id uuid NOT NULL REFERENCES public.investment_sectors(id) ON DELETE CASCADE, amount numeric NOT NULL, source text, purpose text, notes text, income_date date NOT NULL DEFAULT CURRENT_DATE, created_by uuid, created_at timestamp with time zone NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investment_sectors, public.investment_entries, public.investment_incomes TO authenticated;
GRANT ALL ON public.investment_sectors, public.investment_entries, public.investment_incomes TO service_role;
ALTER TABLE public.investment_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_incomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all investment_sectors" ON public.investment_sectors FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth all investment_entries" ON public.investment_entries FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth all investment_incomes" ON public.investment_incomes FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER update_investment_sectors_updated_at BEFORE UPDATE ON public.investment_sectors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.investment_sectors (name, description, is_default) VALUES ('ফোন এক্সেসরিস', 'ফোন কভার, চার্জার, ইয়ারফোন, গ্লাস প্রটেক্টর', true), ('মোবাইল সার্ভিসিং', 'মোবাইল রিপেয়ার, সফটওয়্যার, হার্ডওয়্যার সার্ভিসিং', true);

CREATE TABLE public.supplier_returns (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id UUID NOT NULL, supplier_id UUID, supplier_name TEXT, quantity INTEGER NOT NULL DEFAULT 1, return_amount NUMERIC NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT 'defective', notes TEXT, status TEXT NOT NULL DEFAULT 'completed', created_by UUID, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_returns TO authenticated;
GRANT ALL ON public.supplier_returns TO service_role;
ALTER TABLE public.supplier_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all supplier_returns" ON public.supplier_returns FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER trg_supplier_returns_updated_at BEFORE UPDATE ON public.supplier_returns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.customer_ledger_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL, entry_date date NOT NULL DEFAULT CURRENT_DATE, entry_type text NOT NULL DEFAULT 'debit', amount numeric NOT NULL DEFAULT 0, description text, created_by uuid, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_ledger_entries TO authenticated;
GRANT ALL ON public.customer_ledger_entries TO service_role;
ALTER TABLE public.customer_ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all customer_ledger" ON public.customer_ledger_entries FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX idx_customer_ledger_entries_customer_id ON public.customer_ledger_entries(customer_id);
CREATE TRIGGER update_customer_ledger_entries_updated_at BEFORE UPDATE ON public.customer_ledger_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.backup_history (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, user_email TEXT, ran_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), tables TEXT[] NOT NULL DEFAULT '{}', counts JSONB NOT NULL DEFAULT '{}'::jsonb, total_records INTEGER NOT NULL DEFAULT 0, download_ok BOOLEAN NOT NULL DEFAULT false, cloud_ok BOOLEAN NOT NULL DEFAULT false, cloud_url TEXT, filename TEXT, trigger_type TEXT NOT NULL DEFAULT 'manual', error TEXT, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_history TO authenticated;
GRANT ALL ON public.backup_history TO service_role;
ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all backup_history" ON public.backup_history FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX idx_backup_history_ran_at ON public.backup_history (ran_at DESC);

CREATE TABLE public.restore_history (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ran_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), user_id UUID, user_email TEXT, source_url TEXT, source_filename TEXT, tables TEXT[] NOT NULL DEFAULT '{}', results JSONB NOT NULL DEFAULT '{}'::jsonb, total_processed INTEGER NOT NULL DEFAULT 0, pre_backup_url TEXT, success BOOLEAN NOT NULL DEFAULT false, error TEXT, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restore_history TO authenticated;
GRANT ALL ON public.restore_history TO service_role;
ALTER TABLE public.restore_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all restore_history" ON public.restore_history FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX idx_restore_history_ran_at ON public.restore_history (ran_at DESC);

CREATE TABLE public.return_audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), return_type text NOT NULL CHECK (return_type IN ('sales','supplier')), return_id uuid NOT NULL, action text NOT NULL, user_id uuid, user_email text, product_id uuid, quantity integer DEFAULT 0, stock_delta integer DEFAULT 0, amount_delta numeric DEFAULT 0, previous_status text, new_status text, notes jsonb DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.return_audit_logs TO authenticated;
GRANT ALL ON public.return_audit_logs TO service_role;
ALTER TABLE public.return_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all return_audit" ON public.return_audit_logs FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX idx_return_audit_return ON public.return_audit_logs(return_type, return_id);
CREATE INDEX idx_return_audit_created ON public.return_audit_logs(created_at DESC);

ALTER TABLE public.returns ADD COLUMN refund_mode text NOT NULL DEFAULT 'cash', ADD COLUMN due_adjusted numeric NOT NULL DEFAULT 0, ADD COLUMN cash_refunded numeric NOT NULL DEFAULT 0, ADD COLUMN customer_credit numeric NOT NULL DEFAULT 0, ADD COLUMN exchange_sale_id uuid;
CREATE INDEX idx_returns_exchange_sale_id ON public.returns(exchange_sale_id);
