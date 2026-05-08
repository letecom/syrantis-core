import { z } from "zod";

const forbiddenAdminIntakeRequestKeys = new Set([
  "workspaceId",
  "workspace_id",
  "workspace-id",
  "htmlBody",
  "attachments",
  "rawMime",
  "messageId",
  "providerMessageId",
  "provider_message_id",
  "payload_json",
  "payloadJson",
  "rawPayload",
  "rawProvider",
  "rawGoogle",
  "prompt",
]);

function OptionalTrimmedStringSchema(max: number) {
  return z.string().trim().max(max).optional();
}

function rejectForbiddenKeys(value: Record<string, unknown>, ctx: z.RefinementCtx) {
  for (const key of forbiddenAdminIntakeRequestKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is not allowed.`,
      });
    }
  }
}

export const AdminIntakeTestEmailRequestSchema = z
  .object({
    fromEmail: z.string().trim().email().max(255),
    subject: OptionalTrimmedStringSchema(500),
    bodyText: OptionalTrimmedStringSchema(10000),
    contactName: OptionalTrimmedStringSchema(200),
    testLabel: OptionalTrimmedStringSchema(200),
  })
  .passthrough()
  .superRefine(rejectForbiddenKeys)
  .transform((value) => ({
    fromEmail: value.fromEmail,
    ...(value.subject !== undefined ? { subject: value.subject } : {}),
    ...(value.bodyText !== undefined ? { bodyText: value.bodyText } : {}),
    ...(value.contactName !== undefined ? { contactName: value.contactName } : {}),
    ...(value.testLabel !== undefined ? { testLabel: value.testLabel } : {}),
  }));

export const AdminIntakeTestEmailResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    diagnosticTraceId: z.string().uuid(),
    testLabel: z.string().nullable(),
    lead: z.object({
      id: z.string().uuid(),
      source: z.literal("inbound_email_test"),
      hasBody: z.boolean(),
      subjectPresent: z.boolean(),
      contactNamePresent: z.boolean(),
      createdAt: z.string(),
    }),
    scoringJob: z.object({
      id: z.string().uuid().nullable(),
      status: z.literal("pending"),
      jobType: z.literal("score_lead"),
      enqueuedAt: z.string(),
    }),
    workerBaseline: z.object({
      failedJobsBefore: z.number().int().min(0),
    }),
    createdAt: z.string(),
    processingNote: z.string(),
  }),
});

export type AdminIntakeTestEmailRequest = z.infer<typeof AdminIntakeTestEmailRequestSchema>;
export type AdminIntakeTestEmailResponse = z.infer<typeof AdminIntakeTestEmailResponseSchema>;
