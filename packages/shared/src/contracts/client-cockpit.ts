import { z } from "zod";

export const ClientCockpitGmailExportStatusSchema = z.enum([
  "unknown",
  "idle",
  "requested",
  "leased",
  "exported_recently",
  "attention_required",
]);

export const ClientCockpitGmailIntakeStatusSchema = z.enum([
  "unknown",
  "activity_seen",
  "no_recent_activity",
]);

export const ClientCockpitGoogleSheetsStatusSchema = z.enum([
  "configured",
  "not_configured",
  "unknown",
]);

export const ClientCockpitQueueStatusSchema = z.enum([
  "clear",
  "busy",
  "attention_required",
  "unknown",
]);

export const ClientCockpitActionSchema = z.object({
  label: z.string(),
  href: z.string(),
  kind: z.enum(["primary", "secondary", "disabled"]),
  reason: z.string().nullable(),
});

export const ClientCockpitSummaryDataSchema = z.object({
  generatedAt: z.string().datetime(),
  window: z.object({
    since: z.string().datetime(),
    hours: z.literal(24),
  }),
  pipeline: z.object({
    leads24h: z.number().int().nonnegative(),
    scoredLeads24h: z.number().int().nonnegative(),
    draftsGenerated24h: z.number().int().nonnegative(),
    pendingDrafts: z.number().int().nonnegative(),
  }),
  gmailExport: z.object({
    status: ClientCockpitGmailExportStatusSchema,
    pendingRequestCount: z.number().int().nonnegative(),
    activeLeaseCount: z.number().int().nonnegative(),
    staleLeaseCount: z.number().int().nonnegative(),
    exported24h: z.number().int().nonnegative(),
    lastExportedAt: z.string().datetime().nullable(),
  }),
  gmailIntake: z.object({
    status: ClientCockpitGmailIntakeStatusSchema,
    lastIntakeAt: z.string().datetime().nullable(),
    leadsReceived24h: z.number().int().nonnegative(),
  }),
  googleSheets: z.object({
    status: ClientCockpitGoogleSheetsStatusSchema,
  }),
  system: z.object({
    queueStatus: ClientCockpitQueueStatusSchema,
    pendingReadyJobs: z.number().int().nonnegative(),
    runningJobs: z.number().int().nonnegative(),
    failedJobs24h: z.number().int().nonnegative(),
    oldestPendingJobMinutes: z.number().int().nonnegative().nullable(),
  }),
  actions: z.array(ClientCockpitActionSchema),
});

export const ClientCockpitSummaryResponseSchema = z.object({
  success: z.literal(true),
  data: ClientCockpitSummaryDataSchema,
});

export type ClientCockpitGmailExportStatus = z.infer<
  typeof ClientCockpitGmailExportStatusSchema
>;
export type ClientCockpitGmailIntakeStatus = z.infer<
  typeof ClientCockpitGmailIntakeStatusSchema
>;
export type ClientCockpitGoogleSheetsStatus = z.infer<
  typeof ClientCockpitGoogleSheetsStatusSchema
>;
export type ClientCockpitQueueStatus = z.infer<typeof ClientCockpitQueueStatusSchema>;
export type ClientCockpitAction = z.infer<typeof ClientCockpitActionSchema>;
export type ClientCockpitSummaryData = z.infer<typeof ClientCockpitSummaryDataSchema>;
export type ClientCockpitSummaryResponse = z.infer<
  typeof ClientCockpitSummaryResponseSchema
>;
