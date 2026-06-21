
CREATE TABLE public.categories (id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now());
CREATE TABLE public.products (id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, name TEXT NOT NULL, description TEXT, category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL, sku TEXT UNIQUE, barcode TEXT, price DECIMAL(10,2) NOT NULL DEFAULT 0, cost DECIMAL(10,2) NOT NULL DEFAULT 0, stock_quantity INTEGER NOT NULL DEFAULT 0, low_stock_threshold INTEGER NOT NULL DEFAULT 10, unit TEXT DEFAULT 'pcs', image_url TEXT, brand TEXT, condition TEXT DEFAULT 'new' CHECK (condition IN ('new','used')), imei TEXT, model TEXT, ram TEXT, storage TEXT, battery TEXT, supplier_name TEXT, supplier_mobile TEXT, supplier_nid TEXT, warranty_expiry_date DATE, warranty_status TEXT DEFAULT 'no_warranty', created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now());
CREATE TABLE public.customers (id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT, address TEXT, notes TEXT, total_purchases DECIMAL(10,2) DEFAULT 0, purchase_count INTEGER DEFAULT 0, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now());
CREATE TABLE public.suppliers (id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT, address TEXT, notes TEXT, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now());
CREATE TABLE public.sales (id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, user_id UUID NOT NULL, customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL, total_amount DECIMAL(10,2) NOT NULL DEFAULT 0, payment_method TEXT DEFAULT 'cash', status TEXT DEFAULT 'completed', notes TEXT, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now());
CREATE TABLE public.sale_items (id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE, product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, quantity INTEGER NOT NULL, unit_price DECIMAL(10,2) NOT NULL, total_price DECIMAL(10,2) NOT NULL, condition TEXT DEFAULT 'new', created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now());
CREATE TABLE public.purchases (id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, user_id UUID NOT NULL, supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL, purchase_number TEXT NOT NULL UNIQUE, total_amount DECIMAL(10,2) NOT NULL DEFAULT 0, status TEXT DEFAULT 'pending' CHECK (status IN ('pending','received','cancelled')), notes TEXT, expected_date DATE, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now());
CREATE TABLE public.purchase_items (id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE, product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, quantity INTEGER NOT NULL, unit_cost DECIMAL(10,2) NOT NULL, total_cost DECIMAL(10,2) NOT NULL, received_quantity INTEGER DEFAULT 0, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now());
CREATE TABLE public.returns (id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE, sale_item_id UUID NOT NULL REFERENCES public.sale_items(id) ON DELETE CASCADE, product_id UUID NOT NULL REFERENCES public.products(id), quantity INTEGER NOT NULL CHECK (quantity > 0), refund_amount NUMERIC NOT NULL DEFAULT 0, reason_code TEXT NOT NULL, reason_notes TEXT, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')), processed_by UUID, created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories, public.products, public.customers, public.suppliers, public.sales, public.sale_items, public.purchases, public.purchase_items, public.returns TO authenticated;
GRANT ALL ON public.categories, public.products, public.customers, public.suppliers, public.sales, public.sale_items, public.purchases, public.purchase_items, public.returns TO service_role;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth all categories" ON public.categories FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth all products" ON public.products FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth all customers" ON public.customers FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth all suppliers" ON public.suppliers FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth all sales" ON public.sales FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth all sale_items" ON public.sale_items FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth all purchases" ON public.purchases FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth all purchase_items" ON public.purchase_items FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth all returns" ON public.returns FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_purchases_updated_at BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_returns_updated_at BEFORE UPDATE ON public.returns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_products_category_id ON public.products(category_id);
CREATE INDEX idx_products_sku ON public.products(sku);
CREATE INDEX idx_products_imei ON public.products(imei);
CREATE INDEX idx_products_brand ON public.products(brand);
CREATE INDEX idx_sales_user_id ON public.sales(user_id);
CREATE INDEX idx_sales_customer_id ON public.sales(customer_id);
CREATE INDEX idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX idx_sale_items_product_id ON public.sale_items(product_id);
CREATE INDEX idx_purchases_supplier_id ON public.purchases(supplier_id);
CREATE INDEX idx_purchase_items_purchase_id ON public.purchase_items(purchase_id);
CREATE INDEX idx_returns_sale_id ON public.returns(sale_id);
CREATE INDEX idx_returns_product_id ON public.returns(product_id);
