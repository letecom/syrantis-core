CREATE TABLE IF NOT EXISTS "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"user_id" uuid,
	"entity_type" varchar(80),
	"entity_id" uuid,
	"type" varchar(80) NOT NULL,
	"severity" varchar(24) DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_logs_severity_check" CHECK ("activity_logs"."severity" in ('debug', 'info', 'warn', 'error', 'critical'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"skill_name" varchar(160) NOT NULL,
	"prompt_file" text NOT NULL,
	"prompt_hash" varchar(128) NOT NULL,
	"git_commit" varchar(64),
	"input_hash" varchar(128),
	"input_payload" jsonb,
	"output_payload" jsonb,
	"output_text" text,
	"model_used" varchar(120),
	"cost_cents" integer,
	"latency_ms" integer,
	"confidence_score" numeric(5, 4),
	"status" varchar(24) NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_runs_status_check" CHECK ("ai_runs"."status" in ('success', 'error', 'cached', 'fallback'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" uuid NOT NULL,
	"draft_id" uuid,
	"task_id" uuid,
	"approval_type" varchar(32) DEFAULT 'manual' NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"requested_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejected_by" uuid,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"risk_level" varchar(24) DEFAULT 'medium' NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approvals_status_check" CHECK ("approvals"."status" in ('pending', 'approved', 'rejected', 'expired', 'revoked')),
	CONSTRAINT "approvals_entity_type_check" CHECK ("approvals"."entity_type" in ('draft', 'task', 'report', 'template')),
	CONSTRAINT "approvals_approval_type_check" CHECK ("approvals"."approval_type" in ('manual', 'template_trusted', 'score_based')),
	CONSTRAINT "approvals_risk_level_check" CHECK ("approvals"."risk_level" in ('low', 'medium', 'high', 'critical'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"organization_id" uuid,
	"first_name" varchar(120),
	"last_name" varchar(120),
	"email" varchar(320),
	"phone" varchar(80),
	"role_title" varchar(160),
	"opt_out" boolean DEFAULT false NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid,
	"lead_id" uuid,
	"opportunity_id" uuid,
	"contact_id" uuid,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"channel" varchar(32) DEFAULT 'email' NOT NULL,
	"subject" text,
	"text_body" text,
	"html_body" text,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drafts_status_check" CHECK ("drafts"."status" in ('draft', 'pending_approval', 'approved', 'rejected', 'archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email_send_id" uuid,
	"provider" varchar(80) NOT NULL,
	"provider_event_id" varchar(255),
	"event_type" varchar(24) NOT NULL,
	"event_hash" varchar(255) NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"recipient_email" varchar(320),
	"timestamp" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_events_event_hash_unique" UNIQUE("event_hash"),
	CONSTRAINT "email_events_event_type_check" CHECK ("email_events"."event_type" in ('delivered', 'bounce', 'complaint', 'open', 'click', 'reply'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"approval_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"from_email" varchar(320) NOT NULL,
	"to_email" varchar(320) NOT NULL,
	"reply_to_email" varchar(320),
	"subject" text NOT NULL,
	"text_body" text,
	"html_body" text,
	"provider" varchar(80) DEFAULT 'resend' NOT NULL,
	"provider_message_id" varchar(255),
	"idempotency_key" varchar(255) NOT NULL,
	"approval_checked_at" timestamp with time zone,
	"suppression_checked_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"last_error_code" varchar(120),
	"last_error_message" text,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_sends_provider_message_id_unique" UNIQUE("provider_message_id"),
	CONSTRAINT "email_sends_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "email_sends_status_check" CHECK ("email_sends"."status" in ('queued', 'sent', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"organization_id" uuid,
	"contact_id" uuid,
	"source" varchar(24) DEFAULT 'manual' NOT NULL,
	"status" varchar(24) DEFAULT 'new' NOT NULL,
	"raw_content" text,
	"normalized_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" integer,
	"score_reason" text,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_status_check" CHECK ("leads"."status" in ('new', 'scored', 'drafted', 'responded', 'lost', 'won')),
	CONSTRAINT "leads_source_check" CHECK ("leads"."source" in ('email', 'form', 'phone', 'manual', 'import'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_entity_type_check" CHECK ("notes"."entity_type" in ('organization', 'contact', 'lead', 'opportunity', 'task'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"organization_id" uuid,
	"contact_id" uuid,
	"lead_id" uuid,
	"title" varchar(255) NOT NULL,
	"status" varchar(32) DEFAULT 'open' NOT NULL,
	"value_cents" integer,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"quote_sent_at" timestamp with time zone,
	"won_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_status_check" CHECK ("opportunities"."status" in ('open', 'quote_sent', 'followup_due', 'won', 'lost', 'archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"sector" varchar(120),
	"website_url" text,
	"phone" varchar(80),
	"email" varchar(320),
	"status" varchar(32) DEFAULT 'prospect' NOT NULL,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_status_check" CHECK ("organizations"."status" in ('prospect', 'active_client', 'inactive', 'archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_status_check" CHECK ("sessions"."status" in ('active', 'revoked', 'expired'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"organization_id" uuid,
	"contact_id" uuid,
	"lead_id" uuid,
	"opportunity_id" uuid,
	"type" varchar(24) DEFAULT 'followup' NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"due_at" timestamp with time zone,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_type_check" CHECK ("tasks"."type" in ('followup', 'approval', 'review', 'call', 'note', 'setup')),
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" in ('pending', 'in_progress', 'done', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" varchar(24) NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"name" varchar(255) NOT NULL,
	"subject" text,
	"body_text" text,
	"body_html" text,
	"variables_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_type_check" CHECK ("templates"."type" in ('reply', 'followup', 'diagnostic', 'report', 'other')),
	CONSTRAINT "templates_status_check" CHECK ("templates"."status" in ('active', 'draft', 'archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text,
	"name" varchar(255),
	"role" varchar(24) DEFAULT 'operator' NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('founder', 'admin', 'operator', 'client')),
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"features_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stripe_customer_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug"),
	CONSTRAINT "workspaces_status_check" CHECK ("workspaces"."status" in ('active', 'paused', 'archived'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drafts" ADD CONSTRAINT "drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drafts" ADD CONSTRAINT "drafts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drafts" ADD CONSTRAINT "drafts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drafts" ADD CONSTRAINT "drafts_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drafts" ADD CONSTRAINT "drafts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_events" ADD CONSTRAINT "email_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_events" ADD CONSTRAINT "email_events_email_send_id_email_sends_id_fk" FOREIGN KEY ("email_send_id") REFERENCES "public"."email_sends"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notes" ADD CONSTRAINT "notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organizations" ADD CONSTRAINT "organizations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "templates" ADD CONSTRAINT "templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_workspace_id_idx" ON "activity_logs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_user_id_idx" ON "activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_entity_idx" ON "activity_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_type_idx" ON "activity_logs" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_severity_idx" ON "activity_logs" USING btree ("severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_created_at_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_runs_workspace_id_idx" ON "ai_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_runs_skill_name_idx" ON "ai_runs" USING btree ("skill_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_runs_prompt_hash_idx" ON "ai_runs" USING btree ("prompt_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_runs_git_commit_idx" ON "ai_runs" USING btree ("git_commit");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_runs_input_hash_idx" ON "ai_runs" USING btree ("input_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_runs_status_idx" ON "ai_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_runs_created_at_idx" ON "ai_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_workspace_id_idx" ON "approvals" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_entity_idx" ON "approvals" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_draft_id_idx" ON "approvals" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_task_id_idx" ON "approvals" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_requested_by_idx" ON "approvals" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_approved_by_idx" ON "approvals" USING btree ("approved_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_rejected_by_idx" ON "approvals" USING btree ("rejected_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_workspace_status_idx" ON "approvals" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_approval_type_idx" ON "approvals" USING btree ("approval_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_created_at_idx" ON "approvals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_workspace_id_idx" ON "contacts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_organization_id_idx" ON "contacts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_email_idx" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_opt_out_idx" ON "contacts" USING btree ("opt_out");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_created_at_idx" ON "contacts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drafts_workspace_id_idx" ON "drafts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drafts_task_id_idx" ON "drafts" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drafts_lead_id_idx" ON "drafts" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drafts_opportunity_id_idx" ON "drafts" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drafts_contact_id_idx" ON "drafts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drafts_workspace_status_idx" ON "drafts" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drafts_channel_idx" ON "drafts" USING btree ("channel");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drafts_created_at_idx" ON "drafts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_events_workspace_id_idx" ON "email_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_events_email_send_id_idx" ON "email_events" USING btree ("email_send_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_events_provider_idx" ON "email_events" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_events_provider_event_id_idx" ON "email_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_events_event_type_idx" ON "email_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_events_event_hash_idx" ON "email_events" USING btree ("event_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_events_timestamp_idx" ON "email_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_events_created_at_idx" ON "email_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_sends_workspace_id_idx" ON "email_sends" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_sends_approval_id_idx" ON "email_sends" USING btree ("approval_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_sends_draft_id_idx" ON "email_sends" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_sends_workspace_status_idx" ON "email_sends" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_sends_provider_idx" ON "email_sends" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_sends_provider_message_id_idx" ON "email_sends" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_sends_idempotency_key_idx" ON "email_sends" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_sends_sent_at_idx" ON "email_sends" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_sends_failed_at_idx" ON "email_sends" USING btree ("failed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_sends_created_at_idx" ON "email_sends" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_workspace_id_idx" ON "leads" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_organization_id_idx" ON "leads" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_contact_id_idx" ON "leads" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_workspace_status_idx" ON "leads" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_source_idx" ON "leads" USING btree ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_received_at_idx" ON "leads" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_created_at_idx" ON "leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_workspace_id_idx" ON "notes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_entity_idx" ON "notes" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_author_id_idx" ON "notes" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_created_at_idx" ON "notes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_workspace_id_idx" ON "opportunities" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_organization_id_idx" ON "opportunities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_contact_id_idx" ON "opportunities" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_lead_id_idx" ON "opportunities" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_workspace_status_idx" ON "opportunities" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_quote_sent_at_idx" ON "opportunities" USING btree ("quote_sent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_created_at_idx" ON "opportunities" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_workspace_id_idx" ON "organizations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_workspace_status_idx" ON "organizations" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_email_idx" ON "organizations" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_created_at_idx" ON "organizations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_workspace_id_idx" ON "sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_status_idx" ON "sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_created_at_idx" ON "sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_workspace_id_idx" ON "tasks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_organization_id_idx" ON "tasks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_contact_id_idx" ON "tasks" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_lead_id_idx" ON "tasks" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_opportunity_id_idx" ON "tasks" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_workspace_status_idx" ON "tasks" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_type_idx" ON "tasks" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_due_at_idx" ON "tasks" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_created_at_idx" ON "tasks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_workspace_id_idx" ON "templates" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_workspace_type_idx" ON "templates" USING btree ("workspace_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_workspace_status_idx" ON "templates" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_created_at_idx" ON "templates" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_workspace_id_idx" ON "users" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_workspace_role_idx" ON "users" USING btree ("workspace_id","role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspaces_status_idx" ON "workspaces" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspaces_created_at_idx" ON "workspaces" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspaces_stripe_customer_id_idx" ON "workspaces" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspaces_stripe_subscription_id_idx" ON "workspaces" USING btree ("stripe_subscription_id");