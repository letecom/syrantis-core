import { and, desc, eq, ne, type SQL } from "drizzle-orm";

import { contacts, leads, organizations } from "@syrantis/db";
import type { CreateLeadInput, LeadListQuery, UpdateLeadInput } from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

export type LeadRow = typeof leads.$inferSelect;

export type LeadMutationResult =
  | { result: "ok"; lead: LeadRow }
  | { result: "not_found" }
  | { result: "conflict" };

export type LeadListResult =
  | { result: "ok"; leads: LeadRow[] }
  | { result: "not_found" };

export type ListLeadsInput = {
  workspaceId: string;
  organizationId?: LeadListQuery["organizationId"];
  contactId?: LeadListQuery["contactId"];
  source?: LeadListQuery["source"];
  status?: LeadListQuery["status"];
  limit?: number;
  offset?: number;
};

export type FindLeadByIdInput = {
  workspaceId: string;
  id: string;
};

export type CreateLeadRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  data: CreateLeadInput;
};

export type UpdateLeadRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  id: string;
  data: UpdateLeadInput;
};

function resolveLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 50, 1), 100);
}

function resolveOffset(offset: number | undefined): number {
  return Math.max(offset ?? 0, 0);
}

function leadFilters(input: {
  workspaceId: string;
  id?: string | undefined;
  organizationId?: string | undefined;
  contactId?: string | undefined;
  source?: string | undefined;
  status?: string | undefined;
}): SQL[] {
  const filters = [eq(leads.workspaceId, input.workspaceId)];

  if (input.id) {
    filters.push(eq(leads.id, input.id));
  }

  if (input.organizationId) {
    filters.push(eq(leads.organizationId, input.organizationId));
  }

  if (input.contactId) {
    filters.push(eq(leads.contactId, input.contactId));
  }

  if (input.source) {
    filters.push(eq(leads.source, input.source));
  }

  if (input.status) {
    filters.push(eq(leads.status, input.status));
  }

  return filters;
}

async function contactExists(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; contactId: string }
): Promise<boolean> {
  const [contact] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, input.contactId), eq(contacts.workspaceId, input.workspaceId)))
    .limit(1);

  return Boolean(contact);
}

async function organizationExists(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; organizationId: string }
): Promise<boolean> {
  const [organization] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, input.organizationId),
        eq(organizations.workspaceId, input.workspaceId),
        ne(organizations.status, "archived")
      )
    )
    .limit(1);

  return Boolean(organization);
}

async function relatedEntitiesExist(
  tx: WorkspaceDbTransaction,
  input: {
    workspaceId: string;
    organizationId?: string | null | undefined;
    contactId?: string | null | undefined;
  }
): Promise<boolean> {
  if (input.organizationId) {
    const exists = await organizationExists(tx, {
      workspaceId: input.workspaceId,
      organizationId: input.organizationId
    });

    if (!exists) {
      return false;
    }
  }

  if (input.contactId) {
    const exists = await contactExists(tx, {
      workspaceId: input.workspaceId,
      contactId: input.contactId
    });

    if (!exists) {
      return false;
    }
  }

  return true;
}

export async function listLeads(input: ListLeadsInput): Promise<LeadListResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const exists = await relatedEntitiesExist(tx, {
      workspaceId: input.workspaceId,
      organizationId: input.organizationId,
      contactId: input.contactId
    });

    if (!exists) {
      return { result: "not_found" };
    }

    const rows = await tx
      .select()
      .from(leads)
      .where(and(...leadFilters(input)))
      .orderBy(desc(leads.createdAt))
      .limit(resolveLimit(input.limit))
      .offset(resolveOffset(input.offset));

    return { result: "ok", leads: rows };
  });
}

export async function findLeadById(input: FindLeadByIdInput): Promise<LeadRow | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [lead] = await tx
      .select()
      .from(leads)
      .where(and(...leadFilters(input)))
      .limit(1);

    return lead ?? null;
  });
}

export async function createLead(input: CreateLeadRepositoryInput): Promise<LeadMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const exists = await relatedEntitiesExist(tx, {
      workspaceId: input.workspaceId,
      organizationId: input.data.organizationId,
      contactId: input.data.contactId
    });

    if (!exists) {
      return { result: "not_found" };
    }

    const values: typeof leads.$inferInsert = {
      workspaceId: input.workspaceId,
      ...(input.data.organizationId !== undefined ? { organizationId: input.data.organizationId } : {}),
      ...(input.data.contactId !== undefined ? { contactId: input.data.contactId } : {}),
      ...(input.data.source !== undefined ? { source: input.data.source } : {}),
      ...(input.data.status !== undefined ? { status: input.data.status } : {}),
      ...(input.data.rawContent !== undefined ? { rawContent: input.data.rawContent } : {}),
      ...(input.data.receivedAt !== undefined
        ? { receivedAt: input.data.receivedAt === null ? null : new Date(input.data.receivedAt) }
        : {}),
      ...(input.data.metadata !== undefined ? { normalizedJson: input.data.metadata } : {})
    };

    const [lead] = await tx.insert(leads).values(values).returning();

    if (!lead) {
      throw new Error("Failed to create lead.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "lead.created",
      entityType: "lead",
      entityId: lead.id,
      metadataJson: {
        status: lead.status,
        source: lead.source,
        organizationId: lead.organizationId,
        contactId: lead.contactId
      }
    });

    return { result: "ok", lead };
  });
}

export async function updateLead(input: UpdateLeadRepositoryInput): Promise<LeadMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const exists = await relatedEntitiesExist(tx, {
      workspaceId: input.workspaceId,
      organizationId: input.data.organizationId,
      contactId: input.data.contactId
    });

    if (!exists) {
      return { result: "not_found" };
    }

    const values: Partial<typeof leads.$inferInsert> = {
      ...(input.data.organizationId !== undefined ? { organizationId: input.data.organizationId } : {}),
      ...(input.data.contactId !== undefined ? { contactId: input.data.contactId } : {}),
      ...(input.data.source !== undefined ? { source: input.data.source } : {}),
      ...(input.data.status !== undefined ? { status: input.data.status } : {}),
      ...(input.data.rawContent !== undefined ? { rawContent: input.data.rawContent } : {}),
      ...(input.data.receivedAt !== undefined
        ? { receivedAt: input.data.receivedAt === null ? null : new Date(input.data.receivedAt) }
        : {}),
      ...(input.data.metadata !== undefined ? { normalizedJson: input.data.metadata } : {})
    };

    const [lead] = await tx
      .update(leads)
      .set(values)
      .where(and(...leadFilters({ workspaceId: input.workspaceId, id: input.id })))
      .returning();

    if (!lead) {
      return { result: "not_found" };
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "lead.updated",
      entityType: "lead",
      entityId: lead.id,
      metadataJson: {
        status: lead.status,
        source: lead.source,
        organizationId: lead.organizationId,
        contactId: lead.contactId
      }
    });

    return { result: "ok", lead };
  });
}
