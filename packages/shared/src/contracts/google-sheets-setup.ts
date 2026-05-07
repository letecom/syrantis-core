import { z } from "zod";

export const GoogleSheetsSetupTestResultSchema = z.enum(["succeeded", "failed", "skipped"]);

export const GoogleSheetsSetupLastTestSchema = z.object({
  result: GoogleSheetsSetupTestResultSchema,
  diagnosticTraceId: z.string().uuid(),
  errorCode: z
    .string()
    .regex(/^PUSHBACK_[A-Z0-9_]+$/)
    .nullable(),
  testedAt: z.string(),
});

export const GoogleSheetsSetupStatusSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
  credentialsConfigured: z.boolean(),
  spreadsheetConfigured: z.boolean(),
  spreadsheetIdMasked: z.string().nullable(),
  pushbackRangeConfigured: z.boolean(),
  verificationRangeConfigured: z.boolean(),
  pushbackRangeLabel: z.string().nullable(),
  verificationRangeLabel: z.string().nullable(),
  lastTest: GoogleSheetsSetupLastTestSchema.nullable(),
});

export const GoogleSheetsSetupStatusSuccessSchema = z.object({
  success: z.literal(true),
  data: GoogleSheetsSetupStatusSchema,
});

export const GoogleSheetsSetupTestResponseSchema = z.object({
  result: GoogleSheetsSetupTestResultSchema,
  diagnosticTraceId: z.string().uuid(),
  testedAt: z.string(),
  errorCode: z
    .string()
    .regex(/^PUSHBACK_[A-Z0-9_]+$/)
    .nullable(),
  errorSummary: z.string().nullable(),
  verification: z
    .object({
      rangeTested: z.string(),
      rowsAppended: z.number().int().min(0),
    })
    .nullable(),
});

export const GoogleSheetsSetupTestSuccessSchema = z.object({
  success: z.literal(true),
  data: GoogleSheetsSetupTestResponseSchema,
});

export type GoogleSheetsSetupTestResult = z.infer<typeof GoogleSheetsSetupTestResultSchema>;
export type GoogleSheetsSetupLastTest = z.infer<typeof GoogleSheetsSetupLastTestSchema>;
export type GoogleSheetsSetupStatus = z.infer<typeof GoogleSheetsSetupStatusSchema>;
export type GoogleSheetsSetupTestResponse = z.infer<typeof GoogleSheetsSetupTestResponseSchema>;
