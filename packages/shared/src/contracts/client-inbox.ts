import { z } from "zod";

export const ClientInboxTabSchema = z.enum([
  "needs_review",
  "hot",
  "existing_contact",
  "ready_draft",
  "ignored",
  "all",
]);

export const ClientInboxScoreBandSchema = z.enum(["hot", "warm", "cold", "unknown"]);
export const ClientInboxCategorySchema = z.enum([
  "quote_request",
  "urgent_service",
  "follow_up",
  "newsletter",
  "system",
  "unknown",
]);
export const ClientInboxContactStatusSchema = z.enum([
  "new_contact",
  "existing_contact",
  "returning",
  "unknown",
]);
export const ClientInboxDraftStatusSchema = z.enum([
  "no_draft",
  "ready",
  "requested",
  "exported",
  "blocked",
]);
export const ClientInboxGmailExportStatusSchema = z.enum([
  "none",
  "not_exported",
  "requested",
  "leased",
  "exported",
  "blocked",
  "unknown",
]);
export const ClientInboxPipelineStateSchema = z.enum([
  "ignored",
  "classified",
  "scored",
  "draft_ready",
  "export_requested",
  "exported",
  "blocked",
  "processing",
  "unknown",
]);
export const ClientInboxSortSchema = z.enum(["newest", "score", "urgency"]);

export const ClientInboxMessageItemSchema = z.object({
  mailItemId: z.string().uuid(),
  classificationId: z.string().uuid().nullable(),
  leadId: z.string().uuid().nullable(),
  draftId: z.string().uuid().nullable(),
  receivedAt: z.string().datetime().nullable(),
  senderDisplay: z.string().nullable(),
  companyDisplay: z.string().nullable(),
  subject: z.string().nullable(),
  snippet: z.string().nullable(),
  score: z.number().int().min(0).max(100).nullable(),
  scoreBand: ClientInboxScoreBandSchema,
  category: ClientInboxCategorySchema,
  intent: z.string().nullable(),
  urgency: z.string().nullable(),
  contactStatus: ClientInboxContactStatusSchema,
  previousThreadCount: z.number().int().min(0),
  draftStatus: ClientInboxDraftStatusSchema,
  gmailExportStatus: ClientInboxGmailExportStatusSchema,
  pipelineState: ClientInboxPipelineStateSchema,
  attentionFlags: z.array(z.string()),
  needsReview: z.boolean(),
});

export const ClientInboxMessagesResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    generatedAt: z.string().datetime(),
    pagination: z.object({
      limit: z.number().int().min(1).max(50),
      offset: z.number().int().min(0),
      total: z.number().int().min(0),
    }),
    items: z.array(ClientInboxMessageItemSchema),
  }),
});

export const ClientInboxQuerySchema = z.object({
  tab: ClientInboxTabSchema.default("all"),
  scoreBand: ClientInboxScoreBandSchema.optional(),
  category: ClientInboxCategorySchema.optional(),
  contactStatus: ClientInboxContactStatusSchema.optional(),
  draftStatus: ClientInboxDraftStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sort: ClientInboxSortSchema.default("newest"),
});

const ClientInboxAttachmentSchema = z.object({
  filename: z.string().max(255).nullable(),
  mimeType: z.string().max(120).nullable(),
  sizeBytes: z.number().int().min(0).nullable(),
});

export const ClientInboxMessageDetailSchema = z.object({
  mail: z.object({
    mailItemId: z.string().uuid(),
    subject: z.string().nullable(),
    fromDisplay: z.string().nullable(),
    fromEmail: z.string().nullable(),
    toDisplay: z.string().nullable(),
    toEmail: z.string().nullable(),
    receivedAt: z.string().datetime().nullable(),
    bodyText: z.string().nullable(),
    snippet: z.string().nullable(),
    attachments: z.array(ClientInboxAttachmentSchema),
  }),
  analysis: z.object({
    category: ClientInboxCategorySchema,
    action: z.string().nullable(),
    reasonCode: z.string().nullable(),
    intent: z.string().nullable(),
    urgency: z.string().nullable(),
    score: z.number().int().min(0).max(100).nullable(),
    scoreBand: ClientInboxScoreBandSchema,
    confidence: z.number().int().min(0).max(100).nullable(),
    recommendedAction: z.string().nullable(),
    attentionFlags: z.array(z.string()),
  }),
  contactContext: z.object({
    contactKnown: z.boolean(),
    contactStatus: ClientInboxContactStatusSchema,
    previousLeadCount: z.number().int().min(0),
    previousThreadCount: z.number().int().min(0),
    lastInboundAt: z.string().datetime().nullable(),
    lastOutboundAt: z.string().datetime().nullable(),
    lastOutboundStatus: z.string().nullable(),
  }),
  companyPolicyContext: z.object({
    companyName: z.string().nullable(),
    sector: z.string().nullable(),
    language: z.string().nullable(),
    tone: z.string().nullable(),
    keyRulesMatched: z.array(z.string()),
    missingInfo: z.array(z.string()),
    forbiddenClaims: z.array(z.string()),
  }),
  draft: z.object({
    draftId: z.string().uuid().nullable(),
    subject: z.string().nullable(),
    bodyText: z.string().nullable(),
    status: z.string().nullable(),
    generatedAt: z.string().datetime().nullable(),
    editedAt: z.string().datetime().nullable(),
    source: z.string().nullable(),
    policyMatchScore: z.number().int().min(0).max(100).nullable(),
    canEdit: z.boolean(),
    canRewrite: z.boolean(),
    canExportToGmail: z.boolean(),
  }),
  gmailExport: z.object({
    status: ClientInboxGmailExportStatusSchema,
    requestedAt: z.string().datetime().nullable(),
    exportedAt: z.string().datetime().nullable(),
    blockingReasons: z.array(z.string()),
  }),
  actions: z.object({
    canEditDraft: z.boolean(),
    canRequestGmailExport: z.boolean(),
    canCancelGmailExport: z.boolean(),
    canRewriteLater: z.boolean(),
    canSendDirectLater: z.literal(false),
  }),
});

export const ClientInboxMessageDetailResponseSchema = z.object({
  success: z.literal(true),
  data: ClientInboxMessageDetailSchema,
});

export const ClientInboxDraftEditInputSchema = z
  .object({
    subject: z.string().trim().max(500),
    bodyText: z.string().trim().min(1).max(20000),
  })
  .strict();

export const ClientInboxDraftEditResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    mailItemId: z.string().uuid(),
    draftId: z.string().uuid(),
    status: z.string(),
    updatedAt: z.string().datetime(),
    canExportToGmail: z.boolean(),
  }),
});

export type ClientInboxTab = z.infer<typeof ClientInboxTabSchema>;
export type ClientInboxScoreBand = z.infer<typeof ClientInboxScoreBandSchema>;
export type ClientInboxCategory = z.infer<typeof ClientInboxCategorySchema>;
export type ClientInboxContactStatus = z.infer<typeof ClientInboxContactStatusSchema>;
export type ClientInboxDraftStatus = z.infer<typeof ClientInboxDraftStatusSchema>;
export type ClientInboxGmailExportStatus = z.infer<typeof ClientInboxGmailExportStatusSchema>;
export type ClientInboxPipelineState = z.infer<typeof ClientInboxPipelineStateSchema>;
export type ClientInboxSort = z.infer<typeof ClientInboxSortSchema>;
export type ClientInboxMessageItem = z.infer<typeof ClientInboxMessageItemSchema>;
export type ClientInboxMessagesResponse = z.infer<typeof ClientInboxMessagesResponseSchema>;
export type ClientInboxQuery = z.infer<typeof ClientInboxQuerySchema>;
export type ClientInboxMessageDetail = z.infer<typeof ClientInboxMessageDetailSchema>;
export type ClientInboxMessageDetailResponse = z.infer<
  typeof ClientInboxMessageDetailResponseSchema
>;
export type ClientInboxDraftEditInput = z.infer<typeof ClientInboxDraftEditInputSchema>;
export type ClientInboxDraftEditResponse = z.infer<typeof ClientInboxDraftEditResponseSchema>;
