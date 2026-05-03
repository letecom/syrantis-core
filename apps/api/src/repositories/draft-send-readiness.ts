import { and, desc, eq, ne } from "drizzle-orm";

import { approvals, contacts, drafts, emailSends } from "@syrantis/db";
import type { EmailSendStatus } from "@syrantis/shared";

import { withWorkspaceDb } from "../lib/db.js";

export type DraftSendReadinessRecord = {
  draft: {
    id: string;
    status: string;
    channel: string;
    contactId: string | null;
    subject: string | null;
    textBody: string | null;
    htmlBody: string | null;
  };
  contact: { id: string; email: string | null; optOut: boolean } | null;
  hasApprovedApproval: boolean;
  latestEmailSendStatus: EmailSendStatus | null;
};

export type FindDraftSendReadinessRecordInput = {
  workspaceId: string;
  draftId: string;
};

export async function findDraftSendReadinessRecord(
  input: FindDraftSendReadinessRecordInput,
): Promise<DraftSendReadinessRecord | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [draft] = await tx
      .select({
        id: drafts.id,
        status: drafts.status,
        channel: drafts.channel,
        contactId: drafts.contactId,
        subject: drafts.subject,
        textBody: drafts.textBody,
        htmlBody: drafts.htmlBody,
      })
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

    let contact: DraftSendReadinessRecord["contact"] = null;

    if (draft.contactId) {
      const [contactRow] = await tx
        .select({ id: contacts.id, email: contacts.email, optOut: contacts.optOut })
        .from(contacts)
        .where(and(eq(contacts.workspaceId, input.workspaceId), eq(contacts.id, draft.contactId)))
        .limit(1);

      contact = contactRow ?? null;
    }

    const [approvedApproval] = await tx
      .select({ id: approvals.id })
      .from(approvals)
      .where(
        and(
          eq(approvals.workspaceId, input.workspaceId),
          eq(approvals.draftId, input.draftId),
          eq(approvals.status, "approved"),
        ),
      )
      .orderBy(desc(approvals.updatedAt))
      .limit(1);

    const [latestEmailSend] = await tx
      .select({ status: emailSends.status })
      .from(emailSends)
      .where(and(eq(emailSends.workspaceId, input.workspaceId), eq(emailSends.draftId, input.draftId)))
      .orderBy(desc(emailSends.createdAt))
      .limit(1);

    return {
      draft,
      contact,
      hasApprovedApproval: Boolean(approvedApproval),
      latestEmailSendStatus: (latestEmailSend?.status as EmailSendStatus | undefined) ?? null,
    };
  });
}
