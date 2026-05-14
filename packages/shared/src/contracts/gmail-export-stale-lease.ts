import { z } from "zod";

export const GmailExportStaleLeaseActionSchema = z.enum([
  "would_expire",
  "expired",
  "skipped_active",
  "skipped_exported",
  "skipped_cancelled",
  "skipped_invalid_metadata",
]);

export const GmailExportStaleLeaseExpireRequestSchema = z
  .object({
    dryRun: z.boolean().default(true),
    maxLimit: z.number().int().min(1).max(50).default(25),
    confirm: z.string().optional(),
  })
  .default({});

export const GmailExportStaleLeaseItemSchema = z.object({
  draftId: z.string().uuid(),
  action: GmailExportStaleLeaseActionSchema,
  previousLeaseExpiresAt: z.string().datetime().nullable(),
});

export const GmailExportStaleLeaseExpireDataSchema = z.object({
  dryRun: z.boolean(),
  processed: z.number().int().nonnegative(),
  expired: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  diagnosticTraceId: z.string().uuid(),
  items: z.array(GmailExportStaleLeaseItemSchema).max(50),
});

export const GmailExportStaleLeaseExpireResponseSchema = z.object({
  success: z.literal(true),
  data: GmailExportStaleLeaseExpireDataSchema,
});

export type GmailExportStaleLeaseAction = z.infer<typeof GmailExportStaleLeaseActionSchema>;
export type GmailExportStaleLeaseExpireRequest = z.infer<
  typeof GmailExportStaleLeaseExpireRequestSchema
>;
export type GmailExportStaleLeaseItem = z.infer<typeof GmailExportStaleLeaseItemSchema>;
export type GmailExportStaleLeaseExpireData = z.infer<typeof GmailExportStaleLeaseExpireDataSchema>;
export type GmailExportStaleLeaseExpireResponse = z.infer<
  typeof GmailExportStaleLeaseExpireResponseSchema
>;
