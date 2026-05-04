import { and, eq, sql } from "drizzle-orm";

import { emailSends } from "@syrantis/db";

import {
  withProviderMessageLookupDb,
  withWorkspaceDb,
  type WorkspaceDbTransaction,
} from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

export type ResendDeliveryEventType = "email.delivered" | "email.bounced" | "email.complained";

type ProviderMessageLookupRow = {
  id: string;
  workspaceId: string;
  deliveryStatus: "delivered" | "bounced" | "complained" | null;
  deliveredAt: Date | null;
  bouncedAt: Date | null;
  complainedAt: Date | null;
  deliveryErrorCode: string | null;
};

export type ApplyResendDeliveryEventResult =
  | { result: "unmatched" }
  | { result: "unchanged" }
  | { result: "updated" };

async function findEmailSendByProviderMessageId(
  providerMessageId: string,
): Promise<ProviderMessageLookupRow | null> {
  return withProviderMessageLookupDb(providerMessageId, async (tx) => {
    const [emailSend] = await tx
      .select({
        id: emailSends.id,
        workspaceId: emailSends.workspaceId,
        deliveryStatus: emailSends.deliveryStatus,
        deliveredAt: emailSends.deliveredAt,
        bouncedAt: emailSends.bouncedAt,
        complainedAt: emailSends.complainedAt,
        deliveryErrorCode: emailSends.deliveryErrorCode,
      })
      .from(emailSends)
      .where(eq(emailSends.providerMessageId, providerMessageId))
      .limit(1);

    return emailSend
      ? {
          ...emailSend,
          deliveryStatus: emailSend.deliveryStatus as ProviderMessageLookupRow["deliveryStatus"],
        }
      : null;
  });
}

function isDuplicate(row: ProviderMessageLookupRow, eventType: ResendDeliveryEventType): boolean {
  if (eventType === "email.delivered") {
    return row.deliveryStatus === "delivered" && row.deliveredAt !== null;
  }

  if (eventType === "email.bounced") {
    return row.deliveryStatus === "bounced" && row.bouncedAt !== null;
  }

  return row.deliveryStatus === "complained" && row.complainedAt !== null;
}

function deliveryUpdateForEvent(eventType: ResendDeliveryEventType, occurredAt: Date) {
  if (eventType === "email.delivered") {
    return {
      deliveryStatus: "delivered",
      deliveredAt: sql`coalesce(${emailSends.deliveredAt}, ${occurredAt})`,
      deliveryErrorCode: null,
    };
  }

  if (eventType === "email.bounced") {
    return {
      deliveryStatus: "bounced",
      bouncedAt: sql`coalesce(${emailSends.bouncedAt}, ${occurredAt})`,
      deliveryErrorCode: "RESEND_BOUNCED",
    };
  }

  return {
    deliveryStatus: "complained",
    complainedAt: sql`coalesce(${emailSends.complainedAt}, ${occurredAt})`,
    deliveryErrorCode: "RESEND_COMPLAINED",
  };
}

async function writeDeliveryUpdatedLog(
  tx: WorkspaceDbTransaction,
  input: {
    workspaceId: string;
    emailSendId: string;
    eventType: ResendDeliveryEventType;
    deliveryStatus: "delivered" | "bounced" | "complained";
  },
) {
  await createActivityLog(tx, {
    workspaceId: input.workspaceId,
    actorUserId: null,
    action: "email_send.delivery_updated",
    entityType: "email_send",
    entityId: input.emailSendId,
    metadataJson: {
      emailSendId: input.emailSendId,
      eventType: input.eventType,
      deliveryStatus: input.deliveryStatus,
    },
  });
}

export async function applyResendDeliveryEvent(input: {
  providerMessageId: string;
  eventType: ResendDeliveryEventType;
  occurredAt?: Date | undefined;
}): Promise<ApplyResendDeliveryEventResult> {
  const emailSend = await findEmailSendByProviderMessageId(input.providerMessageId);

  if (!emailSend) {
    return { result: "unmatched" };
  }

  if (isDuplicate(emailSend, input.eventType)) {
    return { result: "unchanged" };
  }

  const occurredAt = input.occurredAt ?? new Date();
  const deliveryStatus = input.eventType.replace("email.", "") as "delivered" | "bounced" | "complained";

  return withWorkspaceDb(emailSend.workspaceId, async (tx) => {
    const [updatedEmailSend] = await tx
      .update(emailSends)
      .set(deliveryUpdateForEvent(input.eventType, occurredAt))
      .where(and(eq(emailSends.id, emailSend.id), eq(emailSends.workspaceId, emailSend.workspaceId)))
      .returning({ id: emailSends.id });

    if (!updatedEmailSend) {
      return { result: "unmatched" };
    }

    await writeDeliveryUpdatedLog(tx, {
      workspaceId: emailSend.workspaceId,
      emailSendId: emailSend.id,
      eventType: input.eventType,
      deliveryStatus,
    });

    return { result: "updated" };
  });
}
