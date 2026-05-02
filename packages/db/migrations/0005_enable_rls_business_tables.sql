ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation_organizations"
ON "organizations"
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

ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation_contacts"
ON "contacts"
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

ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "leads" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation_leads"
ON "leads"
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

ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation_tasks"
ON "tasks"
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

ALTER TABLE "approvals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "approvals" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation_approvals"
ON "approvals"
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

ALTER TABLE "activity_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "activity_logs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "tenant_isolation_activity_logs"
ON "activity_logs"
AS PERMISSIVE
FOR ALL
TO PUBLIC
USING (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
)
WITH CHECK (
  workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
);
