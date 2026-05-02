import { z } from "zod";

export const LeadScoreQualificationSchema = z.enum(["cold", "warm", "hot"]);

export const LeadScoreOutputSchema = z.object({
  score: z.number().int().min(0).max(100),
  qualification: LeadScoreQualificationSchema,
  summary: z.string().trim().min(1).max(280),
  rationale: z.string().trim().min(1).max(500),
  recommended_action: z.string().trim().min(1).max(240),
  confidence: z.number().int().min(0).max(100),
});

export const LeadScoreHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().datetime().optional(),
});

export const LeadScoreReadModelSchema = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid(),
  score: z.number().int().min(0).max(100),
  qualification: LeadScoreQualificationSchema,
  summary: z.string(),
  rationale: z.string(),
  recommendedAction: z.string(),
  confidence: z.number().int().min(0).max(100),
  model: z.string(),
  promptTemplateId: z.string(),
  scoredAt: z.string().datetime(),
});

export const LeadScoreLatestSuccessSchema = z.object({
  success: z.literal(true),
  data: LeadScoreReadModelSchema.nullable(),
});

export const LeadScoreHistorySuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(LeadScoreReadModelSchema),
  nextCursor: z.string().datetime().optional(),
});

export type LeadScoreQualification = z.infer<typeof LeadScoreQualificationSchema>;
export type LeadScoreOutput = z.infer<typeof LeadScoreOutputSchema>;
export type LeadScoreHistoryQuery = z.infer<typeof LeadScoreHistoryQuerySchema>;
export type LeadScoreReadModel = z.infer<typeof LeadScoreReadModelSchema>;
export type LeadScoreLatestSuccess = z.infer<typeof LeadScoreLatestSuccessSchema>;
export type LeadScoreHistorySuccess = z.infer<typeof LeadScoreHistorySuccessSchema>;
