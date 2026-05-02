ALTER TABLE "ai_runs"
  ADD COLUMN IF NOT EXISTS "finish_reason" varchar(50),
  ADD COLUMN IF NOT EXISTS "cost_estimate_micro_usd" integer NOT NULL DEFAULT 0;
