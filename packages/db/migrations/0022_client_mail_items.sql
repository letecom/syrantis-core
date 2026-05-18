CREATE TABLE IF NOT EXISTS "client_mail_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "classification_id" uuid,
  "lead_id" uuid,
  "contact_id" uuid,
  "draft_id" uuid,
  "external_id" text,
  "external_thread_id" text,
  "source" text NOT NULL,
  "direction" text DEFAULT 'inbound' NOT NULL,
  "from_display" text,
  "from_email" text,
  "to_display" text,
  "to_email" text,
  "subject" text,
  "snippet" text,
  "body_text" text,
  "received_at" timestamp with time zone,
  "has_attachments" boolean DEFAULT false NOT NULL,
  "attachments_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "client_mail_items_direction_check"
    CHECK ("direction" in ('inbound')),
  CONSTRAINT "client_mail_items_source_non_empty_check"
    CHECK (btrim("source") <> ''),
  CONSTRAINT "client_mail_items_attachments_json_array_check"
    CHECK (jsonb_typeof("attachments_json") = 'array')
);
--> statement-breakpoint

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_mail_items_workspace_id_workspaces_id_fk'
  ) THEN
    ALTER TABLE "client_mail_items"
      ADD CONSTRAINT "client_mail_items_workspace_id_workspaces_id_fk"
      FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
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
    WHERE conname = 'client_mail_items_classification_id_intake_classifications_id_fk'
  ) THEN
    ALTER TABLE "client_mail_items"
      ADD CONSTRAINT "client_mail_items_classification_id_intake_classifications_id_fk"
      FOREIGN KEY ("classification_id") REFERENCES "public"."intake_classifications"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END;
$do$;
--> statement-breakpoint

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_mail_items_lead_id_leads_id_fk'
  ) THEN
    ALTER TABLE "client_mail_items"
      ADD CONSTRAINT "client_mail_items_lead_id_leads_id_fk"
      FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END;
$do$;
--> statement-breakpoint

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_mail_items_contact_id_contacts_id_fk'
  ) THEN
    ALTER TABLE "client_mail_items"
      ADD CONSTRAINT "client_mail_items_contact_id_contacts_id_fk"
      FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END;
$do$;
--> statement-breakpoint

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_mail_items_draft_id_drafts_id_fk'
  ) THEN
    ALTER TABLE "client_mail_items"
      ADD CONSTRAINT "client_mail_items_draft_id_drafts_id_fk"
      FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END;
$do$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "client_mail_items_workspace_external_id_unique_idx"
ON "client_mail_items" USING btree ("workspace_id", "external_id")
WHERE "external_id" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "client_mail_items_workspace_received_at_idx"
ON "client_mail_items" USING btree ("workspace_id", "received_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "client_mail_items_workspace_classification_id_idx"
ON "client_mail_items" USING btree ("workspace_id", "classification_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "client_mail_items_workspace_lead_id_idx"
ON "client_mail_items" USING btree ("workspace_id", "lead_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "client_mail_items_workspace_contact_id_idx"
ON "client_mail_items" USING btree ("workspace_id", "contact_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "client_mail_items_workspace_draft_id_idx"
ON "client_mail_items" USING btree ("workspace_id", "draft_id");
--> statement-breakpoint

DROP TRIGGER IF EXISTS client_mail_items_set_updated_at_trg ON client_mail_items;
CREATE TRIGGER client_mail_items_set_updated_at_trg
BEFORE UPDATE ON client_mail_items
FOR EACH ROW
EXECUTE FUNCTION syrantis_set_updated_at();
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON TABLE client_mail_items TO syrantis_app;
--> statement-breakpoint

ALTER TABLE "client_mail_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "client_mail_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DROP POLICY IF EXISTS "tenant_isolation_client_mail_items" ON "client_mail_items";
--> statement-breakpoint

CREATE POLICY "tenant_isolation_client_mail_items"
ON "client_mail_items"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
)
WITH CHECK (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
);
