import { z } from "zod";

export const LeadScoringJobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const LeadScoreStatusSchema = z.enum([
  "not_requested",
  "pending",
  "running",
  "completed",
  "failed",
  "failed_with_previous_score",
  "rescoring_pending_with_previous_score",
  "completed_but_score_missing",
]);

export const LeadScoreStatusJobSchema = z.object({
  id: z.string().uuid(),
  status: LeadScoringJobStatusSchema,
  attempts: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  failedAt: z.string().datetime().nullable(),
  diagnosticTraceId: z.string().uuid().nullable(),
});

export const LeadScoreStatusLatestScoreSchema = z.object({
  id: z.string().uuid(),
  score: z.number().int().min(0).max(100).nullable(),
  scoreBand: z.string().nullable(),
  intent: z.string().nullable(),
  urgency: z.string().nullable(),
  confidence: z.number().int().min(0).max(100).nullable(),
  recommendedAction: z.string().nullable(),
  diagnosticTraceId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export const LeadScoreStatusDtoSchema = z.object({
  scoreStatus: LeadScoreStatusSchema,
  latestJob: LeadScoreStatusJobSchema.nullable(),
  latestScore: LeadScoreStatusLatestScoreSchema.nullable(),
  counts: z.object({
    totalScoringJobs: z.number().int().min(0),
    totalScores: z.number().int().min(0),
  }),
  checkedAt: z.string().datetime(),
  processingNote: z.string(),
});

export const LeadScoreStatusSuccessSchema = z.object({
  success: z.literal(true),
  data: LeadScoreStatusDtoSchema,
});

export type LeadScoringJobStatus = z.infer<typeof LeadScoringJobStatusSchema>;
export type LeadScoreStatus = z.infer<typeof LeadScoreStatusSchema>;
export type LeadScoreStatusJob = z.infer<typeof LeadScoreStatusJobSchema>;
export type LeadScoreStatusLatestScore = z.infer<typeof LeadScoreStatusLatestScoreSchema>;
export type LeadScoreStatusDto = z.infer<typeof LeadScoreStatusDtoSchema>;
export type LeadScoreStatusSuccess = z.infer<typeof LeadScoreStatusSuccessSchema>;
