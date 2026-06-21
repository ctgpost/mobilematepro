
-- Fix activity_logs policies
DROP POLICY IF EXISTS "Admins and managers can view logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Admins can delete logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Authenticated users can insert logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Authenticated users can update logs" ON public.activity_logs;

CREATE POLICY "Admins and managers can view logs" ON public.activity_logs FOR SELECT TO authenticated USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "Admins can delete logs" ON public.activity_logs FOR DELETE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated users can insert logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update logs" ON public.activity_logs FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- Fix categories policies
DROP POLICY IF EXISTS "Authenticated users can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Authenticated users can view categories" ON public.categories;
CREATE POLICY "Authenticated users can manage categories" ON public.categories FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

-- Fix customers policies
DROP POLICY IF EXISTS "Authenticated users can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can view customers" ON public.customers;
CREATE POLICY "Authenticated users can manage customers" ON public.customers FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

-- Fix products policies
DROP POLICY IF EXISTS "Authenticated users can manage products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
CREATE POLICY "Authenticated users can manage products" ON public.products FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

-- Fix profiles policies
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE TO authenticated USING (is_admin(auth.uid()));

-- Fix purchase_items policies
DROP POLICY IF EXISTS "Authenticated users can manage purchase items" ON public.purchase_items;
DROP POLICY IF EXISTS "Authenticated users can view purchase items" ON public.purchase_items;
CREATE POLICY "Authenticated users can manage purchase items" ON public.purchase_items FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

-- Fix purchases policies
DROP POLICY IF EXISTS "Authenticated users can manage purchases" ON public.purchases;
DROP POLICY IF EXISTS "Authenticated users can view purchases" ON public.purchases;
CREATE POLICY "Authenticated users can manage purchases" ON public.purchases FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

-- Fix returns policies
DROP POLICY IF EXISTS "Authenticated users can create returns" ON public.returns;
DROP POLICY IF EXISTS "Authenticated users can delete returns" ON public.returns;
DROP POLICY IF EXISTS "Authenticated users can update returns" ON public.returns;
DROP POLICY IF EXISTS "Authenticated users can view returns" ON public.returns;
CREATE POLICY "Authenticated users can manage returns" ON public.returns FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

-- Fix sale_items policies
DROP POLICY IF EXISTS "Authenticated users can create sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Authenticated users can delete sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Authenticated users can update sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Authenticated users can view sale items" ON public.sale_items;
CREATE POLICY "Authenticated users can manage sale items" ON public.sale_items FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

-- Fix sales policies
DROP POLICY IF EXISTS "Authenticated users can create sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can delete sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can update sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can view sales" ON public.sales;
CREATE POLICY "Authenticated users can manage sales" ON public.sales FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

-- Fix suppliers policies
DROP POLICY IF EXISTS "Authenticated users can manage suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Authenticated users can view suppliers" ON public.suppliers;
CREATE POLICY "Authenticated users can manage suppliers" ON public.suppliers FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

-- Fix user_roles policies
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
CREATE POLICY "Users can view their own role" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (is_admin(auth.uid()) AND user_id <> auth.uid());
