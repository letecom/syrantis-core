import { and, desc, eq, type SQL } from "drizzle-orm";

import { organizations } from "@syrantis/db";
import type {
  CreateOrganizationInput,
  OrganizationListQuery,
  UpdateOrganizationInput
} from "@syrantis/shared";

import { withWorkspaceDb } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

export type OrganizationRow = typeof organizations.$inferSelect;

export type OrganizationMutationResult =
  | { result: "ok"; organization: OrganizationRow }
  | { result: "not_found" }
  | { result: "conflict" };

export type ListOrganizationsInput = {
  workspaceId: string;
  status?: OrganizationListQuery["status"];
  limit?: number;
  offset?: number;
};

export type FindOrganizationByIdInput = {
  workspaceId: string;
  id: string;
};

export type CreateOrganizationRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  data: CreateOrganizationInput;
};

export type UpdateOrganizationRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  id: string;
  data: UpdateOrganizationInput;
};

export type ArchiveOrganizationRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  id: string;
};

function resolveLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 50, 1), 100);
}

function resolveOffset(offset: number | undefined): number {
  return Math.max(offset ?? 0, 0);
}

function organizationFilters(input: {
  workspaceId: string;
  id?: string | undefined;
  status?: string | undefined;
}): SQL[] {
  const filters = [eq(organizations.workspaceId, input.workspaceId)];

  if (input.id) {
    filters.push(eq(organizations.id, input.id));
  }

  if (input.status) {
    filters.push(eq(organizations.status, input.status));
  }

  return filters;
}

export async function listOrganizations(input: ListOrganizationsInput): Promise<OrganizationRow[]> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    return tx
      .select()
      .from(organizations)
      .where(and(...organizationFilters(input)))
      .orderBy(desc(organizations.createdAt))
      .limit(resolveLimit(input.limit))
      .offset(resolveOffset(input.offset));
  });
}

export async function findOrganizationById(input: FindOrganizationByIdInput): Promise<OrganizationRow | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [organization] = await tx
      .select()
      .from(organizations)
      .where(and(...organizationFilters(input)))
      .limit(1);

    return organization ?? null;
  });
}

export async function createOrganization(
  input: CreateOrganizationRepositoryInput
): Promise<OrganizationMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const values: typeof organizations.$inferInsert = {
      workspaceId: input.workspaceId,
      name: input.data.name,
      ...(input.data.sector !== undefined ? { sector: input.data.sector } : {}),
      ...(input.data.websiteUrl !== undefined ? { websiteUrl: input.data.websiteUrl } : {}),
      ...(input.data.phone !== undefined ? { phone: input.data.phone } : {}),
      ...(input.data.email !== undefined ? { email: input.data.email } : {}),
      ...(input.data.status !== undefined ? { status: input.data.status } : {}),
      ...(input.data.metadata !== undefined ? { configJson: input.data.metadata } : {})
    };

    const [organization] = await tx.insert(organizations).values(values).returning();

    if (!organization) {
      throw new Error("Failed to create organization.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "organization.created",
      entityType: "organization",
      entityId: organization.id,
      metadataJson: {
        status: organization.status
      }
    });

    return { result: "ok", organization };
  });
}

export async function updateOrganization(
  input: UpdateOrganizationRepositoryInput
): Promise<OrganizationMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const values: Partial<typeof organizations.$inferInsert> = {
      ...(input.data.name !== undefined ? { name: input.data.name } : {}),
      ...(input.data.sector !== undefined ? { sector: input.data.sector } : {}),
      ...(input.data.websiteUrl !== undefined ? { websiteUrl: input.data.websiteUrl } : {}),
      ...(input.data.phone !== undefined ? { phone: input.data.phone } : {}),
      ...(input.data.email !== undefined ? { email: input.data.email } : {}),
      ...(input.data.status !== undefined ? { status: input.data.status } : {}),
      ...(input.data.metadata !== undefined ? { configJson: input.data.metadata } : {})
    };

    const [organization] = await tx
      .update(organizations)
      .set(values)
      .where(and(...organizationFilters({ workspaceId: input.workspaceId, id: input.id })))
      .returning();

    if (!organization) {
      return { result: "not_found" };
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "organization.updated",
      entityType: "organization",
      entityId: organization.id,
      metadataJson: {
        status: organization.status
      }
    });

    return { result: "ok", organization };
  });
}

export async function archiveOrganization(
  input: ArchiveOrganizationRepositoryInput
): Promise<OrganizationMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [organization] = await tx
      .update(organizations)
      .set({ status: "archived" })
      .where(and(...organizationFilters({ workspaceId: input.workspaceId, id: input.id })))
      .returning();

    if (!organization) {
      return { result: "not_found" };
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "organization.archived",
      entityType: "organization",
      entityId: organization.id,
      metadataJson: {
        status: organization.status
      }
    });

    return { result: "ok", organization };
  });
}
