import { z } from "zod";

export const GmailExportRecipientStatusSchema = z.enum([
  "present",
  "missing_lead",
  "missing_contact",
  "missing_email",
  "invalid_email",
]);

export const GmailExportStatusSchema = z.enum([
  "not_exported",
  "leased",
  "lease_expired",
  "exported",
]);

export const GmailExportSourceSchema = z.literal("apps_script");

export const GmailExportLeaseStatusSchema = z.enum(["none", "active", "expired"]);

export const GmailExportBlockingReasonSchema = z.enum([
  "draft_not_ready",
  "missing_subject",
  "missing_body",
  "missing_lead",
  "missing_contact",
  "missing_email",
  "invalid_email",
  "active_lease",
  "already_exported",
  "has_email_sends",
]);

export const GmailExportStatusOutputSchema = z.object({
  draftId: z.string().uuid(),
  leadId: z.string().uuid().nullable(),
  draftStatus: z.string(),
  hasSubject: z.boolean(),
  hasBodyText: z.boolean(),
  recipientStatus: GmailExportRecipientStatusSchema,
  exportStatus: GmailExportStatusSchema,
  exportSource: GmailExportSourceSchema.nullable(),
  exportedAt: z.string().datetime().nullable(),
  leaseStatus: GmailExportLeaseStatusSchema,
  leaseExpiresAt: z.string().datetime().nullable(),
  canExport: z.boolean(),
  blockingReasons: z.array(GmailExportBlockingReasonSchema),
  sideEffects: z.object({
    emailSendsCount: z.number().int().min(0),
    approvalsCount: z.number().int().min(0),
  }),
});

export const GmailExportStatusSuccessSchema = z.object({
  success: z.literal(true),
  data: GmailExportStatusOutputSchema,
});

export type GmailExportRecipientStatus = z.infer<typeof GmailExportRecipientStatusSchema>;
export type GmailExportStatus = z.infer<typeof GmailExportStatusSchema>;
export type GmailExportSource = z.infer<typeof GmailExportSourceSchema>;
export type GmailExportLeaseStatus = z.infer<typeof GmailExportLeaseStatusSchema>;
export type GmailExportBlockingReason = z.infer<typeof GmailExportBlockingReasonSchema>;
export type GmailExportStatusOutput = z.infer<typeof GmailExportStatusOutputSchema>;
export type GmailExportStatusSuccess = z.infer<typeof GmailExportStatusSuccessSchema>;
