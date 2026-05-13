import { and, count, eq } from "drizzle-orm";

import { approvals, contacts, drafts, emailSends, leads } from "@syrantis/db";

import { withWorkspaceDb } from "../lib/db.js";

export type DraftGmailExportStatusRow = {
  draft: {
    id: string;
    leadId: string | null;
    status: string;
    subject: string | null;
    textBody: string | null;
    metadataJson: Record<string, unknown>;
  };
  lead: {
    id: string;
    contactId: string | null;
  } | null;
  contact: {
    email: string | null;
  } | null;
  emailSendsCount: number;
  approvalsCount: number;
};

export type FindDraftGmailExportStatusRowInput = {
  workspaceId: string;
  draftId: string;
};

export async function findDraftGmailExportStatusRow(
  input: FindDraftGmailExportStatusRowInput,
): Promise<DraftGmailExportStatusRow | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [draft] = await tx
      .select({
        id: drafts.id,
        leadId: drafts.leadId,
        status: drafts.status,
        subject: drafts.subject,
        textBody: drafts.textBody,
        metadataJson: drafts.metadataJson,
      })
      .from(drafts)
      .where(and(eq(drafts.workspaceId, input.workspaceId), eq(drafts.id, input.draftId)))
      .limit(1);

    if (!draft) {
      return null;
    }

    const [lead] = draft.leadId
      ? await tx
          .select({
            id: leads.id,
            contactId: leads.contactId,
          })
          .from(leads)
          .where(and(eq(leads.workspaceId, input.workspaceId), eq(leads.id, draft.leadId)))
          .limit(1)
      : [];

    const [contact] = lead?.contactId
      ? await tx
          .select({
            email: contacts.email,
          })
          .from(contacts)
          .where(and(eq(contacts.workspaceId, input.workspaceId), eq(contacts.id, lead.contactId)))
          .limit(1)
      : [];

    const [emailSendsCountRow] = await tx
      .select({ value: count() })
      .from(emailSends)
      .where(
        and(eq(emailSends.workspaceId, input.workspaceId), eq(emailSends.draftId, input.draftId)),
      )
      .limit(1);

    const [approvalsCountRow] = await tx
      .select({ value: count() })
      .from(approvals)
      .where(
        and(eq(approvals.workspaceId, input.workspaceId), eq(approvals.draftId, input.draftId)),
      )
      .limit(1);

    return {
      draft,
      lead: lead ?? null,
      contact: contact ?? null,
      emailSendsCount: Number(emailSendsCountRow?.value ?? 0),
      approvalsCount: Number(approvalsCountRow?.value ?? 0),
    };
  });
}
