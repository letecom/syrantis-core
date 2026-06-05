CREATE TABLE IF NOT EXISTS "workspace_response_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "name" varchar(100) NOT NULL,
  "sender_name" varchar(100) NOT NULL,
  "role_label" varchar(120) NOT NULL,
  "description" text,
  "tone" varchar(40) NOT NULL,
  "style_notes" text,
  "authority_level" varchar(40) NOT NULL,
  "applies_to_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "specific_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "escalation_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "forbidden_claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_response_profiles_tone_check"
    CHECK ("tone" in ('professional', 'friendly', 'formal', 'empathetic', 'concise', 'direct')),
  CONSTRAINT "workspace_response_profiles_authority_level_check"
    CHECK ("authority_level" in ('standard', 'manager', 'direction')),
  CONSTRAINT "workspace_response_profiles_applies_to_categories_array_check"
    CHECK (jsonb_typeof("applies_to_categories") = 'array'),
  CONSTRAINT "workspace_response_profiles_specific_rules_array_check"
    CHECK (jsonb_typeof("specific_rules") = 'array'),
  CONSTRAINT "workspace_response_profiles_escalation_rules_array_check"
    CHECK (jsonb_typeof("escalation_rules") = 'array'),
  CONSTRAINT "workspace_response_profiles_forbidden_claims_array_check"
    CHECK (jsonb_typeof("forbidden_claims") = 'array'),
  CONSTRAINT "workspace_response_profiles_sort_order_check"
    CHECK ("sort_order" >= 0),
  CONSTRAINT "workspace_response_profiles_name_non_empty_check"
    CHECK (btrim("name") <> ''),
  CONSTRAINT "workspace_response_profiles_sender_name_non_empty_check"
    CHECK (btrim("sender_name") <> ''),
  CONSTRAINT "workspace_response_profiles_role_label_non_empty_check"
    CHECK (btrim("role_label") <> '')
);
--> statement-breakpoint

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_response_profiles_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "workspace_response_profiles"
      ADD CONSTRAINT "workspace_response_profiles_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END;
$do$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "workspace_response_profiles_workspace_active_idx"
ON "workspace_response_profiles" USING btree ("workspace_id", "is_active");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "workspace_response_profiles_workspace_order_idx"
ON "workspace_response_profiles" USING btree ("workspace_id", "sort_order", "created_at");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_response_profiles_one_active_default_idx"
ON "workspace_response_profiles" USING btree ("workspace_id")
WHERE "is_default" = true AND "is_active" = true;
--> statement-breakpoint

DROP TRIGGER IF EXISTS workspace_response_profiles_set_updated_at_trg ON workspace_response_profiles;
CREATE TRIGGER workspace_response_profiles_set_updated_at_trg
BEFORE UPDATE ON workspace_response_profiles
FOR EACH ROW
EXECUTE FUNCTION syrantis_set_updated_at();
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON TABLE workspace_response_profiles TO syrantis_app;
--> statement-breakpoint

ALTER TABLE "workspace_response_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "workspace_response_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "tenant_isolation_workspace_response_profiles" ON "workspace_response_profiles";
--> statement-breakpoint

CREATE POLICY "tenant_isolation_workspace_response_profiles"
ON "workspace_response_profiles"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
)
WITH CHECK (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
);
