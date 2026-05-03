CREATE UNIQUE INDEX IF NOT EXISTS "email_sends_provider_message_id_unique_idx"
ON "email_sends" ("provider_message_id")
WHERE "provider_message_id" IS NOT NULL;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'email_sends'
      AND c.conname = 'email_sends_sent_requires_sent_at'
      AND c.contype = 'c'
  ) THEN
    ALTER TABLE "email_sends"
    ADD CONSTRAINT "email_sends_sent_requires_sent_at"
    CHECK ("status" <> 'sent' OR "sent_at" IS NOT NULL);
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'email_sends'
      AND c.conname = 'email_sends_failed_requires_failed_at'
      AND c.contype = 'c'
  ) THEN
    ALTER TABLE "email_sends"
    ADD CONSTRAINT "email_sends_failed_requires_failed_at"
    CHECK ("status" <> 'failed' OR "failed_at" IS NOT NULL);
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'email_sends'
      AND c.conname = 'email_sends_failed_requires_last_error_code'
      AND c.contype = 'c'
  ) THEN
    ALTER TABLE "email_sends"
    ADD CONSTRAINT "email_sends_failed_requires_last_error_code"
    CHECK ("status" <> 'failed' OR "last_error_code" IS NOT NULL);
  END IF;
END $$;
