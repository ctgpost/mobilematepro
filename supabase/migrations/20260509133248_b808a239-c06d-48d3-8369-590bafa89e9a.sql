CREATE TABLE public.restore_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ran_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID,
  user_email TEXT,
  source_url TEXT,
  source_filename TEXT,
  tables TEXT[] NOT NULL DEFAULT '{}',
  results JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_processed INTEGER NOT NULL DEFAULT 0,
  pre_backup_url TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.restore_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view restore history"
  ON public.restore_history FOR SELECT
  TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can insert restore history"
  ON public.restore_history FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete restore history"
  ON public.restore_history FOR DELETE
  TO authenticated USING (is_admin(auth.uid()));

CREATE INDEX idx_restore_history_ran_at ON public.restore_history (ran_at DESC);