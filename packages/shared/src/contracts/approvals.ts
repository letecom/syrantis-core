import { z } from "zod";

export const ApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "expired",
  "revoked",
]);

export const CreateApprovalInputSchema = z.object({
  taskId: z.string().uuid(),
  metadata: z.record(z.unknown()).optional(),
});

export const RejectApprovalInputSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const ApprovalListQuerySchema = z.object({
  taskId: z.string().uuid().optional(),
  status: ApprovalStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ApprovalOutputSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  draftId: z.string().uuid().nullable(),
  taskId: z.string().uuid().nullable(),
  status: ApprovalStatusSchema,
  approvedBy: z.string().uuid().nullable(),
  approvedAt: z.string().nullable(),
  rejectedBy: z.string().uuid().nullable(),
  rejectedAt: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ApprovalSuccessSchema = z.object({
  success: z.literal(true),
  data: ApprovalOutputSchema,
});

export const ApprovalListSuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(ApprovalOutputSchema),
});

export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;
export type CreateApprovalInput = z.infer<typeof CreateApprovalInputSchema>;
export type RejectApprovalInput = z.infer<typeof RejectApprovalInputSchema>;
export type ApprovalListQuery = z.infer<typeof ApprovalListQuerySchema>;
export type ApprovalOutput = z.infer<typeof ApprovalOutputSchema>;
export type ApprovalSuccess = z.infer<typeof ApprovalSuccessSchema>;
export type ApprovalListSuccess = z.infer<typeof ApprovalListSuccessSchema>;
