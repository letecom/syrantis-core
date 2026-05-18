import { z } from "zod";

import {
  IntakeClassificationResultSchema,
  IntakeSuggestedLabelsSchema,
} from "./intake-classification.js";

const OptionalNullableTrimmedStringSchema = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

export const InboundMessageIntakeRequestSchema = z
  .object({
    fromEmail: z.string().trim().email().max(255),
    toEmail: z.string().trim().email().max(255).nullable().optional(),
    toDisplay: OptionalNullableTrimmedStringSchema(200),
    bodyText: z.string().trim().min(1).max(10000).optional(),
    bodySnippet: OptionalNullableTrimmedStringSchema(10000),
    source: z.string().trim().min(1).max(100).default("api"),
    externalId: OptionalNullableTrimmedStringSchema(255),
    messageId: OptionalNullableTrimmedStringSchema(255),
    threadId: OptionalNullableTrimmedStringSchema(255),
    contactName: OptionalNullableTrimmedStringSchema(200),
    subject: OptionalNullableTrimmedStringSchema(500),
    receivedAt: z.string().datetime({ offset: true }).nullable().optional(),
    isBulk: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.bodyText && !value.bodySnippet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "bodyText or bodySnippet is required.",
        path: ["bodyText"],
      });
    }
  })
  .transform((value) => ({
    ...value,
    bodyText: value.bodyText ?? value.bodySnippet ?? "",
  }));

export const InboundMessageIntakeResponseSchema = z.object({
  success: z.literal(true),
  data: z.discriminatedUnion("result", [
    z.object({
      result: z.literal("created"),
      intakeAction: z.literal("created_lead"),
      leadId: z.string().uuid(),
      scoringJobId: z.string().uuid(),
      diagnosticTraceId: z.string().uuid(),
      classification: IntakeClassificationResultSchema,
    }),
    z.object({
      result: z.literal("idempotent_replay"),
      intakeAction: z.literal("created_lead"),
      leadId: z.string().uuid().nullable(),
      scoringJobId: z.string().uuid().nullable(),
      diagnosticTraceId: z.string().uuid(),
      classification: IntakeClassificationResultSchema,
    }),
    z.object({
      result: z.literal("ignored"),
      intakeAction: z.literal("ignored"),
      diagnosticTraceId: z.string().uuid(),
      classification: IntakeClassificationResultSchema,
      suggestedLabels: IntakeSuggestedLabelsSchema.optional(),
    }),
    z.object({
      result: z.literal("idempotent_ignored"),
      intakeAction: z.literal("ignored"),
      diagnosticTraceId: z.string().uuid(),
      classification: IntakeClassificationResultSchema,
      suggestedLabels: IntakeSuggestedLabelsSchema.optional(),
    }),
  ]),
});

export type InboundMessageIntakeRequest = z.infer<typeof InboundMessageIntakeRequestSchema>;
export type InboundMessageIntakeResponse = z.infer<typeof InboundMessageIntakeResponseSchema>;
