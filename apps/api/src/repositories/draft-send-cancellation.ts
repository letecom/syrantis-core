import { and, desc, eq, ne, sql } from "drizzle-orm";

import { backgroundJobs, drafts, emailSends } from "@syrantis/db";
import type { EmailSendStatus } from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

type DraftSendCancellationReason =
  | "NO_SEND_TO_CANCEL"
  | "SEND_NOT_PENDING"
  | "SEND_JOB_NOT_PENDING";

class DraftSendCancellationConflict extends Error {
  constructor() {
    super("CANCEL_SEND_NOT_ALLOWED");
  }
}

export type DraftSendCancellationRow = {
  draftId: string;
  emailSendId: string;
  previousStatus: "pending" | "cancelled";
  currentStatus: "cancelled";
  cancelled: boolean;
  cancelledAt: Date | null;
};

export type DraftSendCancellationResult =
  | { result: "ok"; cancellation: DraftSendCancellationRow }
  | { result: "not_found" }
  | {
      result: "not_allowed";
      reason: DraftSendCancellationReason;
      currentStatus: EmailSendStatus | null;
    };

export type CancelLatestDraftSendInput = {
  workspaceId: string;
  actorUserId: string;
  draftId: string;
};

async function findVisibleDraft(tx: WorkspaceDbTransaction, input: CancelLatestDraftSendInput) {
  const [draft] = await tx
    .select({ id: drafts.id })
    .from(drafts)
    .where(
      and(
        eq(drafts.workspaceId, input.workspaceId),
        eq(drafts.id, input.draftId),
        ne(drafts.status, "archived"),
      ),
    )
    .limit(1);

  return draft ?? null;
}

async function findLatestSend(tx: WorkspaceDbTransaction, input: CancelLatestDraftSendInput) {
  const [latestSend] = await tx
    .select({
      id: emailSends.id,
      status: emailSends.status,
      updatedAt: emailSends.updatedAt,
    })
    .from(emailSends)
    .where(and(eq(emailSends.workspaceId, input.workspaceId), eq(emailSends.draftId, input.draftId)))
    .orderBy(desc(emailSends.createdAt), desc(emailSends.id))
    .limit(1);

  return latestSend
    ? {
        ...latestSend,
        status: latestSend.status as EmailSendStatus,
      }
    : null;
}

async function findLinkedSendEmailJob(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; emailSendId: string },
) {
  const [job] = await tx
    .select({
      id: backgroundJobs.id,
      status: backgroundJobs.status,
    })
    .from(backgroundJobs)
    .where(
      and(
        eq(backgroundJobs.workspaceId, input.workspaceId),
        eq(backgroundJobs.type, "send_email"),
        sql`${backgroundJobs.payloadJson}->>'emailSendId' = ${input.emailSendId}`,
      ),
    )
    .limit(1);

  return job ?? null;
}

async function cancelPendingSend(
  tx: WorkspaceDbTransaction,
  input: {
    workspaceId: string;
    actorUserId: string;
    draftId: string;
    emailSendId: string;
    jobId: string;
  },
): Promise<DraftSendCancellationRow> {
  const [emailSend] = await tx
    .update(emailSends)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(emailSends.id, input.emailSendId),
        eq(emailSends.workspaceId, input.workspaceId),
        eq(emailSends.status, "pending"),
      ),
    )
    .returning({ id: emailSends.id, updatedAt: emailSends.updatedAt });

  if (!emailSend) {
    throw new DraftSendCancellationConflict();
  }

  const [job] = await tx
    .update(backgroundJobs)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(backgroundJobs.id, input.jobId),
        eq(backgroundJobs.workspaceId, input.workspaceId),
        eq(backgroundJobs.status, "pending"),
      ),
    )
    .returning({ id: backgroundJobs.id });

  if (!job) {
    throw new DraftSendCancellationConflict();
  }

  await createActivityLog(tx, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "email_send.cancelled",
    entityType: "email_send",
    entityId: input.emailSendId,
    metadataJson: {
      draftId: input.draftId,
      emailSendId: input.emailSendId,
      jobId: input.jobId,
      previousStatus: "pending",
      currentStatus: "cancelled",
    },
  });

  return {
    draftId: input.draftId,
    emailSendId: input.emailSendId,
    previousStatus: "pending",
    currentStatus: "cancelled",
    cancelled: true,
    cancelledAt: emailSend.updatedAt,
  };
}

export async function cancelLatestDraftSend(
  input: CancelLatestDraftSendInput,
): Promise<DraftSendCancellationResult> {
  try {
    return await withWorkspaceDb(input.workspaceId, async (tx) => {
      const draft = await findVisibleDraft(tx, input);

      if (!draft) {
        return { result: "not_found" };
      }

      const latestSend = await findLatestSend(tx, input);

      if (!latestSend) {
        return {
          result: "not_allowed",
          reason: "NO_SEND_TO_CANCEL",
          currentStatus: null,
        };
      }

      if (latestSend.status === "cancelled") {
        return {
          result: "ok",
          cancellation: {
            draftId: draft.id,
            emailSendId: latestSend.id,
            previousStatus: "cancelled",
            currentStatus: "cancelled",
            cancelled: false,
            cancelledAt: latestSend.updatedAt,
          },
        };
      }

      if (latestSend.status !== "pending") {
        return {
          result: "not_allowed",
          reason: "SEND_NOT_PENDING",
          currentStatus: latestSend.status,
        };
      }

      const job = await findLinkedSendEmailJob(tx, {
        workspaceId: input.workspaceId,
        emailSendId: latestSend.id,
      });

      if (!job || job.status !== "pending") {
        return {
          result: "not_allowed",
          reason: "SEND_JOB_NOT_PENDING",
          currentStatus: latestSend.status,
        };
      }

      return {
        result: "ok",
        cancellation: await cancelPendingSend(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          draftId: draft.id,
          emailSendId: latestSend.id,
          jobId: job.id,
        }),
      };
    });
  } catch (error) {
    if (error instanceof DraftSendCancellationConflict) {
      return {
        result: "not_allowed",
        reason: "SEND_JOB_NOT_PENDING",
        currentStatus: "pending",
      };
    }

    throw error;
  }
}
