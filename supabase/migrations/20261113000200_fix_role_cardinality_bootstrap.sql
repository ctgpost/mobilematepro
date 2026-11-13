-- Fix role cardinality and first-admin race.
-- Resolve existing multi-role rows deterministically before adding one-role-per-user constraint.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id
    ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
             created_at ASC, id ASC
  ) AS rn
  FROM public.user_roles
)
DELETE FROM public.user_roles r USING ranked x WHERE r.id=x.id AND x.rn>1;

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_role_per_user ON public.user_roles(user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  -- Transaction-scoped lock serializes first-user bootstrap decisions.
  PERFORM pg_advisory_xact_lock(hashtext('mobilematepro-first-admin-bootstrap'));
  INSERT INTO public.profiles(id,email,full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name',NEW.email));

  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    v_role := 'admin';
  ELSE
    v_role := 'staff';
  END IF;
  INSERT INTO public.user_roles(user_id,role) VALUES (NEW.id,v_role);
  RETURN NEW;
END;
$$;
