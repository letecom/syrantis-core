CREATE POLICY "workspace_api_keys_public_lookup"
  ON "workspace_api_keys"
  AS PERMISSIVE
  FOR SELECT
  TO PUBLIC
  USING (
    status = 'active'
    AND key_hash = nullif(current_setting('app.current_api_key_hash', true), '')
  );
