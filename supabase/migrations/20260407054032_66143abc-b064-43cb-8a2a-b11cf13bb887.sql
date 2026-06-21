
-- Create shop_settings table (single-row config)
CREATE TABLE public.shop_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name text NOT NULL DEFAULT 'BIG BOSS MOBILE SHOP',
  shop_subtitle text DEFAULT 'Mobile Shop',
  shop_address text DEFAULT 'Goli No-6, Shop No-13, New Market, Karanihat, Satkania, Chittagong',
  shop_phone text DEFAULT '',
  logo_url text DEFAULT '',
  favicon_url text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "Authenticated users can read shop settings"
  ON public.shop_settings FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Only admins can update
CREATE POLICY "Admins can update shop settings"
  ON public.shop_settings FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()));

-- Only admins can insert
CREATE POLICY "Admins can insert shop settings"
  ON public.shop_settings FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()));

-- Insert default row
INSERT INTO public.shop_settings (shop_name, shop_subtitle, shop_address)
VALUES ('BIG BOSS MOBILE SHOP', 'Mobile Shop', 'Goli No-6, Shop No-13, New Market, Karanihat, Satkania, Chittagong');

-- Create storage bucket for branding
INSERT INTO storage.buckets (id, name, public) VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to branding bucket
CREATE POLICY "Authenticated users can upload branding"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND (storage.foldername(name))[1] = 'logos');

-- Allow public read access to branding
CREATE POLICY "Public can read branding"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'branding');

-- Allow authenticated users to update branding files
CREATE POLICY "Authenticated users can update branding"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding');

-- Allow authenticated users to delete branding files
CREATE POLICY "Authenticated users can delete branding"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding');
