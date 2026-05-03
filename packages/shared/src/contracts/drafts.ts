import { z } from "zod";

import { ApprovalOutputSchema } from "./approvals.js";
import { EmailSendStatusSchema } from "./email-sends.js";

export const DraftStatusSchema = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "archived",
]);

export const DraftChannelSchema = z.enum(["email"]);

const MetadataSchema = z.record(z.unknown());

function hasDraftBody(value: {
  textBody?: string | undefined;
  htmlBody?: string | undefined;
}): boolean {
  return Boolean(value.textBody || value.htmlBody);
}

export const CreateDraftInputSchema = z
  .object({
    leadId: z.string().uuid(),
    contactId: z.string().uuid().optional(),
    channel: DraftChannelSchema.optional(),
    subject: z.string().trim().max(500).optional(),
    textBody: z.string().trim().max(20000).optional(),
    htmlBody: z.string().trim().max(50000).optional(),
    metadata: MetadataSchema.optional(),
  })
  .refine(hasDraftBody, {
    message: "At least one draft body field is required.",
  });

export const UpdateDraftInputSchema = z
  .object({
    subject: z.string().trim().max(500).nullable().optional(),
    textBody: z.string().trim().max(20000).nullable().optional(),
    htmlBody: z.string().trim().max(50000).nullable().optional(),
    metadata: MetadataSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export const DraftListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const RequestDraftApprovalInputSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});

export const DraftOutputSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  taskId: z.string().uuid().nullable(),
  leadId: z.string().uuid().nullable(),
  opportunityId: z.string().uuid().nullable(),
  contactId: z.string().uuid().nullable(),
  status: DraftStatusSchema,
  channel: DraftChannelSchema,
  subject: z.string().nullable(),
  textBody: z.string().nullable(),
  htmlBody: z.string().nullable(),
  metadata: MetadataSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const DraftSuccessSchema = z.object({
  success: z.literal(true),
  data: DraftOutputSchema,
});

export const DraftListSuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(DraftOutputSchema),
});

export const DraftAiAuditWarningSchema = z.enum([
  "AI_RUN_NOT_FOUND",
  "AI_RUN_INVALID",
  "SOURCE_SCORE_NOT_FOUND",
  "AI_DRAFT_METADATA_INVALID",
  "AI_RUN_FINISH_REASON_WARNING",
]);

export const DraftAiAuditFinishReasonSchema = z.enum([
  "completed",
  "truncated",
  "filtered",
  "unknown",
]);

export const DraftAiAuditOutputSchema = z.object({
  draftId: z.string().uuid(),
  leadId: z.string().uuid(),
  origin: z.literal("ai_draft_generation"),
  generatedAt: z.string().datetime(),
  promptTemplateId: z.string().nullable(),
  aiRun: z
    .object({
      id: z.string().uuid(),
      status: z.enum(["running", "success", "error", "pending", "cached", "fallback"]),
      provider: z.string().nullable(),
      model: z.string().nullable(),
      finishReason: DraftAiAuditFinishReasonSchema,
      latencyMs: z.number().int().nullable(),
      completedAt: z.string().datetime().nullable(),
    })
    .nullable(),
  sourceScore: z
    .object({
      id: z.string().uuid(),
      score: z.number().int().min(0).max(100),
      qualification: z.enum(["cold", "warm", "hot"]),
      confidence: z.number().int().min(0).max(100),
      scoredAt: z.string().datetime(),
    })
    .nullable(),
  warnings: z.array(DraftAiAuditWarningSchema),
});

export const DraftAiAuditSuccessSchema = z.object({
  success: z.literal(true),
  data: DraftAiAuditOutputSchema.nullable(),
});

export const DraftApprovalReadinessCheckCodeSchema = z.enum([
  "DRAFT_NOT_IN_DRAFT_STATE",
  "UNSUPPORTED_CHANNEL",
  "MISSING_LEAD",
  "EMPTY_SUBJECT",
  "EMPTY_BODY",
  "INVALID_CONTACT",
  "APPROVAL_ALREADY_PENDING",
  "NO_CONTACT_RECIPIENT",
  "CONTACT_NO_EMAIL",
  "AI_RUN_NOT_FOUND",
  "AI_RUN_INVALID",
  "SOURCE_SCORE_NOT_FOUND",
  "AI_DRAFT_METADATA_INVALID",
  "AI_RUN_FINISH_REASON_WARNING",
]);

export const DraftApprovalReadinessCheckSchema = z.object({
  code: DraftApprovalReadinessCheckCodeSchema,
  severity: z.enum(["blocker", "warning"]),
  source: z.enum(["draft", "lead", "contact", "ai_audit", "approval"]),
  message: z.string(),
  field: z.string().optional(),
});

export const DraftApprovalReadinessOutputSchema = z.object({
  draftId: z.string().uuid(),
  status: z.enum(["ready", "ready_with_warnings", "blocked"]),
  canRequestApproval: z.boolean(),
  blockerCount: z.number().int().min(0),
  warningCount: z.number().int().min(0),
  checks: z.array(DraftApprovalReadinessCheckSchema),
  context: z.object({
    draftStatus: z.string(),
    channel: z.string(),
    hasLead: z.boolean(),
    hasSubject: z.boolean(),
    hasBody: z.boolean(),
    hasContact: z.boolean(),
    contactHasEmail: z.boolean().nullable(),
    isAIGenerated: z.boolean(),
  }),
});

export const DraftApprovalReadinessSuccessSchema = z.object({
  success: z.literal(true),
  data: DraftApprovalReadinessOutputSchema,
});

export const DraftSendReadinessCheckCodeSchema = z.enum([
  "DRAFT_NOT_APPROVED",
  "UNSUPPORTED_CHANNEL",
  "EMPTY_SUBJECT",
  "EMPTY_BODY",
  "NO_CONTACT",
  "INVALID_CONTACT",
  "CONTACT_NO_EMAIL",
  "CONTACT_OPTED_OUT",
  "APPROVAL_NOT_CONFIRMED",
  "EMAIL_SEND_ALREADY_PENDING",
  "EMAIL_SEND_ALREADY_QUEUED",
  "EMAIL_ALREADY_SENT",
  "PREVIOUS_SEND_FAILED",
  "PREVIOUS_SEND_CANCELLED",
  "NO_HTML_BODY",
  "NO_TEXT_BODY",
]);

export const DraftSendReadinessCheckSchema = z.object({
  code: DraftSendReadinessCheckCodeSchema,
  severity: z.enum(["blocker", "warning"]),
  source: z.enum(["draft", "contact", "approval", "email_send"]),
  message: z.string(),
  field: z.string().optional(),
});

export const DraftSendReadinessOutputSchema = z.object({
  draftId: z.string().uuid(),
  status: z.enum(["ready", "ready_with_warnings", "blocked"]),
  canRequestSend: z.boolean(),
  blockerCount: z.number().int().min(0),
  warningCount: z.number().int().min(0),
  checks: z.array(DraftSendReadinessCheckSchema),
  context: z.object({
    draftStatus: z.string(),
    channel: z.string(),
    hasSubject: z.boolean(),
    hasBody: z.boolean(),
    hasContact: z.boolean(),
    contactHasEmail: z.boolean().nullable(),
    contactOptOut: z.boolean().nullable(),
    hasApprovedApproval: z.boolean(),
    latestEmailSendStatus: z
      .enum(["pending", "queued", "sent", "failed", "cancelled"])
      .nullable(),
  }),
});

export const DraftSendReadinessSuccessSchema = z.object({
  success: z.literal(true),
  data: DraftSendReadinessOutputSchema,
});

export const DraftSendStatusLatestSendSchema = z.object({
  status: EmailSendStatusSchema,
  requestedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sentAt: z.string().datetime().nullable(),
  failedAt: z.string().datetime().nullable(),
  errorCode: z.string().nullable(),
});

export const DraftSendStatusOutputSchema = z.object({
  draftId: z.string().uuid(),
  hasSend: z.boolean(),
  latestSend: DraftSendStatusLatestSendSchema.nullable(),
});

export const DraftSendStatusSuccessSchema = z.object({
  success: z.literal(true),
  data: DraftSendStatusOutputSchema,
});

export const DraftApprovalRequestSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    draft: DraftOutputSchema,
    approval: ApprovalOutputSchema,
  }),
});

export type DraftStatus = z.infer<typeof DraftStatusSchema>;
export type DraftChannel = z.infer<typeof DraftChannelSchema>;
export type CreateDraftInput = z.infer<typeof CreateDraftInputSchema>;
export type UpdateDraftInput = z.infer<typeof UpdateDraftInputSchema>;
export type DraftListQuery = z.infer<typeof DraftListQuerySchema>;
export type RequestDraftApprovalInput = z.infer<typeof RequestDraftApprovalInputSchema>;
export type DraftOutput = z.infer<typeof DraftOutputSchema>;
export type DraftSuccess = z.infer<typeof DraftSuccessSchema>;
export type DraftListSuccess = z.infer<typeof DraftListSuccessSchema>;
export type DraftAiAuditWarning = z.infer<typeof DraftAiAuditWarningSchema>;
export type DraftAiAuditFinishReason = z.infer<typeof DraftAiAuditFinishReasonSchema>;
export type DraftAiAuditOutput = z.infer<typeof DraftAiAuditOutputSchema>;
export type DraftAiAuditSuccess = z.infer<typeof DraftAiAuditSuccessSchema>;
export type DraftApprovalReadinessCheckCode = z.infer<
  typeof DraftApprovalReadinessCheckCodeSchema
>;
export type DraftApprovalReadinessCheck = z.infer<typeof DraftApprovalReadinessCheckSchema>;
export type DraftApprovalReadinessOutput = z.infer<typeof DraftApprovalReadinessOutputSchema>;
export type DraftApprovalReadinessSuccess = z.infer<
  typeof DraftApprovalReadinessSuccessSchema
>;
export type DraftSendReadinessCheckCode = z.infer<typeof DraftSendReadinessCheckCodeSchema>;
export type DraftSendReadinessCheck = z.infer<typeof DraftSendReadinessCheckSchema>;
export type DraftSendReadinessOutput = z.infer<typeof DraftSendReadinessOutputSchema>;
export type DraftSendReadinessSuccess = z.infer<typeof DraftSendReadinessSuccessSchema>;
export type DraftSendStatusLatestSend = z.infer<typeof DraftSendStatusLatestSendSchema>;
export type DraftSendStatusOutput = z.infer<typeof DraftSendStatusOutputSchema>;
export type DraftSendStatusSuccess = z.infer<typeof DraftSendStatusSuccessSchema>;
export type DraftApprovalRequestSuccess = z.infer<typeof DraftApprovalRequestSuccessSchema>;
