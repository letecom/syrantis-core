\if :{?worker_password}
\else
  \echo 'worker_password is required. Usage: psql -v worker_password=<generated-password> -f scripts/db/setup-worker-role.sql'
  \quit 1
\endif

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'syrantis_worker') THEN
    CREATE ROLE syrantis_worker WITH LOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END;
$do$;

ALTER ROLE syrantis_worker WITH LOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'worker_password';

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM syrantis_worker;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM syrantis_worker;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM syrantis_worker;

GRANT CONNECT ON DATABASE syrantis TO syrantis_worker;
GRANT USAGE ON SCHEMA public TO syrantis_worker;
GRANT SELECT, UPDATE ON TABLE background_jobs TO syrantis_worker;

REVOKE INSERT, DELETE, TRUNCATE ON TABLE background_jobs FROM syrantis_worker;
REVOKE ALL PRIVILEGES ON TABLE email_sends FROM syrantis_worker;
REVOKE ALL PRIVILEGES ON TABLE activity_logs FROM syrantis_worker;
REVOKE ALL PRIVILEGES ON TABLE users FROM syrantis_worker;
