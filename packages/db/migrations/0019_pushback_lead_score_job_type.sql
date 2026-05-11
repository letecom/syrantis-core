ALTER TABLE "background_jobs" DROP CONSTRAINT IF EXISTS "background_jobs_type_check";

ALTER TABLE "background_jobs"
  ADD CONSTRAINT "background_jobs_type_check"
  CHECK ("type" in ('send_email', 'score_lead', 'generate_ai_draft', 'pushback_lead_score'));
