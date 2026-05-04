import { and, desc, eq, ne } from "drizzle-orm";

import { drafts, emailSends } from "@syrantis/db";
import type { EmailSendStatus } from "@syrantis/shared";

import { withWorkspaceDb } from "../lib/db.js";

export type DraftSendStatusLatestSendRow = {
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

export type DraftSendStatusRecord = {
  draft: {
    id: string;
  };
  latestSend: DraftSendStatusLatestSendRow | null;
};

export type FindDraftSendStatusRecordInput = {
  workspaceId: string;
  draftId: string;
};

export async function findDraftSendStatusRecord(
  input: FindDraftSendStatusRecordInput,
): Promise<DraftSendStatusRecord | null> {
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

    const [latestSend] = await tx
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
      .orderBy(desc(emailSends.createdAt), desc(emailSends.id))
      .limit(1);

    return {
      draft,
      latestSend: latestSend
        ? {
            ...latestSend,
            status: latestSend.status as EmailSendStatus,
            deliveryStatus: latestSend.deliveryStatus as DraftSendStatusLatestSendRow["deliveryStatus"],
          }
        : null,
    };
  });
}
