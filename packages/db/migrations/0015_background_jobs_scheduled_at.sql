ALTER TABLE "background_jobs"
  ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp with time zone;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "background_jobs_pending_send_email_scheduled_at_idx"
ON "background_jobs" USING btree ("type", "scheduled_at", "created_at")
WHERE "status" = 'pending' AND "type" = 'send_email';
