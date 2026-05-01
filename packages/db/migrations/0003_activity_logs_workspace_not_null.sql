DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM activity_logs
    WHERE workspace_id IS NULL
  ) THEN
    RAISE EXCEPTION 'activity_logs.workspace_id contains NULL rows; refusing to set NOT NULL';
  END IF;
END;
$$;
--> statement-breakpoint

ALTER TABLE activity_logs ALTER COLUMN workspace_id SET NOT NULL;
