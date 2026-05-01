DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'syrantis_app') THEN
    CREATE ROLE syrantis_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END;
$$;
--> statement-breakpoint

ALTER ROLE syrantis_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_roles r ON r.oid = c.relowner
    WHERE r.rolname = 'syrantis_app'
      AND n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  ) THEN
    RAISE EXCEPTION 'syrantis_app must not own public tables';
  END IF;
END;
$$;
--> statement-breakpoint

GRANT CONNECT ON DATABASE syrantis TO syrantis_app;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO syrantis_app;
--> statement-breakpoint

GRANT SELECT ON TABLE users, workspaces TO syrantis_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE sessions TO syrantis_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON TABLE
  organizations,
  contacts,
  leads,
  tasks,
  approvals,
  activity_logs
TO syrantis_app;
--> statement-breakpoint

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO syrantis_app;
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE syrantis IN SCHEMA public
GRANT SELECT, INSERT, UPDATE ON TABLES TO syrantis_app;
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE syrantis IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO syrantis_app;
