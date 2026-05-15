import { z } from "zod";

export const DraftQueueScoreBandSchema = z.enum(["cold", "warm", "hot", "unknown"]);
export const DraftQueueGmailExportStatusSchema = z.enum([
  "not_exported",
  "requested",
  "leased",
  "exported",
  "blocked",
  "unknown",
]);
export const DraftQueueReviewStatusSchema = z.enum([
  "pending_review",
  "exported",
  "blocked",
  "unknown",
]);

const DraftQueueScoreSchema = z.object({
  scoreBand: DraftQueueScoreBandSchema,
  score: z.number().int().min(0).max(100).nullable(),
  confidence: z.number().int().min(0).max(100).nullable(),
  recommendedAction: z.string().nullable(),
  urgency: z.string().nullable(),
  intent: z.string().nullable(),
});

const DraftQueueContextSummarySchema = z.object({
  companyName: z.string().nullable(),
  sector: z.string().nullable(),
  language: z.string().nullable(),
  contactKnown: z.boolean(),
  previousLeadCount: z.number().int().min(0),
  riskFlags: z.array(z.string()),
});

const DraftQueueGmailExportSchema = z.object({
  exportStatus: DraftQueueGmailExportStatusSchema,
  canExport: z.boolean(),
  blockingReasons: z.array(z.string()),
  exportedAt: z.string().datetime().nullable(),
});

export const DraftQueueItemSchema = z.object({
  draftId: z.string().uuid(),
  leadId: z.string().uuid(),
  createdAt: z.string().datetime(),
  score: DraftQueueScoreSchema,
  contextSummary: DraftQueueContextSummarySchema,
  draftPreview: z.object({
    hasSubject: z.boolean(),
    hasBodyText: z.boolean(),
    subjectPreview: z.string().max(120).nullable(),
    bodyPreview: z.string().max(280).nullable(),
    tone: z.string().nullable(),
    language: z.string().nullable(),
  }),
  gmailExport: DraftQueueGmailExportSchema,
  reviewStatus: DraftQueueReviewStatusSchema,
  attentionFlags: z.array(z.string()),
});

export const DraftQueueDetailSchema = z.object({
  draftId: z.string().uuid(),
  leadId: z.string().uuid(),
  createdAt: z.string().datetime(),
  score: DraftQueueScoreSchema,
  contextSummary: DraftQueueContextSummarySchema,
  gmailExport: DraftQueueGmailExportSchema,
  reviewStatus: DraftQueueReviewStatusSchema,
  attentionFlags: z.array(z.string()),
  proposedDraft: z.object({
    subject: z.string(),
    bodyText: z.string(),
    tone: z.string().nullable(),
    language: z.string().nullable(),
    generatedAt: z.string().datetime(),
  }),
});

export const DraftQueueSummarySchema = z.object({
  pendingReview: z.number().int().min(0),
  readyForGmailExport: z.number().int().min(0),
  exported: z.number().int().min(0),
  blocked: z.number().int().min(0),
  attentionRequired: z.number().int().min(0),
});

export const DraftQueueResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(DraftQueueItemSchema),
    summary: DraftQueueSummarySchema,
    limit: z.number().int().min(1).max(50),
    offset: z.number().int().min(0),
    generatedAt: z.string().datetime(),
  }),
});

export const DraftQueueDetailResponseSchema = z.object({
  success: z.literal(true),
  data: DraftQueueDetailSchema,
});

function booleanFromQuery(value: unknown) {
  if (value === "true" || value === true) {
    return true;
  }

  if (value === "false" || value === false) {
    return false;
  }

  return value;
}

export const DraftQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  scoreBand: DraftQueueScoreBandSchema.optional(),
  exportStatus: DraftQueueGmailExportStatusSchema.optional(),
  attentionRequired: z.preprocess(booleanFromQuery, z.boolean().optional()),
  since: z.string().datetime().optional(),
});

export type DraftQueueScoreBand = z.infer<typeof DraftQueueScoreBandSchema>;
export type DraftQueueGmailExportStatus = z.infer<typeof DraftQueueGmailExportStatusSchema>;
export type DraftQueueReviewStatus = z.infer<typeof DraftQueueReviewStatusSchema>;
export type DraftQueueItem = z.infer<typeof DraftQueueItemSchema>;
export type DraftQueueDetail = z.infer<typeof DraftQueueDetailSchema>;
export type DraftQueueResponse = z.infer<typeof DraftQueueResponseSchema>;
export type DraftQueueDetailResponse = z.infer<typeof DraftQueueDetailResponseSchema>;
export type DraftQueueQuery = z.infer<typeof DraftQueueQuerySchema>;
