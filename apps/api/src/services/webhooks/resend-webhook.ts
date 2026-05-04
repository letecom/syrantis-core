import { z } from "zod";

import {
  applyResendDeliveryEvent,
  type ResendDeliveryEventType,
} from "../../repositories/resend-webhook.js";

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
  | { result: "updated" }
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

  return applyResendDeliveryEvent({
    providerMessageId,
    eventType: parsed.data.type as ResendDeliveryEventType,
  });
}
