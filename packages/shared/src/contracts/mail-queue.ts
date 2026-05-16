import { z } from "zod";

export const MailQueueClassificationActionSchema = z.enum(["create_lead", "ignore", "review"]);
export const MailQueueScoreBandSchema = z.enum(["cold", "warm", "hot", "unknown"]);
export const MailQueueContactStatusSchema = z.enum(["new", "known", "returning", "unknown"]);
export const MailQueueGmailExportStatusSchema = z.enum([
  "none",
  "not_exported",
  "requested",
  "leased",
  "exported",
  "blocked",
  "unknown",
]);
export const MailQueuePipelineStateSchema = z.enum([
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
export const MailQueueNextBestActionSchema = z.enum([
  "review_now",
  "view_draft",
  "request_export",
  "wait",
  "ignored",
  "unknown",
]);

const MailQueueScoreSchema = z.object({
  scoreBand: MailQueueScoreBandSchema,
  score: z.number().int().min(0).max(100).nullable(),
  confidence: z.number().int().min(0).max(100).nullable(),
  recommendedAction: z.string().nullable(),
  urgency: z.string().nullable(),
  intent: z.string().nullable(),
  scoredAt: z.string().datetime().nullable(),
});

const MailQueueContactSchema = z.object({
  known: z.boolean(),
  previousLeadCount: z.number().int().min(0),
  status: MailQueueContactStatusSchema,
});

const MailQueueDraftSchema = z.object({
  draftId: z.string().uuid().nullable(),
  status: z.string().nullable(),
  hasSubject: z.boolean(),
  hasBodyText: z.boolean(),
  subjectPreview: z.string().max(120).nullable(),
  bodyPreview: z.string().max(280).nullable(),
  tone: z.string().nullable(),
  language: z.string().nullable(),
  createdAt: z.string().datetime().nullable(),
});

const MailQueueGmailExportSchema = z.object({
  exportStatus: MailQueueGmailExportStatusSchema,
  canExport: z.boolean(),
  exportedAt: z.string().datetime().nullable(),
});

const MailQueueCompanyContextSchema = z.object({
  companyName: z.string().nullable(),
  sector: z.string().nullable(),
  language: z.string().nullable(),
});

export const MailQueueItemSchema = z.object({
  classificationId: z.string().uuid(),
  classifiedAt: z.string().datetime(),
  classification: z.object({
    category: z.string(),
    action: MailQueueClassificationActionSchema,
    confidence: z.string(),
    reasonCode: z.string(),
  }),
  lead: z.object({
    leadId: z.string().uuid().nullable(),
    leadCreatedAt: z.string().datetime().nullable(),
    leadStatus: z.string().nullable(),
  }),
  score: MailQueueScoreSchema,
  contact: MailQueueContactSchema,
  draft: MailQueueDraftSchema,
  gmailExport: MailQueueGmailExportSchema,
  companyContext: MailQueueCompanyContextSchema,
  derived: z.object({
    pipelineState: MailQueuePipelineStateSchema,
    attentionFlags: z.array(z.string()),
    nextBestAction: MailQueueNextBestActionSchema,
  }),
});

export const MailQueueSummarySchema = z.object({
  totalClassified: z.number().int().min(0),
  totalIgnored: z.number().int().min(0),
  totalLeadsCreated: z.number().int().min(0),
  totalScored: z.number().int().min(0),
  totalWithDraft: z.number().int().min(0),
  totalExportRequested: z.number().int().min(0),
  totalExported: z.number().int().min(0),
  totalAttentionRequired: z.number().int().min(0),
});

export const MailQueueAppliedFiltersSchema = z.object({
  limit: z.number().int().min(1).max(50),
  offset: z.number().int().min(0),
  since: z.string().datetime(),
  includeIgnored: z.boolean(),
  category: z.array(z.string()),
  action: z.array(MailQueueClassificationActionSchema),
  scoreBand: z.array(MailQueueScoreBandSchema),
  contactStatus: z.array(MailQueueContactStatusSchema),
  hasDraft: z.boolean().nullable(),
  exportStatus: z.array(MailQueueGmailExportStatusSchema),
  pipelineState: z.array(MailQueuePipelineStateSchema),
  attentionRequired: z.boolean().nullable(),
});

export const MailQueueDataSchema = z.object({
  generatedAt: z.string().datetime(),
  filters: z.object({
    applied: MailQueueAppliedFiltersSchema,
  }),
  pagination: z.object({
    limit: z.number().int().min(1).max(50),
    offset: z.number().int().min(0),
    total: z.number().int().min(0),
  }),
  summary: MailQueueSummarySchema,
  items: z.array(MailQueueItemSchema),
});

export const MailQueueResponseSchema = z.object({
  success: z.literal(true),
  data: MailQueueDataSchema,
});

export const MailQueueDetailResponseSchema = z.object({
  success: z.literal(true),
  data: MailQueueItemSchema,
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

function splitCsv(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      typeof item === "string"
        ? item
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
        : [item],
    );
  }

  return value;
}

export const MailQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  since: z.string().datetime().optional(),
  includeIgnored: z.preprocess(booleanFromQuery, z.boolean().default(false)),
  category: z.preprocess(splitCsv, z.array(z.string()).optional()),
  action: z.preprocess(splitCsv, z.array(MailQueueClassificationActionSchema).optional()),
  scoreBand: z.preprocess(splitCsv, z.array(MailQueueScoreBandSchema).optional()),
  contactStatus: z.preprocess(splitCsv, z.array(MailQueueContactStatusSchema).optional()),
  hasDraft: z.preprocess(booleanFromQuery, z.boolean().optional()),
  exportStatus: z.preprocess(splitCsv, z.array(MailQueueGmailExportStatusSchema).optional()),
  pipelineState: z.preprocess(splitCsv, z.array(MailQueuePipelineStateSchema).optional()),
  attentionRequired: z.preprocess(booleanFromQuery, z.boolean().optional()),
});

export type MailQueueClassificationAction = z.infer<typeof MailQueueClassificationActionSchema>;
export type MailQueueScoreBand = z.infer<typeof MailQueueScoreBandSchema>;
export type MailQueueContactStatus = z.infer<typeof MailQueueContactStatusSchema>;
export type MailQueueGmailExportStatus = z.infer<typeof MailQueueGmailExportStatusSchema>;
export type MailQueuePipelineState = z.infer<typeof MailQueuePipelineStateSchema>;
export type MailQueueNextBestAction = z.infer<typeof MailQueueNextBestActionSchema>;
export type MailQueueItem = z.infer<typeof MailQueueItemSchema>;
export type MailQueueData = z.infer<typeof MailQueueDataSchema>;
export type MailQueueResponse = z.infer<typeof MailQueueResponseSchema>;
export type MailQueueDetailResponse = z.infer<typeof MailQueueDetailResponseSchema>;
export type MailQueueQuery = z.infer<typeof MailQueueQuerySchema>;
