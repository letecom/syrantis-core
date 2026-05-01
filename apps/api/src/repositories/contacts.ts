import { and, desc, eq, type SQL } from "drizzle-orm";

import { contacts, organizations } from "@syrantis/db";
import type {
  ContactListQuery,
  CreateContactInput,
  UpdateContactInput
} from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

export type ContactRow = typeof contacts.$inferSelect;

export type ContactMutationResult =
  | { result: "ok"; contact: ContactRow }
  | { result: "not_found" };

export type ContactListResult =
  | { result: "ok"; contacts: ContactRow[] }
  | { result: "not_found" };

export type ListContactsInput = {
  workspaceId: string;
  organizationId?: ContactListQuery["organizationId"];
  limit?: number;
  offset?: number;
};

export type FindContactByIdInput = {
  workspaceId: string;
  id: string;
};

export type CreateContactRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  data: CreateContactInput;
};

export type UpdateContactRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  id: string;
  data: UpdateContactInput;
};

function resolveLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 50, 1), 100);
}

function resolveOffset(offset: number | undefined): number {
  return Math.max(offset ?? 0, 0);
}

function contactFilters(input: {
  workspaceId: string;
  id?: string | undefined;
  organizationId?: string | undefined;
}): SQL[] {
  const filters = [eq(contacts.workspaceId, input.workspaceId)];

  if (input.id) {
    filters.push(eq(contacts.id, input.id));
  }

  if (input.organizationId) {
    filters.push(eq(contacts.organizationId, input.organizationId));
  }

  return filters;
}

async function organizationExists(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; organizationId: string }
): Promise<boolean> {
  const [organization] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.id, input.organizationId), eq(organizations.workspaceId, input.workspaceId)))
    .limit(1);

  return Boolean(organization);
}

export async function listContacts(input: ListContactsInput): Promise<ContactListResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    if (input.organizationId) {
      const exists = await organizationExists(tx, {
        workspaceId: input.workspaceId,
        organizationId: input.organizationId
      });

      if (!exists) {
        return { result: "not_found" };
      }
    }

    const rows = await tx
      .select()
      .from(contacts)
      .where(and(...contactFilters(input)))
      .orderBy(desc(contacts.createdAt))
      .limit(resolveLimit(input.limit))
      .offset(resolveOffset(input.offset));

    return { result: "ok", contacts: rows };
  });
}

export async function findContactById(input: FindContactByIdInput): Promise<ContactRow | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [contact] = await tx
      .select()
      .from(contacts)
      .where(and(...contactFilters(input)))
      .limit(1);

    return contact ?? null;
  });
}

export async function createContact(input: CreateContactRepositoryInput): Promise<ContactMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    if (input.data.organizationId) {
      const exists = await organizationExists(tx, {
        workspaceId: input.workspaceId,
        organizationId: input.data.organizationId
      });

      if (!exists) {
        return { result: "not_found" };
      }
    }

    const values: typeof contacts.$inferInsert = {
      workspaceId: input.workspaceId,
      ...(input.data.organizationId !== undefined ? { organizationId: input.data.organizationId } : {}),
      ...(input.data.firstName !== undefined ? { firstName: input.data.firstName } : {}),
      ...(input.data.lastName !== undefined ? { lastName: input.data.lastName } : {}),
      ...(input.data.email !== undefined ? { email: input.data.email } : {}),
      ...(input.data.phone !== undefined ? { phone: input.data.phone } : {}),
      ...(input.data.roleTitle !== undefined ? { roleTitle: input.data.roleTitle } : {}),
      ...(input.data.optOut !== undefined ? { optOut: input.data.optOut } : {}),
      ...(input.data.metadata !== undefined ? { metadataJson: input.data.metadata } : {})
    };

    const [contact] = await tx.insert(contacts).values(values).returning();

    if (!contact) {
      throw new Error("Failed to create contact.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "contact.created",
      entityType: "contact",
      entityId: contact.id,
      metadataJson: {
        organizationId: contact.organizationId,
        optOut: contact.optOut
      }
    });

    return { result: "ok", contact };
  });
}

export async function updateContact(input: UpdateContactRepositoryInput): Promise<ContactMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    if (input.data.organizationId) {
      const exists = await organizationExists(tx, {
        workspaceId: input.workspaceId,
        organizationId: input.data.organizationId
      });

      if (!exists) {
        return { result: "not_found" };
      }
    }

    const values: Partial<typeof contacts.$inferInsert> = {
      ...(input.data.organizationId !== undefined ? { organizationId: input.data.organizationId } : {}),
      ...(input.data.firstName !== undefined ? { firstName: input.data.firstName } : {}),
      ...(input.data.lastName !== undefined ? { lastName: input.data.lastName } : {}),
      ...(input.data.email !== undefined ? { email: input.data.email } : {}),
      ...(input.data.phone !== undefined ? { phone: input.data.phone } : {}),
      ...(input.data.roleTitle !== undefined ? { roleTitle: input.data.roleTitle } : {}),
      ...(input.data.optOut !== undefined ? { optOut: input.data.optOut } : {}),
      ...(input.data.metadata !== undefined ? { metadataJson: input.data.metadata } : {})
    };

    const [contact] = await tx
      .update(contacts)
      .set(values)
      .where(and(...contactFilters({ workspaceId: input.workspaceId, id: input.id })))
      .returning();

    if (!contact) {
      return { result: "not_found" };
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "contact.updated",
      entityType: "contact",
      entityId: contact.id,
      metadataJson: {
        organizationId: contact.organizationId,
        optOut: contact.optOut
      }
    });

    return { result: "ok", contact };
  });
}
