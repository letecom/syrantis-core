ALTER TABLE "email_sends"
  ADD COLUMN IF NOT EXISTS "lead_id" uuid,
  ADD COLUMN IF NOT EXISTS "contact_id" uuid,
  ADD COLUMN IF NOT EXISTS "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_sends_lead_id_leads_id_fk'
  ) THEN
    ALTER TABLE "email_sends"
      ADD CONSTRAINT "email_sends_lead_id_leads_id_fk"
      FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END;
$$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_sends_contact_id_contacts_id_fk'
  ) THEN
    ALTER TABLE "email_sends"
      ADD CONSTRAINT "email_sends_contact_id_contacts_id_fk"
      FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END;
$$;
--> statement-breakpoint

ALTER TABLE "email_sends"
  ALTER COLUMN "status" SET DEFAULT 'pending';
--> statement-breakpoint

ALTER TABLE "email_sends"
  DROP CONSTRAINT IF EXISTS "email_sends_status_check";
--> statement-breakpoint

ALTER TABLE "email_sends"
  ADD CONSTRAINT "email_sends_status_check"
  CHECK ("status" in ('pending', 'queued', 'sent', 'failed', 'cancelled'));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "email_sends_lead_id_idx" ON "email_sends" USING btree ("lead_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "email_sends_contact_id_idx" ON "email_sends" USING btree ("contact_id");
--> statement-breakpoint

DROP TRIGGER IF EXISTS email_sends_set_updated_at_trg ON email_sends;
CREATE TRIGGER email_sends_set_updated_at_trg
BEFORE UPDATE ON email_sends
FOR EACH ROW
EXECUTE FUNCTION syrantis_set_updated_at();
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON TABLE email_sends TO syrantis_app;
--> statement-breakpoint

ALTER TABLE "email_sends" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "email_sends" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation_email_sends"
ON "email_sends"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
)
WITH CHECK (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
);
