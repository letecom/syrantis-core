import { z } from "zod";

export const IntakeClassificationSchema = z.enum(["leadable", "ignored", "unknown"]);
export const IntakeClassificationActionSchema = z.enum(["create_lead", "ignore", "review"]);
export const IntakeClassificationConfidenceSchema = z.enum(["high", "medium", "low"]);

export const IntakeClassificationResultSchema = z.object({
  category: z.string().trim().min(1).max(80),
  action: IntakeClassificationActionSchema,
  confidence: IntakeClassificationConfidenceSchema,
  reasonCode: z.string().trim().min(1).max(120),
});

export const IntakeSuggestedLabelsSchema = z.array(z.string().trim().min(1).max(80)).max(5);

export type IntakeClassification = z.infer<typeof IntakeClassificationSchema>;
export type IntakeClassificationAction = z.infer<typeof IntakeClassificationActionSchema>;
export type IntakeClassificationConfidence = z.infer<typeof IntakeClassificationConfidenceSchema>;
export type IntakeClassificationResult = z.infer<typeof IntakeClassificationResultSchema>;
