import { z } from "zod";

export const GmailExportPendingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export const GmailExportPendingItemSchema = z.object({
  draftId: z.string().uuid(),
  leadId: z.string().uuid(),
  toEmail: z.string().email(),
  subject: z.string().min(1),
  bodyText: z.string().min(1),
  leaseToken: z.string().min(16),
  leaseExpiresAt: z.string().datetime(),
});

export const GmailExportPendingResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(GmailExportPendingItemSchema),
});

export const GmailExportConfirmBodySchema = z.object({
  leaseToken: z.string().min(16),
});

export const GmailExportConfirmResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    draftId: z.string().uuid(),
    status: z.literal("exported"),
    alreadyExported: z.boolean(),
    exportedAt: z.string().datetime(),
  }),
});

export const GmailExportConflictErrorCodeSchema = z.enum([
  "GMAIL_EXPORT_LEASE_MISSING",
  "GMAIL_EXPORT_LEASE_MISMATCH",
  "GMAIL_EXPORT_LEASE_EXPIRED",
]);

export type GmailExportPendingQuery = z.infer<typeof GmailExportPendingQuerySchema>;
export type GmailExportPendingItem = z.infer<typeof GmailExportPendingItemSchema>;
export type GmailExportPendingResponse = z.infer<typeof GmailExportPendingResponseSchema>;
export type GmailExportConfirmBody = z.infer<typeof GmailExportConfirmBodySchema>;
export type GmailExportConfirmResponse = z.infer<typeof GmailExportConfirmResponseSchema>;
export type GmailExportConflictErrorCode = z.infer<typeof GmailExportConflictErrorCodeSchema>;
