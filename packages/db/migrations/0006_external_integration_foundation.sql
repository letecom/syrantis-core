CREATE TABLE IF NOT EXISTS "external_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "provider" varchar NOT NULL,
  "name" varchar NOT NULL,
  "status" varchar NOT NULL DEFAULT 'setup',
  "auth_type" varchar NOT NULL DEFAULT 'none',
  "external_account_id" varchar,
  "external_account_label" varchar,
  "config_json" jsonb NOT NULL DEFAULT '{}',
  "metadata_json" jsonb NOT NULL DEFAULT '{}',
  "last_sync_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "external_connections_provider_check" CHECK ("provider" in ('manual', 'generic', 'hubspot', 'pipedrive', 'odoo', 'zoho', 'sellsy', 'google_sheets', 'airtable', 'notion', 'make', 'zapier', 'custom')),
  CONSTRAINT "external_connections_status_check" CHECK ("status" in ('setup', 'active', 'paused', 'error', 'archived')),
  CONSTRAINT "external_connections_auth_type_check" CHECK ("auth_type" in ('none', 'external', 'secret_ref', 'oauth2', 'api_key'))
);

CREATE INDEX IF NOT EXISTS "external_connections_workspace_id_idx" ON "external_connections" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "external_connections_provider_idx" ON "external_connections" USING btree ("provider");
CREATE INDEX IF NOT EXISTS "external_connections_status_idx" ON "external_connections" USING btree ("status");
CREATE INDEX IF NOT EXISTS "external_connections_created_at_idx" ON "external_connections" USING btree ("created_at");

CREATE TABLE IF NOT EXISTS "external_object_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "connection_id" uuid NOT NULL REFERENCES "external_connections"("id"),
  "external_object_type" varchar NOT NULL,
  "external_object_id" varchar NOT NULL,
  "syrantis_entity_type" varchar NOT NULL,
  "syrantis_entity_id" uuid NOT NULL,
  "sync_direction" varchar NOT NULL DEFAULT 'inbound',
  "sync_status" varchar NOT NULL DEFAULT 'active',
  "external_url" text,
  "external_updated_at" timestamptz,
  "last_seen_at" timestamptz,
  "metadata_json" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "external_object_mappings_external_object_type_check" CHECK ("external_object_type" in ('lead', 'contact', 'organization', 'deal', 'task', 'note', 'form_submission', 'row', 'email', 'custom')),
  CONSTRAINT "external_object_mappings_syrantis_entity_type_check" CHECK ("syrantis_entity_type" in ('organization', 'contact', 'lead', 'task', 'approval')),
  CONSTRAINT "external_object_mappings_sync_direction_check" CHECK ("sync_direction" in ('inbound', 'outbound', 'bidirectional')),
  CONSTRAINT "external_object_mappings_sync_status_check" CHECK ("sync_status" in ('active', 'stale', 'conflict', 'archived'))
);

CREATE INDEX IF NOT EXISTS "external_object_mappings_workspace_id_idx" ON "external_object_mappings" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "external_object_mappings_connection_id_idx" ON "external_object_mappings" USING btree ("connection_id");
CREATE INDEX IF NOT EXISTS "external_object_mappings_entity_idx" ON "external_object_mappings" USING btree ("syrantis_entity_type", "syrantis_entity_id");
CREATE INDEX IF NOT EXISTS "external_object_mappings_external_object_idx" ON "external_object_mappings" USING btree ("external_object_type", "external_object_id");
CREATE INDEX IF NOT EXISTS "external_object_mappings_created_at_idx" ON "external_object_mappings" USING btree ("created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "external_object_mappings_unique_idx" ON "external_object_mappings" USING btree ("workspace_id", "connection_id", "external_object_type", "external_object_id", "syrantis_entity_type");

CREATE TABLE IF NOT EXISTS "integration_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "connection_id" uuid REFERENCES "external_connections"("id"),
  "mapping_id" uuid REFERENCES "external_object_mappings"("id"),
  "direction" varchar NOT NULL,
  "event_type" varchar NOT NULL,
  "status" varchar NOT NULL,
  "external_object_type" varchar,
  "external_object_id" varchar,
  "syrantis_entity_type" varchar,
  "syrantis_entity_id" uuid,
  "message" text,
  "payload_hash" varchar,
  "metadata_json" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "integration_events_direction_check" CHECK ("direction" in ('inbound', 'outbound', 'internal')),
  CONSTRAINT "integration_events_status_check" CHECK ("status" in ('received', 'processed', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS "integration_events_workspace_id_idx" ON "integration_events" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "integration_events_connection_id_idx" ON "integration_events" USING btree ("connection_id");
CREATE INDEX IF NOT EXISTS "integration_events_mapping_id_idx" ON "integration_events" USING btree ("mapping_id");
CREATE INDEX IF NOT EXISTS "integration_events_event_type_idx" ON "integration_events" USING btree ("event_type");
CREATE INDEX IF NOT EXISTS "integration_events_status_idx" ON "integration_events" USING btree ("status");
CREATE INDEX IF NOT EXISTS "integration_events_created_at_idx" ON "integration_events" USING btree ("created_at");

ALTER TABLE "external_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "external_connections" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_external_connections"
  ON "external_connections"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (
    workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
  )
  WITH CHECK (
    workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
  );

ALTER TABLE "external_object_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "external_object_mappings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_external_object_mappings"
  ON "external_object_mappings"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (
    workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
  )
  WITH CHECK (
    workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
  );

ALTER TABLE "integration_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_integration_events"
  ON "integration_events"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (
    workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
  )
  WITH CHECK (
    workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid
  );

CREATE TRIGGER external_connections_set_updated_at
  BEFORE UPDATE ON "external_connections"
  FOR EACH ROW
  EXECUTE FUNCTION syrantis_set_updated_at();

CREATE TRIGGER external_object_mappings_set_updated_at
  BEFORE UPDATE ON "external_object_mappings"
  FOR EACH ROW
  EXECUTE FUNCTION syrantis_set_updated_at();
