import { and, desc, eq, inArray, ne } from "drizzle-orm";

import { activityLogs, drafts, emailSends } from "@syrantis/db";
import type { EmailSendStatus, PushbackEventType } from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";

const pushbackEventTypes: PushbackEventType[] = [
  "crm_pushback.succeeded",
  "crm_pushback.failed",
  "crm_pushback.skipped",
];

export type PushbackStatusEmailSendRow = {
  id: string;
  draftId: string;
  status: EmailSendStatus;
  deliveryStatus: "delivered" | "bounced" | "complained" | null;
  createdAt: Date;
  sentAt: Date | null;
  updatedAt: Date;
};

export type PushbackStatusActivityLogRow = {
  id: string;
  type: PushbackEventType;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
};

export type EmailSendPushbackStatusRecord = {
  emailSend: PushbackStatusEmailSendRow;
  pushbackLogs: PushbackStatusActivityLogRow[];
};

export type DraftPushbackStatusRecord = {
  draft: {
    id: string;
  };
  latestEmailSend: PushbackStatusEmailSendRow | null;
  pushbackLogs: PushbackStatusActivityLogRow[];
};

function mapEmailSend(row: {
  id: string;
  draftId: string;
  status: string;
  deliveryStatus: string | null;
  createdAt: Date;
  sentAt: Date | null;
  updatedAt: Date;
}): PushbackStatusEmailSendRow {
  return {
    ...row,
    status: row.status as EmailSendStatus,
    deliveryStatus: row.deliveryStatus as PushbackStatusEmailSendRow["deliveryStatus"],
  };
}

function mapPushbackLog(row: {
  id: string;
  type: string;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
}): PushbackStatusActivityLogRow {
  return {
    ...row,
    type: row.type as PushbackEventType,
  };
}

function selectEmailSendShape() {
  return {
    id: emailSends.id,
    draftId: emailSends.draftId,
    status: emailSends.status,
    deliveryStatus: emailSends.deliveryStatus,
    createdAt: emailSends.createdAt,
    sentAt: emailSends.sentAt,
    updatedAt: emailSends.updatedAt,
  };
}

async function findPushbackLogs(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; emailSendId: string },
): Promise<PushbackStatusActivityLogRow[]> {
  const logs = await tx
    .select({
      id: activityLogs.id,
      type: activityLogs.type,
      metadataJson: activityLogs.metadataJson,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.workspaceId, input.workspaceId),
        eq(activityLogs.entityType, "email_send"),
        eq(activityLogs.entityId, input.emailSendId),
        inArray(activityLogs.type, pushbackEventTypes),
      ),
    )
    .orderBy(desc(activityLogs.createdAt), desc(activityLogs.id));

  return logs.map(mapPushbackLog);
}

export async function findEmailSendPushbackStatusRecord(input: {
  workspaceId: string;
  emailSendId: string;
}): Promise<EmailSendPushbackStatusRecord | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [emailSend] = await tx
      .select(selectEmailSendShape())
      .from(emailSends)
      .where(
        and(eq(emailSends.workspaceId, input.workspaceId), eq(emailSends.id, input.emailSendId)),
      )
      .limit(1);

    if (!emailSend) {
      return null;
    }

    return {
      emailSend: mapEmailSend(emailSend),
      pushbackLogs: await findPushbackLogs(tx, input),
    };
  });
}

export async function findDraftPushbackStatusRecord(input: {
  workspaceId: string;
  draftId: string;
}): Promise<DraftPushbackStatusRecord | null> {
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

    const [latestEmailSend] = await tx
      .select(selectEmailSendShape())
      .from(emailSends)
      .where(
        and(eq(emailSends.workspaceId, input.workspaceId), eq(emailSends.draftId, input.draftId)),
      )
      .orderBy(desc(emailSends.createdAt), desc(emailSends.id))
      .limit(1);

    if (!latestEmailSend) {
      return {
        draft,
        latestEmailSend: null,
        pushbackLogs: [],
      };
    }

    const mappedEmailSend = mapEmailSend(latestEmailSend);

    return {
      draft,
      latestEmailSend: mappedEmailSend,
      pushbackLogs: await findPushbackLogs(tx, {
        workspaceId: input.workspaceId,
        emailSendId: mappedEmailSend.id,
      }),
    };
  });
}
