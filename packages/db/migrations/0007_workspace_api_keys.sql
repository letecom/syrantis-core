CREATE TABLE IF NOT EXISTS "workspace_api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id"),
  "name" varchar(160) NOT NULL,
  "key_hash" text NOT NULL,
  "key_prefix" varchar(24) NOT NULL,
  "last4" varchar(8) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "last_used_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_api_keys_status_check" CHECK ("status" in ('active', 'revoked'))
);

CREATE INDEX IF NOT EXISTS "workspace_api_keys_workspace_id_idx" ON "workspace_api_keys" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "workspace_api_keys_status_idx" ON "workspace_api_keys" USING btree ("status");
CREATE INDEX IF NOT EXISTS "workspace_api_keys_created_at_idx" ON "workspace_api_keys" USING btree ("created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_api_keys_key_hash_idx" ON "workspace_api_keys" USING btree ("key_hash");

ALTER TABLE "workspace_api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_api_keys" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_workspace_api_keys"
  ON "workspace_api_keys"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = nullif(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE TRIGGER workspace_api_keys_set_updated_at
  BEFORE UPDATE ON "workspace_api_keys"
  FOR EACH ROW
  EXECUTE FUNCTION syrantis_set_updated_at();
