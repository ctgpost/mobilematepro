
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

CREATE POLICY "Auth view branding" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'branding');
CREATE POLICY "Auth upload branding" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'branding');
CREATE POLICY "Auth update branding" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'branding');
CREATE POLICY "Auth delete branding" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'branding');
