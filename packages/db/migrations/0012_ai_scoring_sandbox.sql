ALTER TABLE "background_jobs"
  DROP CONSTRAINT IF EXISTS "background_jobs_type_check";
--> statement-breakpoint

ALTER TABLE "background_jobs"
  ADD CONSTRAINT "background_jobs_type_check"
  CHECK ("type" in ('send_email', 'score_lead'));
--> statement-breakpoint

ALTER TABLE "ai_runs"
  DROP CONSTRAINT IF EXISTS "ai_runs_status_check";
--> statement-breakpoint

ALTER TABLE "ai_runs"
  ADD CONSTRAINT "ai_runs_status_check"
  CHECK ("status" in ('pending', 'running', 'success', 'error', 'cached', 'fallback'));
--> statement-breakpoint

ALTER TABLE "ai_runs"
  ADD COLUMN IF NOT EXISTS "job_id" uuid,
  ADD COLUMN IF NOT EXISTS "reference_type" varchar(50),
  ADD COLUMN IF NOT EXISTS "reference_id" uuid,
  ADD COLUMN IF NOT EXISTS "purpose" varchar(50),
  ADD COLUMN IF NOT EXISTS "provider" varchar(50),
  ADD COLUMN IF NOT EXISTS "prompt_template_id" varchar(80),
  ADD COLUMN IF NOT EXISTS "prompt_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "output_json" jsonb,
  ADD COLUMN IF NOT EXISTS "input_tokens" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "output_tokens" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cost_estimate_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_runs_job_id_background_jobs_id_fk'
  ) THEN
    ALTER TABLE "ai_runs"
      ADD CONSTRAINT "ai_runs_job_id_background_jobs_id_fk"
      FOREIGN KEY ("job_id") REFERENCES "public"."background_jobs"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END;
$do$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_runs_job_id_idx" ON "ai_runs" USING btree ("job_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_runs_reference_idx" ON "ai_runs" USING btree ("reference_type", "reference_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ai_runs_purpose_idx" ON "ai_runs" USING btree ("purpose");
--> statement-breakpoint

DROP TRIGGER IF EXISTS ai_runs_set_updated_at_trg ON ai_runs;
CREATE TRIGGER ai_runs_set_updated_at_trg
BEFORE UPDATE ON ai_runs
FOR EACH ROW
EXECUTE FUNCTION syrantis_set_updated_at();
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON TABLE ai_runs TO syrantis_app;
--> statement-breakpoint

ALTER TABLE "ai_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "ai_runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "tenant_isolation_ai_runs" ON "ai_runs";
--> statement-breakpoint

CREATE POLICY "tenant_isolation_ai_runs"
ON "ai_runs"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
)
WITH CHECK (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "lead_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "lead_id" uuid NOT NULL,
  "ai_run_id" uuid,
  "score" integer NOT NULL,
  "qualification" varchar(24) NOT NULL,
  "summary" text NOT NULL,
  "rationale" text NOT NULL,
  "recommended_action" text NOT NULL,
  "confidence" integer NOT NULL,
  "model" varchar(120) NOT NULL,
  "prompt_template_id" varchar(80) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "lead_scores_score_check" CHECK ("lead_scores"."score" between 0 and 100),
  CONSTRAINT "lead_scores_qualification_check" CHECK ("lead_scores"."qualification" in ('cold', 'warm', 'hot')),
  CONSTRAINT "lead_scores_confidence_check" CHECK ("lead_scores"."confidence" between 0 and 100)
);
--> statement-breakpoint

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_scores_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "lead_scores"
      ADD CONSTRAINT "lead_scores_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END;
$do$;
--> statement-breakpoint

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_scores_lead_id_leads_id_fk'
  ) THEN
    ALTER TABLE "lead_scores"
      ADD CONSTRAINT "lead_scores_lead_id_leads_id_fk"
      FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END;
$do$;
--> statement-breakpoint

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_scores_ai_run_id_ai_runs_id_fk'
  ) THEN
    ALTER TABLE "lead_scores"
      ADD CONSTRAINT "lead_scores_ai_run_id_ai_runs_id_fk"
      FOREIGN KEY ("ai_run_id") REFERENCES "public"."ai_runs"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END;
$do$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "lead_scores_workspace_id_idx" ON "lead_scores" USING btree ("workspace_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "lead_scores_lead_id_idx" ON "lead_scores" USING btree ("lead_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "lead_scores_ai_run_id_idx" ON "lead_scores" USING btree ("ai_run_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "lead_scores_created_at_idx" ON "lead_scores" USING btree ("created_at");
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON TABLE lead_scores TO syrantis_app;
--> statement-breakpoint

ALTER TABLE "lead_scores" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "lead_scores" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "tenant_isolation_lead_scores" ON "lead_scores";
--> statement-breakpoint

CREATE POLICY "tenant_isolation_lead_scores"
ON "lead_scores"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
)
WITH CHECK (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
);
--> statement-breakpoint

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'syrantis_worker'
  ) THEN
    REVOKE ALL PRIVILEGES ON TABLE lead_scores FROM syrantis_worker;
    REVOKE ALL PRIVILEGES ON TABLE ai_runs FROM syrantis_worker;
  END IF;
END;
$do$;
