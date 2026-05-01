import { z } from "zod";

export const ActivityLogActionSchema = z.enum([
  "organization.created",
  "organization.updated",
  "organization.archived",
  "contact.created",
  "contact.updated",
  "task.created",
  "task.updated",
  "approval.created",
  "approval.approved",
  "approval.rejected"
]);

export const ActivityLogEntityTypeSchema = z.enum(["organization", "contact", "task", "approval"]);

export const ActivityLogQuerySchema = z.object({
  entityType: ActivityLogEntityTypeSchema.optional(),
  entityId: z.string().uuid().optional(),
  action: ActivityLogActionSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const ActivityLogOutputSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  actorUserId: z.string().uuid().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().uuid().nullable(),
  metadata: z.record(z.unknown()),
  createdAt: z.string()
});

export const ActivityLogListSuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(ActivityLogOutputSchema)
});

export type ActivityLogAction = z.infer<typeof ActivityLogActionSchema>;
export type ActivityLogEntityType = z.infer<typeof ActivityLogEntityTypeSchema>;
export type ActivityLogQuery = z.infer<typeof ActivityLogQuerySchema>;
export type ActivityLogOutput = z.infer<typeof ActivityLogOutputSchema>;
export type ActivityLogListSuccess = z.infer<typeof ActivityLogListSuccessSchema>;
