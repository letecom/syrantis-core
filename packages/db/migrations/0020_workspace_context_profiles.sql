CREATE TABLE IF NOT EXISTS "workspace_context_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "company_name" varchar(120) DEFAULT '' NOT NULL,
  "sector" varchar(120) DEFAULT '' NOT NULL,
  "language" varchar(16) DEFAULT 'fr' NOT NULL,
  "timezone" varchar(80) DEFAULT 'Europe/Paris' NOT NULL,
  "context_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_context_profiles_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "workspace_context_profiles"
      ADD CONSTRAINT "workspace_context_profiles_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END;
$do$;
--> statement-breakpoint

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_context_profiles_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "workspace_context_profiles"
      ADD CONSTRAINT "workspace_context_profiles_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END;
$do$;
--> statement-breakpoint

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_context_profiles_updated_by_users_id_fk'
  ) THEN
    ALTER TABLE "workspace_context_profiles"
      ADD CONSTRAINT "workspace_context_profiles_updated_by_users_id_fk"
      FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END;
$do$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_context_profiles_workspace_id_unique_idx"
ON "workspace_context_profiles" USING btree ("workspace_id");
--> statement-breakpoint

DROP TRIGGER IF EXISTS workspace_context_profiles_set_updated_at_trg ON workspace_context_profiles;
CREATE TRIGGER workspace_context_profiles_set_updated_at_trg
BEFORE UPDATE ON workspace_context_profiles
FOR EACH ROW
EXECUTE FUNCTION syrantis_set_updated_at();
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON TABLE workspace_context_profiles TO syrantis_app;
--> statement-breakpoint

ALTER TABLE "workspace_context_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "workspace_context_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "tenant_isolation_workspace_context_profiles" ON "workspace_context_profiles";
--> statement-breakpoint

CREATE POLICY "tenant_isolation_workspace_context_profiles"
ON "workspace_context_profiles"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
)
WITH CHECK (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
);
