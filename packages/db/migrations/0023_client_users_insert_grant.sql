-- 023AK client user provisioning inserts public.users rows for the trusted
-- session workspace. Existing SELECT remains sufficient for INSERT ... RETURNING.
GRANT INSERT ON TABLE users TO syrantis_app;
