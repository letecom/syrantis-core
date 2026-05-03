import { and, eq, ne } from "drizzle-orm";

import { approvals, contacts, drafts, leads } from "@syrantis/db";

import { withWorkspaceDb } from "../lib/db.js";

export type DraftApprovalReadinessRecord = {
  draft: {
    id: string;
    status: string;
    channel: string;
    leadId: string | null;
    contactId: string | null;
    subject: string | null;
    textBody: string | null;
    htmlBody: string | null;
    metadataJson: Record<string, unknown>;
  };
  lead: { id: string } | null;
  contact: { id: string; email: string | null } | null;
  hasPendingApproval: boolean;
};

export type FindDraftApprovalReadinessRecordInput = {
  workspaceId: string;
  draftId: string;
};

export async function findDraftApprovalReadinessRecord(
  input: FindDraftApprovalReadinessRecordInput,
): Promise<DraftApprovalReadinessRecord | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [draft] = await tx
      .select({
        id: drafts.id,
        status: drafts.status,
        channel: drafts.channel,
        leadId: drafts.leadId,
        contactId: drafts.contactId,
        subject: drafts.subject,
        textBody: drafts.textBody,
        htmlBody: drafts.htmlBody,
        metadataJson: drafts.metadataJson,
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

    let lead: DraftApprovalReadinessRecord["lead"] = null;

    if (draft.leadId) {
      const [leadRow] = await tx
        .select({ id: leads.id })
        .from(leads)
        .where(and(eq(leads.workspaceId, input.workspaceId), eq(leads.id, draft.leadId)))
        .limit(1);

      lead = leadRow ?? null;
    }

    let contact: DraftApprovalReadinessRecord["contact"] = null;

    if (draft.contactId) {
      const [contactRow] = await tx
        .select({ id: contacts.id, email: contacts.email })
        .from(contacts)
        .where(and(eq(contacts.workspaceId, input.workspaceId), eq(contacts.id, draft.contactId)))
        .limit(1);

      contact = contactRow ?? null;
    }

    const [pendingApproval] = await tx
      .select({ id: approvals.id })
      .from(approvals)
      .where(
        and(
          eq(approvals.workspaceId, input.workspaceId),
          eq(approvals.draftId, input.draftId),
          eq(approvals.status, "pending"),
        ),
      )
      .limit(1);

    return {
      draft,
      lead,
      contact,
      hasPendingApproval: Boolean(pendingApproval),
    };
  });
}
