ALTER TABLE "email_sends"
  ADD COLUMN IF NOT EXISTS "delivery_status" text,
  ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "bounced_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "complained_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "delivery_error_code" text;
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
      AND c.conname = 'email_sends_delivery_status_check'
      AND c.contype = 'c'
  ) THEN
    ALTER TABLE "email_sends"
    ADD CONSTRAINT "email_sends_delivery_status_check"
    CHECK ("delivery_status" IS NULL OR "delivery_status" IN ('delivered', 'bounced', 'complained'));
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
      AND c.conname = 'email_sends_delivered_requires_delivered_at'
      AND c.contype = 'c'
  ) THEN
    ALTER TABLE "email_sends"
    ADD CONSTRAINT "email_sends_delivered_requires_delivered_at"
    CHECK ("delivery_status" <> 'delivered' OR "delivered_at" IS NOT NULL);
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
      AND c.conname = 'email_sends_bounced_requires_bounced_at'
      AND c.contype = 'c'
  ) THEN
    ALTER TABLE "email_sends"
    ADD CONSTRAINT "email_sends_bounced_requires_bounced_at"
    CHECK ("delivery_status" <> 'bounced' OR "bounced_at" IS NOT NULL);
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
      AND c.conname = 'email_sends_complained_requires_complained_at'
      AND c.contype = 'c'
  ) THEN
    ALTER TABLE "email_sends"
    ADD CONSTRAINT "email_sends_complained_requires_complained_at"
    CHECK ("delivery_status" <> 'complained' OR "complained_at" IS NOT NULL);
  END IF;
END $$;
--> statement-breakpoint

CREATE POLICY "email_sends_provider_message_lookup"
ON "email_sends"
AS PERMISSIVE
FOR SELECT
TO PUBLIC
USING (
  "provider_message_id" IS NOT NULL
  AND "provider_message_id" = nullif(current_setting('app.current_provider_message_id', true), '')
);
