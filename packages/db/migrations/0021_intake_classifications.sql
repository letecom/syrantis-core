CREATE TABLE "intake_classifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "external_id" text NOT NULL,
  "classification" text NOT NULL,
  "category" text NOT NULL,
  "action" text NOT NULL,
  "confidence" text NOT NULL,
  "reason_code" text NOT NULL,
  "diagnostic_trace_id" uuid NOT NULL,
  "suggested_labels" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "lead_id" uuid REFERENCES "leads"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "intake_classifications_classification_check"
    CHECK ("classification" in ('leadable', 'ignored', 'unknown')),
  CONSTRAINT "intake_classifications_action_check"
    CHECK ("action" in ('create_lead', 'ignore', 'review')),
  CONSTRAINT "intake_classifications_confidence_check"
    CHECK ("confidence" in ('high', 'medium', 'low'))
);

CREATE INDEX "intake_classifications_workspace_id_idx"
  ON "intake_classifications" ("workspace_id");
CREATE INDEX "intake_classifications_lead_id_idx"
  ON "intake_classifications" ("lead_id");
CREATE INDEX "intake_classifications_created_at_idx"
  ON "intake_classifications" ("created_at");
CREATE UNIQUE INDEX "intake_classifications_workspace_external_id_unique_idx"
  ON "intake_classifications" ("workspace_id", "external_id");

ALTER TABLE "intake_classifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "intake_classifications" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_intake_classifications"
ON "intake_classifications"
FOR ALL
USING (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
)
WITH CHECK (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
);
