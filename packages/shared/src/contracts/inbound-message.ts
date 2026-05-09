import { z } from "zod";

const OptionalNullableTrimmedStringSchema = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

export const InboundMessageIntakeRequestSchema = z
  .object({
    fromEmail: z.string().trim().email().max(255),
    bodyText: z.string().trim().min(1).max(10000),
    source: z.string().trim().min(1).max(100).default("api"),
    externalId: OptionalNullableTrimmedStringSchema(255),
    contactName: OptionalNullableTrimmedStringSchema(200),
    subject: OptionalNullableTrimmedStringSchema(500),
    receivedAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export const InboundMessageIntakeResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    diagnosticTraceId: z.string().uuid(),
    lead: z.object({
      id: z.string().uuid(),
      source: z.literal("public_inbound_message"),
      hasBody: z.boolean(),
      subjectPresent: z.boolean(),
      contactNamePresent: z.boolean(),
      createdAt: z.string(),
    }),
    scoringJob: z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "completed", "failed"]),
      jobType: z.literal("score_lead"),
      enqueuedAt: z.string(),
    }),
    idempotency: z.object({
      isReplay: z.boolean(),
      externalId: z.string().nullable(),
    }),
    createdAt: z.string(),
    processingNote: z.string(),
  }),
});

export type InboundMessageIntakeRequest = z.infer<typeof InboundMessageIntakeRequestSchema>;
export type InboundMessageIntakeResponse = z.infer<typeof InboundMessageIntakeResponseSchema>;
