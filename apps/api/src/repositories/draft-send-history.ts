import { and, asc, eq, ne, sql } from "drizzle-orm";

import { drafts, emailSends } from "@syrantis/db";
import type { EmailSendStatus } from "@syrantis/shared";

import { withWorkspaceDb } from "../lib/db.js";

export type DraftSendHistoryRow = {
  status: EmailSendStatus;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  failedAt: Date | null;
  lastErrorCode: string | null;
  deliveryStatus: "delivered" | "bounced" | "complained" | null;
  deliveredAt: Date | null;
  bouncedAt: Date | null;
  complainedAt: Date | null;
  deliveryErrorCode: string | null;
};

export type DraftSendHistoryRecord = {
  draft: {
    id: string;
  };
  attempts: DraftSendHistoryRow[];
  totalItems: number;
};

export type FindDraftSendHistoryRecordInput = {
  workspaceId: string;
  draftId: string;
  limit: number;
  offset: number;
};

export async function findDraftSendHistoryRecord(
  input: FindDraftSendHistoryRecordInput,
): Promise<DraftSendHistoryRecord | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
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

    if (!draft) {
      return null;
    }

    const [countRow] = await tx
      .select({ totalItems: sql<number>`count(*)` })
      .from(emailSends)
      .where(and(eq(emailSends.workspaceId, input.workspaceId), eq(emailSends.draftId, input.draftId)))
      .limit(1);

    const attempts = await tx
      .select({
        status: emailSends.status,
        createdAt: emailSends.createdAt,
        updatedAt: emailSends.updatedAt,
        sentAt: emailSends.sentAt,
        failedAt: emailSends.failedAt,
        lastErrorCode: emailSends.lastErrorCode,
        deliveryStatus: emailSends.deliveryStatus,
        deliveredAt: emailSends.deliveredAt,
        bouncedAt: emailSends.bouncedAt,
        complainedAt: emailSends.complainedAt,
        deliveryErrorCode: emailSends.deliveryErrorCode,
      })
      .from(emailSends)
      .where(and(eq(emailSends.workspaceId, input.workspaceId), eq(emailSends.draftId, input.draftId)))
      .orderBy(asc(emailSends.createdAt), asc(emailSends.id))
      .limit(input.limit)
      .offset(input.offset);

    return {
      draft,
      attempts: attempts.map((attempt) => ({
        ...attempt,
        status: attempt.status as EmailSendStatus,
        deliveryStatus: attempt.deliveryStatus as DraftSendHistoryRow["deliveryStatus"],
      })),
      totalItems: Number(countRow?.totalItems ?? 0),
    };
  });
}
