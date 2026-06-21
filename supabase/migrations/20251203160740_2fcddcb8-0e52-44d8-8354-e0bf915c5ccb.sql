-- Create activity_logs table
CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    action TEXT NOT NULL,
    action_type TEXT NOT NULL,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_action_type ON public.activity_logs(action_type);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Admins and managers can view all logs
CREATE POLICY "Admins and managers can view logs"
ON public.activity_logs
FOR SELECT
USING (
    public.is_admin(auth.uid()) OR 
    public.has_role(auth.uid(), 'manager')
);

-- All authenticated users can insert logs
CREATE POLICY "Authenticated users can insert logs"
ON public.activity_logs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Only admins can delete logs
CREATE POLICY "Admins can delete logs"
ON public.activity_logs
FOR DELETE
USING (public.is_admin(auth.uid()));