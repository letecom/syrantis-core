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

export type LeadScoreQualification = z.infer<typeof LeadScoreQualificationSchema>;
export type LeadScoreOutput = z.infer<typeof LeadScoreOutputSchema>;
