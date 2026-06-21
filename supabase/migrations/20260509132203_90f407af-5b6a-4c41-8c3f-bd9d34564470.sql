CREATE TABLE public.backup_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  user_email TEXT,
  ran_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tables TEXT[] NOT NULL DEFAULT '{}',
  counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_records INTEGER NOT NULL DEFAULT 0,
  download_ok BOOLEAN NOT NULL DEFAULT false,
  cloud_ok BOOLEAN NOT NULL DEFAULT false,
  cloud_url TEXT,
  filename TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view backup history"
ON public.backup_history FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can insert backup history"
ON public.backup_history FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete backup history"
ON public.backup_history FOR DELETE TO authenticated
USING (is_admin(auth.uid()));

CREATE INDEX idx_backup_history_ran_at ON public.backup_history (ran_at DESC);