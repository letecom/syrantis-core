CREATE TABLE IF NOT EXISTS "background_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "type" varchar(80) NOT NULL,
  "payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(24) DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "run_after" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone,
  "locked_by" varchar(255),
  "completed_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "last_error_code" varchar(120),
  "last_error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "background_jobs_status_check" CHECK ("background_jobs"."status" in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT "background_jobs_type_check" CHECK ("background_jobs"."type" in ('send_email')),
  CONSTRAINT "background_jobs_attempts_check" CHECK ("background_jobs"."attempts" >= 0),
  CONSTRAINT "background_jobs_max_attempts_check" CHECK ("background_jobs"."max_attempts" >= 1)
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'background_jobs_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "background_jobs"
      ADD CONSTRAINT "background_jobs_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END;
$$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "background_jobs_workspace_id_idx" ON "background_jobs" USING btree ("workspace_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "background_jobs_status_idx" ON "background_jobs" USING btree ("status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "background_jobs_type_idx" ON "background_jobs" USING btree ("type");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "background_jobs_run_after_idx" ON "background_jobs" USING btree ("run_after");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "background_jobs_poll_idx" ON "background_jobs" USING btree ("status", "run_after", "locked_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "background_jobs_created_at_idx" ON "background_jobs" USING btree ("created_at");
--> statement-breakpoint

DROP TRIGGER IF EXISTS background_jobs_set_updated_at_trg ON background_jobs;
CREATE TRIGGER background_jobs_set_updated_at_trg
BEFORE UPDATE ON background_jobs
FOR EACH ROW
EXECUTE FUNCTION syrantis_set_updated_at();
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON TABLE background_jobs TO syrantis_app;
--> statement-breakpoint

ALTER TABLE "background_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "background_jobs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation_background_jobs"
ON "background_jobs"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
)
WITH CHECK (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
);
