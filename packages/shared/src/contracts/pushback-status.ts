import { z } from "zod";

import { EmailSendStatusSchema } from "./email-sends.js";

export const PushbackEventTypeSchema = z.enum([
  "crm_pushback.succeeded",
  "crm_pushback.failed",
  "crm_pushback.skipped",
]);

export const PushbackLatestSourceSchema = z.enum([
  "delivery_webhook",
  "manual_replay",
  "system",
  "unknown",
]);

export const PushbackStatusSchema = z.enum([
  "no_send",
  "send_not_terminal",
  "send_failed",
  "send_cancelled",
  "no_delivery_proof",
  "not_pushed",
  "skipped",
  "succeeded",
  "failed",
  "unknown",
]);

export const PushbackCanReplayReasonSchema = z.enum([
  "no_email_send",
  "send_not_terminal",
  "send_failed",
  "send_cancelled",
  "missing_delivery_proof",
]);

export const PushbackStatusResponseSchema = z.object({
  target: z.object({
    type: z.enum(["draft", "email_send"]),
    draftId: z.string().uuid().nullable(),
    emailSendId: z.string().uuid().nullable(),
    resolvedFromDraft: z.boolean(),
  }),
  send: z.object({
    exists: z.boolean(),
    status: EmailSendStatusSchema.nullable(),
    deliveryStatus: z.enum(["delivered", "bounced", "complained"]).nullable(),
    deliveryProofAvailable: z.boolean(),
    requestedAt: z.string().datetime().nullable(),
    sentAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime().nullable(),
  }),
  pushback: z.object({
    status: PushbackStatusSchema,
    latestEventType: PushbackEventTypeSchema.nullable(),
    latestSource: PushbackLatestSourceSchema.nullable(),
    latestAt: z.string().datetime().nullable(),
    canReplay: z.boolean(),
    canReplayReason: PushbackCanReplayReasonSchema.nullable(),
    replay: z.object({
      emailSendId: z.string().uuid().nullable(),
      endpoint: z.string().nullable(),
    }),
    diagnostic: z
      .object({
        diagnosticTraceId: z.string().uuid().nullable(),
        errorCode: z
          .string()
          .regex(/^PUSHBACK_[A-Z0-9_]+$/)
          .nullable(),
        errorSummary: z.string().nullable(),
        durationMs: z.number().int().min(0).nullable(),
        maskedSpreadsheetId: z.string().nullable(),
        range: z.string().nullable(),
      })
      .nullable(),
    counts: z.object({
      totalPushbackEvents: z.number().int().min(0),
      manualReplayEvents: z.number().int().min(0),
    }),
    recentHistory: z.array(
      z.object({
        eventType: PushbackEventTypeSchema,
        source: PushbackLatestSourceSchema,
        occurredAt: z.string().datetime(),
        diagnosticTraceId: z.string().uuid().nullable(),
        errorCode: z
          .string()
          .regex(/^PUSHBACK_[A-Z0-9_]+$/)
          .nullable(),
      }),
    ),
  }),
});

export const PushbackStatusSuccessSchema = z.object({
  success: z.literal(true),
  data: PushbackStatusResponseSchema,
});

export type PushbackEventType = z.infer<typeof PushbackEventTypeSchema>;
export type PushbackLatestSource = z.infer<typeof PushbackLatestSourceSchema>;
export type PushbackStatus = z.infer<typeof PushbackStatusSchema>;
export type PushbackCanReplayReason = z.infer<typeof PushbackCanReplayReasonSchema>;
export type PushbackStatusResponse = z.infer<typeof PushbackStatusResponseSchema>;
export type PushbackStatusSuccess = z.infer<typeof PushbackStatusSuccessSchema>;
