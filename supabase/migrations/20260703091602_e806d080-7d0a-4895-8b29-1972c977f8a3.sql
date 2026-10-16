-- Grant admin to director on signup / confirmation
CREATE OR REPLACE FUNCTION public.grant_director_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) = 'simon@byteandberry.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_director ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_director
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_director_admin();

-- Backfill for existing account
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
WHERE lower(email) = 'simon@byteandberry.com'
ON CONFLICT (user_id, role) DO NOTHING;