import { z } from "zod";

import {
  applyResendDeliveryEvent,
  type ResendDeliveryEventType,
} from "../../repositories/resend-webhook.js";
import { pushDeliveryProofToGoogleSheets } from "../pushback/google-sheets.js";

const acceptedEventTypes = new Set<ResendDeliveryEventType>([
  "email.delivered",
  "email.bounced",
  "email.complained",
]);

const ignoredEventTypes = new Set([
  "email.sent",
  "email.delivery_delayed",
  "email.opened",
  "email.clicked",
]);

const ResendWebhookPayloadSchema = z.object({
  type: z.string(),
  data: z.record(z.unknown()).optional(),
});

export type ResendWebhookServiceResult =
  | { result: "ignored" }
  | { result: "unmatched" }
  | { result: "unchanged" }
  | { result: "updated"; emailSendId?: string; workspaceId?: string }
  | { result: "invalid_payload" };

function hasClientWorkspaceId(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(value, "workspaceId")) {
    return true;
  }

  if (Object.prototype.hasOwnProperty.call(value, "workspace_id")) {
    return true;
  }

  return Object.values(value).some((child) => hasClientWorkspaceId(child));
}

function readProviderMessageId(payload: z.infer<typeof ResendWebhookPayloadSchema>): string | null {
  const data = payload.data ?? {};
  const value = data.email_id ?? data.emailId ?? data.id;

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function handleResendWebhookPayload(
  payload: unknown,
): Promise<ResendWebhookServiceResult> {
  const parsed = ResendWebhookPayloadSchema.safeParse(payload);

  if (!parsed.success || hasClientWorkspaceId(payload)) {
    return { result: "invalid_payload" };
  }

  if (ignoredEventTypes.has(parsed.data.type) || !acceptedEventTypes.has(parsed.data.type as ResendDeliveryEventType)) {
    return { result: "ignored" };
  }

  const providerMessageId = readProviderMessageId(parsed.data);

  if (!providerMessageId) {
    return { result: "invalid_payload" };
  }

  const applyResult = await applyResendDeliveryEvent({
    providerMessageId,
    eventType: parsed.data.type as ResendDeliveryEventType,
  });

  if (applyResult.result === "updated") {
    // Non-blocking push-back
    void pushDeliveryProofToGoogleSheets({
      workspaceId: applyResult.workspaceId,
      emailSendId: applyResult.emailSendId,
      eventType: parsed.data.type as ResendDeliveryEventType,
      occurredAt: new Date(),
    }).catch(() => {
      // Ignore errors to avoid failing the webhook
    });
  }

  return applyResult;
}
