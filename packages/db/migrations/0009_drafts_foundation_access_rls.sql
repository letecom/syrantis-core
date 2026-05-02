GRANT SELECT, INSERT, UPDATE ON TABLE drafts TO syrantis_app;
--> statement-breakpoint

ALTER TABLE "drafts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "drafts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation_drafts"
ON "drafts"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
)
WITH CHECK (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
);
