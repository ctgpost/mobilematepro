
-- 1. Create the trigger on auth.users for handle_new_user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2. Fix: Insert missing profile for existing user
INSERT INTO public.profiles (id, email, full_name)
SELECT ur.user_id, u.email, COALESCE(u.raw_user_meta_data ->> 'full_name', u.email)
FROM public.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = ur.user_id);

-- 3. Add missing UPDATE policy on sales table
CREATE POLICY "Authenticated users can update sales"
  ON public.sales FOR UPDATE
  TO public
  USING (auth.uid() IS NOT NULL);

-- 4. Add missing UPDATE policy on sale_items table
CREATE POLICY "Authenticated users can update sale items"
  ON public.sale_items FOR UPDATE
  TO public
  USING (auth.uid() IS NOT NULL);

-- 5. Add missing UPDATE policy on activity_logs table
CREATE POLICY "Authenticated users can update logs"
  ON public.activity_logs FOR UPDATE
  TO public
  USING (auth.uid() IS NOT NULL);
