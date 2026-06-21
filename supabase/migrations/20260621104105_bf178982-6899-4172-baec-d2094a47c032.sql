
-- Admin-only tables (SELECT + write restricted to admin)
DROP POLICY IF EXISTS "auth all activity_logs" ON public.activity_logs;
CREATE POLICY "admin all activity_logs" ON public.activity_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
-- Allow any authenticated user to INSERT their own activity (logging)
CREATE POLICY "auth insert activity_logs" ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "auth all backup_history" ON public.backup_history;
CREATE POLICY "admin all backup_history" ON public.backup_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "auth all restore_history" ON public.restore_history;
CREATE POLICY "admin all restore_history" ON public.restore_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "auth all investment_entries" ON public.investment_entries;
CREATE POLICY "admin all investment_entries" ON public.investment_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "auth all investment_incomes" ON public.investment_incomes;
CREATE POLICY "admin all investment_incomes" ON public.investment_incomes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "auth all investment_sectors" ON public.investment_sectors;
CREATE POLICY "admin all investment_sectors" ON public.investment_sectors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "auth all return_audit" ON public.return_audit_logs;
CREATE POLICY "admin all return_audit" ON public.return_audit_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
-- Allow auth users to INSERT audit entries
CREATE POLICY "auth insert return_audit" ON public.return_audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Profiles: own + admin
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users view own profile or admin views all" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- Shop settings: read all auth, write admin only
DROP POLICY IF EXISTS "auth all shop_settings" ON public.shop_settings;
CREATE POLICY "auth read shop_settings" ON public.shop_settings FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin write shop_settings" ON public.shop_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update shop_settings" ON public.shop_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete shop_settings" ON public.shop_settings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
