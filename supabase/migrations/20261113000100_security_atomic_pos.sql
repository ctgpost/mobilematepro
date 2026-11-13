-- Security and transactional POS hardening.
-- Apply after the existing role/profile and sales migrations.

-- Keep role lookup safe for RLS policies and explicitly permit policy evaluation.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- User roles: users can read their own role; admins can read/manage all roles.
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "admin manage user_roles" ON public.user_roles;
CREATE POLICY "user reads own role or admin reads all"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin manage user_roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Profiles: own profile or admin visibility; only own profile edits unless admin.
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile or admin views all" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "profile read own or admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profile update own or admin"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Remove legacy broad authenticated-user policies. PostgreSQL permissive policies
-- combine with OR, so leaving an old policy would defeat the new restrictions.
DROP POLICY IF EXISTS "Authenticated users can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Authenticated users can view categories" ON public.categories;
DROP POLICY IF EXISTS "Authenticated users can manage products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can view customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can manage suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Authenticated users can view suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Authenticated users can view sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can create sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can view sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Authenticated users can create sale items" ON public.sale_items;

CREATE POLICY "authenticated read categories" ON public.categories FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "manager admin manage categories" ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "authenticated read products" ON public.products FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "manager admin manage products" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "authenticated read customers" ON public.customers FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "manager admin manage customers" ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "staff create customers" ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin manager read all sales or staff own" ON public.sales FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "authenticated create own sales" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "sale items read sale owner or admin manager"
  ON public.sale_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id
    AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))));
CREATE POLICY "sale items insert own sale"
  ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND s.user_id = auth.uid()));

-- Idempotency prevents an outbox retry from creating duplicate sales.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS sales_idempotency_key_unique
  ON public.sales(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- One database transaction for sale header, line items, and inventory deductions.
CREATE OR REPLACE FUNCTION public.create_sale_atomic(
  p_idempotency_key uuid,
  p_sale jsonb,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty integer;
  v_price numeric;
  v_line_total numeric;
  v_product_price numeric;
  v_items_total numeric := 0;
  v_sale_total numeric;
  v_paid numeric;
  v_due numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sale must contain at least one item';
  END IF;
  IF (p_sale->>'user_id') IS DISTINCT FROM auth.uid()::text THEN
    RAISE EXCEPTION 'Sale user_id must match authenticated user';
  END IF;

  -- Concurrent duplicate requests serialize on the unique key; return existing sale.
  SELECT id INTO v_sale_id FROM public.sales WHERE idempotency_key = p_idempotency_key;
  IF v_sale_id IS NOT NULL THEN
    RETURN v_sale_id;
  END IF;

  INSERT INTO public.sales (
    user_id, customer_id, total_amount, payment_method, status, notes,
    instant_customer_name, instant_customer_phone, customer_photo_url,
    paid_amount, due_amount, created_at, idempotency_key
  ) VALUES (
    auth.uid(),
    NULLIF(p_sale->>'customer_id','')::uuid,
    COALESCE((p_sale->>'total_amount')::numeric,0),
    COALESCE(p_sale->>'payment_method','cash'),
    'completed',
    p_sale->>'notes',
    p_sale->>'instant_customer_name',
    p_sale->>'instant_customer_phone',
    p_sale->>'customer_photo_url',
    COALESCE((p_sale->>'paid_amount')::numeric,0),
    COALESCE((p_sale->>'due_amount')::numeric,0),
    COALESCE((p_sale->>'created_at')::timestamptz,now()),
    p_idempotency_key
  ) RETURNING id INTO v_sale_id;

  v_sale_total := COALESCE((p_sale->>'total_amount')::numeric,0);
  v_paid := COALESCE((p_sale->>'paid_amount')::numeric,0);
  v_due := COALESCE((p_sale->>'due_amount')::numeric,0);
  IF v_sale_total < 0 OR v_paid < 0 OR v_due < 0 OR abs((v_paid + v_due) - v_sale_total) > 0.01 THEN
    RAISE EXCEPTION 'Invalid sale payment totals';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_price := (v_item->>'unit_price')::numeric;
    v_line_total := COALESCE((v_item->>'total_price')::numeric, v_qty * v_price);

    IF v_product_id IS NULL OR v_qty IS NULL OR v_qty <= 0 OR v_price < 0 THEN
      RAISE EXCEPTION 'Invalid sale item';
    END IF;

    IF v_line_total < 0 OR abs(v_line_total - (v_qty * v_price)) > 0.01 THEN
      RAISE EXCEPTION 'Invalid line total';
    END IF;
    v_items_total := v_items_total + v_line_total;

    -- Atomic conditional decrement prevents concurrent overselling.
    UPDATE public.products
      SET stock_quantity = stock_quantity - v_qty,
          last_stock_reason = 'sale',
          last_stock_ref = v_sale_id
      WHERE id = v_product_id AND stock_quantity >= v_qty;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient stock or product not found: %', v_product_id;
    END IF;

    INSERT INTO public.sale_items(sale_id, product_id, quantity, unit_price, total_price)
    VALUES (v_sale_id, v_product_id, v_qty, v_price, v_line_total);
  END LOOP;
  IF abs(v_items_total - v_sale_total) > 0.01 THEN
    RAISE EXCEPTION 'Sale total does not equal item totals';
  END IF;

  RETURN v_sale_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_sale_id FROM public.sales WHERE idempotency_key = p_idempotency_key;
    IF v_sale_id IS NOT NULL THEN RETURN v_sale_id; END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_atomic(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale_atomic(uuid, jsonb, jsonb) TO authenticated;
