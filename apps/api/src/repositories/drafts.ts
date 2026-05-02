import { and, desc, eq, ne, type SQL } from "drizzle-orm";

import { approvals, contacts, drafts, leads } from "@syrantis/db";
import type {
  CreateDraftInput,
  DraftListQuery,
  RequestDraftApprovalInput,
  UpdateDraftInput,
} from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

export type DraftRow = typeof drafts.$inferSelect;
export type DraftApprovalRow = typeof approvals.$inferSelect;

export type DraftMutationResult =
  | { result: "ok"; draft: DraftRow }
  | { result: "not_found" }
  | { result: "invalid_relation" }
  | { result: "conflict" };

export type DraftApprovalRequestResult =
  | { result: "ok"; draft: DraftRow; approval: DraftApprovalRow }
  | { result: "not_found" }
  | { result: "conflict" };

export type ListDraftsRepositoryInput = {
  workspaceId: string;
  limit?: DraftListQuery["limit"];
  offset?: DraftListQuery["offset"];
};

export type FindDraftByIdRepositoryInput = {
  workspaceId: string;
  id: string;
};

export type CreateDraftRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  data: CreateDraftInput;
};

export type UpdateDraftRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  id: string;
  data: UpdateDraftInput;
};

export type ArchiveDraftRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  id: string;
};

export type RequestDraftApprovalRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  id: string;
  data: RequestDraftApprovalInput;
};

function resolveLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 50, 1), 100);
}

function resolveOffset(offset: number | undefined): number {
  return Math.max(offset ?? 0, 0);
}

function visibleDraftFilters(input: { workspaceId: string; id?: string | undefined }): SQL[] {
  const filters = [eq(drafts.workspaceId, input.workspaceId), ne(drafts.status, "archived")];

  if (input.id) {
    filters.push(eq(drafts.id, input.id));
  }

  return filters;
}

async function validateDraftRelationships(
  tx: WorkspaceDbTransaction,
  input: {
    workspaceId: string;
    leadId: string;
    contactId?: string | undefined;
  },
): Promise<Exclude<DraftMutationResult, { result: "ok" }> | { result: "ok" }> {
  const [lead] = await tx
    .select({ id: leads.id, contactId: leads.contactId })
    .from(leads)
    .where(and(eq(leads.id, input.leadId), eq(leads.workspaceId, input.workspaceId)))
    .limit(1);

  if (!lead) {
    return { result: "not_found" };
  }

  if (!input.contactId) {
    return { result: "ok" };
  }

  const [contact] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, input.contactId), eq(contacts.workspaceId, input.workspaceId)))
    .limit(1);

  if (!contact) {
    return { result: "not_found" };
  }

  if (lead.contactId && lead.contactId !== input.contactId) {
    return { result: "invalid_relation" };
  }

  return { result: "ok" };
}

export async function listDrafts(input: ListDraftsRepositoryInput): Promise<DraftRow[]> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    return tx
      .select()
      .from(drafts)
      .where(and(...visibleDraftFilters(input)))
      .orderBy(desc(drafts.createdAt))
      .limit(resolveLimit(input.limit))
      .offset(resolveOffset(input.offset));
  });
}

export async function findDraftById(input: FindDraftByIdRepositoryInput): Promise<DraftRow | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [draft] = await tx
      .select()
      .from(drafts)
      .where(and(...visibleDraftFilters(input)))
      .limit(1);

    return draft ?? null;
  });
}

export async function createDraft(input: CreateDraftRepositoryInput): Promise<DraftMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const relationshipValidation = await validateDraftRelationships(tx, {
      workspaceId: input.workspaceId,
      leadId: input.data.leadId,
      contactId: input.data.contactId,
    });

    if (relationshipValidation.result !== "ok") {
      return relationshipValidation;
    }

    const values: typeof drafts.$inferInsert = {
      workspaceId: input.workspaceId,
      leadId: input.data.leadId,
      status: "draft",
      channel: input.data.channel ?? "email",
      ...(input.data.contactId !== undefined ? { contactId: input.data.contactId } : {}),
      ...(input.data.subject !== undefined ? { subject: input.data.subject } : {}),
      ...(input.data.textBody !== undefined ? { textBody: input.data.textBody } : {}),
      ...(input.data.htmlBody !== undefined ? { htmlBody: input.data.htmlBody } : {}),
      ...(input.data.metadata !== undefined ? { metadataJson: input.data.metadata } : {}),
    };

    const [draft] = await tx.insert(drafts).values(values).returning();

    if (!draft) {
      throw new Error("Failed to create draft.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "draft.created",
      entityType: "draft",
      entityId: draft.id,
      metadataJson: {
        status: draft.status,
        channel: draft.channel,
        leadId: draft.leadId,
        contactId: draft.contactId,
      },
    });

    return { result: "ok", draft };
  });
}

export async function updateDraft(input: UpdateDraftRepositoryInput): Promise<DraftMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const values: Partial<typeof drafts.$inferInsert> = {
      ...(input.data.subject !== undefined ? { subject: input.data.subject } : {}),
      ...(input.data.textBody !== undefined ? { textBody: input.data.textBody } : {}),
      ...(input.data.htmlBody !== undefined ? { htmlBody: input.data.htmlBody } : {}),
      ...(input.data.metadata !== undefined ? { metadataJson: input.data.metadata } : {}),
    };

    const [draft] = await tx
      .update(drafts)
      .set(values)
      .where(and(...visibleDraftFilters({ workspaceId: input.workspaceId, id: input.id })))
      .returning();

    if (!draft) {
      return { result: "not_found" };
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "draft.updated",
      entityType: "draft",
      entityId: draft.id,
      metadataJson: {
        status: draft.status,
        channel: draft.channel,
        leadId: draft.leadId,
      },
    });

    return { result: "ok", draft };
  });
}

export async function archiveDraft(
  input: ArchiveDraftRepositoryInput,
): Promise<DraftMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [draft] = await tx
      .update(drafts)
      .set({ status: "archived" })
      .where(and(...visibleDraftFilters({ workspaceId: input.workspaceId, id: input.id })))
      .returning();

    if (!draft) {
      return { result: "not_found" };
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "draft.archived",
      entityType: "draft",
      entityId: draft.id,
      metadataJson: {
        status: draft.status,
        channel: draft.channel,
        leadId: draft.leadId,
      },
    });

    return { result: "ok", draft };
  });
}

export async function requestDraftApproval(
  input: RequestDraftApprovalRepositoryInput,
): Promise<DraftApprovalRequestResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [existingDraft] = await tx
      .select()
      .from(drafts)
      .where(and(...visibleDraftFilters({ workspaceId: input.workspaceId, id: input.id })))
      .limit(1);

    if (!existingDraft) {
      return { result: "not_found" };
    }

    if (existingDraft.status !== "draft") {
      return { result: "conflict" };
    }

    const [pendingApproval] = await tx
      .select({ id: approvals.id })
      .from(approvals)
      .where(
        and(
          eq(approvals.workspaceId, input.workspaceId),
          eq(approvals.draftId, input.id),
          eq(approvals.status, "pending"),
        ),
      )
      .limit(1);

    if (pendingApproval) {
      return { result: "conflict" };
    }

    const [draft] = await tx
      .update(drafts)
      .set({ status: "pending_approval" })
      .where(
        and(
          eq(drafts.workspaceId, input.workspaceId),
          eq(drafts.id, input.id),
          eq(drafts.status, "draft"),
        ),
      )
      .returning();

    if (!draft) {
      return { result: "conflict" };
    }

    const [approval] = await tx
      .insert(approvals)
      .values({
        workspaceId: input.workspaceId,
        draftId: draft.id,
        taskId: draft.taskId,
        entityType: "draft",
        entityId: draft.id,
        approvalType: "manual",
        status: "pending",
        requestedBy: input.actorUserId,
        metadataJson: input.data.note ? { note: input.data.note } : {},
      })
      .returning();

    if (!approval) {
      throw new Error("Failed to create draft approval.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "draft.approval_requested",
      entityType: "draft",
      entityId: draft.id,
      metadataJson: {
        status: draft.status,
        approvalId: approval.id,
      },
    });

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "approval.created",
      entityType: "approval",
      entityId: approval.id,
      metadataJson: {
        draftId: draft.id,
        status: approval.status,
      },
    });

    return { result: "ok", draft, approval };
  });
}
