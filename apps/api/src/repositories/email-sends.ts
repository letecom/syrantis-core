import { randomUUID } from "node:crypto";

import { and, desc, eq, ne, type SQL } from "drizzle-orm";

import { approvals, contacts, drafts, emailSends, leads } from "@syrantis/db";
import type { EmailSendListQuery, RequestEmailSendInput } from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

const internalSenderEmail = "no-reply@syrantis.local";
const internalProvider = "internal";

export type EmailSendRow = typeof emailSends.$inferSelect;

export type EmailSendRequestResult =
  | { result: "ok"; emailSend: EmailSendRow }
  | { result: "not_found" }
  | { result: "conflict" }
  | { result: "recipient_missing" };

export type ListEmailSendsRepositoryInput = {
  workspaceId: string;
  limit?: EmailSendListQuery["limit"];
  offset?: EmailSendListQuery["offset"];
};

export type FindEmailSendByIdRepositoryInput = {
  workspaceId: string;
  id: string;
};

export type RequestEmailSendFromDraftRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  draftId: string;
  data: RequestEmailSendInput;
};

function resolveLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 50, 1), 100);
}

function resolveOffset(offset: number | undefined): number {
  return Math.max(offset ?? 0, 0);
}

function emailSendFilters(input: { workspaceId: string; id?: string | undefined }): SQL[] {
  const filters = [eq(emailSends.workspaceId, input.workspaceId)];

  if (input.id) {
    filters.push(eq(emailSends.id, input.id));
  }

  return filters;
}

function visibleDraftFilters(input: { workspaceId: string; id: string }): SQL[] {
  return [
    eq(drafts.workspaceId, input.workspaceId),
    eq(drafts.id, input.id),
    ne(drafts.status, "archived"),
  ];
}

async function resolveRecipient(
  tx: WorkspaceDbTransaction,
  input: {
    workspaceId: string;
    draft: typeof drafts.$inferSelect;
  },
): Promise<
  | { result: "ok"; contactId: string | null; recipientEmail: string }
  | { result: "not_found" }
  | { result: "recipient_missing" }
> {
  let contactId = input.draft.contactId;

  if (!contactId && input.draft.leadId) {
    const [lead] = await tx
      .select({ id: leads.id, contactId: leads.contactId })
      .from(leads)
      .where(and(eq(leads.id, input.draft.leadId), eq(leads.workspaceId, input.workspaceId)))
      .limit(1);

    if (!lead) {
      return { result: "not_found" };
    }

    contactId = lead.contactId;
  }

  if (!contactId) {
    return { result: "recipient_missing" };
  }

  const [contact] = await tx
    .select({ id: contacts.id, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, input.workspaceId)))
    .limit(1);

  if (!contact) {
    return { result: "not_found" };
  }

  if (!contact.email) {
    return { result: "recipient_missing" };
  }

  return { result: "ok", contactId: contact.id, recipientEmail: contact.email };
}

async function findApprovedApproval(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; draftId: string },
) {
  const [approval] = await tx
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

  return approval ?? null;
}

export async function listEmailSends(
  input: ListEmailSendsRepositoryInput,
): Promise<EmailSendRow[]> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    return tx
      .select()
      .from(emailSends)
      .where(and(...emailSendFilters(input)))
      .orderBy(desc(emailSends.createdAt))
      .limit(resolveLimit(input.limit))
      .offset(resolveOffset(input.offset));
  });
}

export async function findEmailSendById(
  input: FindEmailSendByIdRepositoryInput,
): Promise<EmailSendRow | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [emailSend] = await tx
      .select()
      .from(emailSends)
      .where(and(...emailSendFilters(input)))
      .limit(1);

    return emailSend ?? null;
  });
}

export async function requestEmailSendFromDraft(
  input: RequestEmailSendFromDraftRepositoryInput,
): Promise<EmailSendRequestResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [draft] = await tx
      .select()
      .from(drafts)
      .where(and(...visibleDraftFilters({ workspaceId: input.workspaceId, id: input.draftId })))
      .limit(1);

    if (!draft) {
      return { result: "not_found" };
    }

    if (draft.status !== "approved") {
      return { result: "conflict" };
    }

    const approval = await findApprovedApproval(tx, {
      workspaceId: input.workspaceId,
      draftId: draft.id,
    });

    if (!approval) {
      return { result: "conflict" };
    }

    const recipient = await resolveRecipient(tx, {
      workspaceId: input.workspaceId,
      draft,
    });

    if (recipient.result !== "ok") {
      return recipient;
    }

    const [emailSend] = await tx
      .insert(emailSends)
      .values({
        workspaceId: input.workspaceId,
        approvalId: approval.id,
        draftId: draft.id,
        leadId: draft.leadId,
        contactId: recipient.contactId,
        fromEmail: internalSenderEmail,
        toEmail: recipient.recipientEmail,
        subject: draft.subject ?? "",
        textBody: draft.textBody,
        htmlBody: draft.htmlBody,
        provider: internalProvider,
        idempotencyKey: `request_send:${draft.id}:${randomUUID()}`,
        attemptCount: 0,
        status: "pending",
        metadataJson: {
          source: "draft.request_send",
          requestedBy: input.actorUserId,
          ...(input.data.message ? { message: input.data.message } : {}),
        },
      })
      .returning();

    if (!emailSend) {
      throw new Error("Failed to create email send.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "email_send.requested",
      entityType: "draft",
      entityId: draft.id,
      metadataJson: {
        draftId: draft.id,
        leadId: draft.leadId,
        contactId: recipient.contactId,
        status: emailSend.status,
      },
    });

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "email_send.created",
      entityType: "email_send",
      entityId: emailSend.id,
      metadataJson: {
        draftId: draft.id,
        leadId: draft.leadId,
        contactId: recipient.contactId,
        status: emailSend.status,
      },
    });

    return { result: "ok", emailSend };
  });
}
