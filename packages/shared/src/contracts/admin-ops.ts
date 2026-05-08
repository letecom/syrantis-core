import { z } from "zod";

export const adminOpsCheckIdSchema = z.enum([
  "api-health",
  "db-health",
  "google-sheets-status",
  "google-sheets-test",
  "worker-queue-summary",
]);

export const adminOpsResultSchema = z.enum(["succeeded", "failed", "skipped"]);

export const adminOpsErrorCodeSchema = z
  .string()
  .regex(/^(OPS|PUSHBACK)_[A-Z0-9_]+$/);

const isoStringSchema = z.string();

const googleSheetsLastTestSchema = z
  .object({
    result: adminOpsResultSchema,
    diagnosticTraceId: z.string().uuid(),
    testedAt: isoStringSchema,
  })
  .nullable();

const workerQueueSummarySchema = z.object({
  status: z.enum(["ok", "degraded", "error"]),
  pending: z.number().int().min(0).nullable(),
  running: z.number().int().min(0).nullable(),
  failed: z.number().int().min(0).nullable(),
  oldestPendingMinutes: z.number().int().min(0).nullable(),
});

export const adminOpsHealthResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    status: z.enum(["healthy", "degraded", "unhealthy"]),
    checkedAt: isoStringSchema,
    api: z.object({
      status: z.literal("ok"),
      uptimeSeconds: z.number().min(0),
    }),
    db: z.object({
      status: z.enum(["ok", "error"]),
      latencyMs: z.number().int().min(0).nullable(),
    }),
    googleSheets: z.object({
      status: z.enum(["ok", "disabled", "unconfigured", "error"]),
      configured: z.boolean(),
      lastTestResult: adminOpsResultSchema.nullable(),
      lastTestedAt: isoStringSchema.nullable(),
    }),
    workerQueue: workerQueueSummarySchema,
  }),
});

export const adminOpsRunCheckResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    checkId: adminOpsCheckIdSchema,
    result: adminOpsResultSchema,
    diagnosticTraceId: z.string().uuid(),
    runAt: isoStringSchema,
    durationMs: z.number().int().min(0),
    errorCode: adminOpsErrorCodeSchema.nullable(),
    errorSummary: z.string().nullable(),
    data: z.record(z.unknown()),
  }),
});

export const adminOpsRecentChecksResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    checks: z.array(
      z.object({
        checkId: adminOpsCheckIdSchema,
        result: adminOpsResultSchema,
        diagnosticTraceId: z.string().uuid(),
        runAt: isoStringSchema,
        durationMs: z.number().int().min(0),
        errorCode: adminOpsErrorCodeSchema.nullable(),
        errorSummary: z.string().nullable(),
      }),
    ),
    limit: z.number().int().min(1).max(50),
  }),
});

export const adminOpsGoogleSheetsStatusCheckDataSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
  credentialsConfigured: z.boolean(),
  spreadsheetConfigured: z.boolean(),
  spreadsheetIdMasked: z.string().nullable(),
  pushbackRangeConfigured: z.boolean(),
  verificationRangeConfigured: z.boolean(),
  lastTest: googleSheetsLastTestSchema,
});

export type AdminOpsCheckId = z.infer<typeof adminOpsCheckIdSchema>;
export type AdminOpsResult = z.infer<typeof adminOpsResultSchema>;
export type AdminOpsHealthResponse = z.infer<typeof adminOpsHealthResponseSchema>;
export type AdminOpsRunCheckResponse = z.infer<typeof adminOpsRunCheckResponseSchema>;
export type AdminOpsRecentChecksResponse = z.infer<typeof adminOpsRecentChecksResponseSchema>;
