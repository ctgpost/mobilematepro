
ALTER TABLE public.shop_settings
  ADD COLUMN pwa_short_name text NOT NULL DEFAULT 'MOBILE MATE PRO',
  ADD COLUMN pwa_theme_color text NOT NULL DEFAULT '#1B5F74',
  ADD COLUMN pwa_background_color text NOT NULL DEFAULT '#1B5F74';
