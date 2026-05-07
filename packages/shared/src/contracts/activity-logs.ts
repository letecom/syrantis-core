import { z } from "zod";

export const ActivityLogActionSchema = z.enum([
  "organization.created",
  "organization.updated",
  "organization.archived",
  "contact.created",
  "contact.updated",
  "draft.created",
  "draft.updated",
  "draft.archived",
  "draft.approval_requested",
  "draft.ai_generation_requested",
  "draft.ai_generated",
  "draft.ai_generation_failed",
  "draft.approved",
  "draft.rejected",
  "email_send.requested",
  "email_send.created",
  "email_send.queued",
  "email_send.sent",
  "email_send.failed",
  "email_send.cancelled",
  "email_send.delivery_updated",
  "crm_pushback.skipped",
  "crm_pushback.succeeded",
  "crm_pushback.failed",
  "google_sheets_setup.test_succeeded",
  "google_sheets_setup.test_failed",
  "google_sheets_setup.test_skipped",
  "lead.created",
  "lead.updated",
  "lead.score_requested",
  "lead.scored",
  "ai_run.started",
  "ai_run.completed",
  "ai_run.failed",
  "task.created",
  "task.updated",
  "approval.created",
  "approval.approved",
  "approval.rejected",
  "background_job.claimed",
  "background_job.completed",
  "background_job.failed",
  "external_connection.created",
  "external_connection.updated",
  "external_connection.archived",
  "external_object_mapping.created",
  "external_object_mapping.updated",
  "external_object_mapping.archived",
  "workspace_api_key.created",
  "workspace_api_key.revoked",
  "public_lead.received",
]);

export const ActivityLogEntityTypeSchema = z.enum([
  "organization",
  "contact",
  "draft",
  "email_send",
  "lead",
  "ai_run",
  "task",
  "approval",
  "background_job",
  "external_connection",
  "external_object_mapping",
  "workspace_api_key",
  "google_sheets_setup",
]);

export const ActivityLogQuerySchema = z.object({
  entityType: ActivityLogEntityTypeSchema.optional(),
  entityId: z.string().uuid().optional(),
  action: ActivityLogActionSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ActivityLogOutputSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  actorUserId: z.string().uuid().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().uuid().nullable(),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
});

export const ActivityLogListSuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(ActivityLogOutputSchema),
});

export type ActivityLogAction = z.infer<typeof ActivityLogActionSchema>;
export type ActivityLogEntityType = z.infer<typeof ActivityLogEntityTypeSchema>;
export type ActivityLogQuery = z.infer<typeof ActivityLogQuerySchema>;
export type ActivityLogOutput = z.infer<typeof ActivityLogOutputSchema>;
export type ActivityLogListSuccess = z.infer<typeof ActivityLogListSuccessSchema>;
