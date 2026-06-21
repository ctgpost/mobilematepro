CREATE TABLE IF NOT EXISTS public.return_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_type text NOT NULL CHECK (return_type IN ('sales','supplier')),
  return_id uuid NOT NULL,
  action text NOT NULL,
  user_id uuid,
  user_email text,
  product_id uuid,
  quantity integer DEFAULT 0,
  stock_delta integer DEFAULT 0,
  amount_delta numeric DEFAULT 0,
  previous_status text,
  new_status text,
  notes jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_return_audit_return ON public.return_audit_logs(return_type, return_id);
CREATE INDEX IF NOT EXISTS idx_return_audit_created ON public.return_audit_logs(created_at DESC);

ALTER TABLE public.return_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can insert return audit"
  ON public.return_audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can view return audit"
  ON public.return_audit_logs FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete return audit"
  ON public.return_audit_logs FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));