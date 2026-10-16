-- Stop granting admin automatically based on a hard-coded email address.
-- Preserve existing role rows so a legitimate administrator is not silently
-- demoted. Review any legacy role assignment explicitly in each environment.

DROP TRIGGER IF EXISTS on_auth_user_created_grant_director ON auth.users;
DROP FUNCTION IF EXISTS public.grant_director_admin();
