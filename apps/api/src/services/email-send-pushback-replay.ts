import {
  buildPushbackSkippedMetadata,
  createDiagnosticTraceId,
  logPushbackDiagnosticActivity,
  type PushbackErrorCode,
} from "./pushback/diagnostics.js";
import {
  pushDeliveryProofToGoogleSheets,
  type GoogleSheetsPushbackResult,
} from "./pushback/google-sheets.js";
import {
  findEmailSendById,
  type EmailSendRow,
} from "../repositories/email-sends.js";

export type PushbackReplayResult =
  | { result: "succeeded"; diagnosticTraceId: string }
  | { result: "failed"; diagnosticTraceId: string; errorCode: PushbackErrorCode }
  | { result: "skipped"; diagnosticTraceId: string; errorCode: PushbackErrorCode };

export type EmailSendPushbackReplayService = {
  replayPushback(workspaceId: string, emailSendId: string): Promise<PushbackReplayResult | null>;
};

const manualReplaySource = "manual_replay" as const;

type DeliveryProofEventType = "email.delivered" | "email.bounced" | "email.complained";

function eventTypeForDeliveryStatus(status: string): DeliveryProofEventType | null {
  if (status === "delivered") {
    return "email.delivered";
  }

  if (status === "bounced") {
    return "email.bounced";
  }

  if (status === "complained") {
    return "email.complained";
  }

  return null;
}

function replaySummaryForDeliveryStatus(status: string): string {
  if (status === "delivered") {
    return "Replay manuel du statut livre";
  }

  if (status === "bounced") {
    return "Replay manuel du statut bounced";
  }

  return "Replay manuel du statut complained";
}

function occurredAtForReplay(emailSend: EmailSendRow): Date {
  if (emailSend.deliveryStatus === "delivered") {
    return emailSend.deliveredAt ?? emailSend.sentAt ?? emailSend.createdAt;
  }

  if (emailSend.deliveryStatus === "bounced") {
    return emailSend.bouncedAt ?? emailSend.sentAt ?? emailSend.createdAt;
  }

  if (emailSend.deliveryStatus === "complained") {
    return emailSend.complainedAt ?? emailSend.sentAt ?? emailSend.createdAt;
  }

  return emailSend.createdAt;
}

async function logReplaySkipped(input: {
  workspaceId: string;
  emailSend: EmailSendRow;
  errorCode: PushbackErrorCode;
  startedAtMs: number;
}): Promise<PushbackReplayResult> {
  const diagnosticTraceId = createDiagnosticTraceId();

  await logPushbackDiagnosticActivity({
    workspaceId: input.workspaceId,
    emailSendId: input.emailSend.id,
    action: "crm_pushback.skipped",
    metadataJson: buildPushbackSkippedMetadata({
      source: manualReplaySource,
      diagnosticTraceId,
      emailSendId: input.emailSend.id,
      draftId: input.emailSend.draftId,
      leadId: input.emailSend.leadId,
      deliveryStatus: input.emailSend.deliveryStatus,
      sendStatus: input.emailSend.status,
      errorCode: input.errorCode,
      durationMs: Math.max(0, Date.now() - input.startedAtMs),
    }),
  });

  return { result: "skipped", diagnosticTraceId, errorCode: input.errorCode };
}

function mapGoogleSheetsResult(result: GoogleSheetsPushbackResult): PushbackReplayResult {
  return result;
}

export function createProductionEmailSendPushbackReplayService(): EmailSendPushbackReplayService {
  return {
    async replayPushback(workspaceId: string, emailSendId: string): Promise<PushbackReplayResult | null> {
      const startedAtMs = Date.now();
      const emailSend = await findEmailSendById({ workspaceId, id: emailSendId });

      if (!emailSend) {
        return null;
      }

      if (emailSend.status !== "sent") {
        return logReplaySkipped({
          workspaceId,
          emailSend,
          errorCode: "PUSHBACK_EMAIL_SEND_NOT_SENT",
          startedAtMs,
        });
      }

      if (!emailSend.deliveryStatus) {
        return logReplaySkipped({
          workspaceId,
          emailSend,
          errorCode: "PUSHBACK_DELIVERY_STATUS_MISSING",
          startedAtMs,
        });
      }

      const eventType = eventTypeForDeliveryStatus(emailSend.deliveryStatus);
      if (!eventType) {
        return logReplaySkipped({
          workspaceId,
          emailSend,
          errorCode: "PUSHBACK_DELIVERY_STATUS_MISSING",
          startedAtMs,
        });
      }

      const result = await pushDeliveryProofToGoogleSheets({
        workspaceId,
        emailSendId,
        eventType,
        occurredAt: occurredAtForReplay(emailSend),
        source: manualReplaySource,
        draftId: emailSend.draftId,
        leadId: emailSend.leadId,
        deliveryStatus: emailSend.deliveryStatus,
        sendStatus: emailSend.status,
        safeSummaryOverride: replaySummaryForDeliveryStatus(emailSend.deliveryStatus),
      });

      return mapGoogleSheetsResult(result);
    },
  };
}
