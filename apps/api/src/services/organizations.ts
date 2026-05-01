import {
  OrganizationOutputSchema,
  type CreateOrganizationInput,
  type OrganizationListQuery,
  type OrganizationOutput,
  type UpdateOrganizationInput
} from "@syrantis/shared";

import type { OrganizationMutationResult, OrganizationRow } from "../repositories/organizations.js";
import {
  archiveOrganization,
  createOrganization,
  findOrganizationById,
  listOrganizations,
  updateOrganization
} from "../repositories/organizations.js";

export type OrganizationServiceMutationResult =
  | { result: "ok"; organization: OrganizationOutput }
  | { result: "not_found" }
  | { result: "conflict" };

export type OrganizationService = {
  listOrganizations(workspaceId: string, query: OrganizationListQuery): Promise<OrganizationOutput[]>;
  getOrganization(workspaceId: string, id: string): Promise<OrganizationOutput | null>;
  createOrganization(
    workspaceId: string,
    actorUserId: string,
    input: CreateOrganizationInput
  ): Promise<OrganizationServiceMutationResult>;
  updateOrganization(
    workspaceId: string,
    actorUserId: string,
    id: string,
    input: UpdateOrganizationInput
  ): Promise<OrganizationServiceMutationResult>;
  archiveOrganization(workspaceId: string, actorUserId: string, id: string): Promise<OrganizationServiceMutationResult>;
};

function mapOrganizationRow(row: OrganizationRow): OrganizationOutput {
  return OrganizationOutputSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    sector: row.sector,
    websiteUrl: row.websiteUrl,
    phone: row.phone,
    email: row.email,
    status: row.status,
    metadata: row.configJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function mapMutationResult(result: OrganizationMutationResult): OrganizationServiceMutationResult {
  if (result.result !== "ok") {
    return result;
  }

  return {
    result: "ok",
    organization: mapOrganizationRow(result.organization)
  };
}

export function createProductionOrganizationService(): OrganizationService {
  return {
    async listOrganizations(workspaceId: string, query: OrganizationListQuery): Promise<OrganizationOutput[]> {
      const rows = await listOrganizations({
        workspaceId,
        ...(query.status !== undefined ? { status: query.status } : {}),
        limit: query.limit,
        offset: query.offset
      });

      return rows.map(mapOrganizationRow);
    },

    async getOrganization(workspaceId: string, id: string): Promise<OrganizationOutput | null> {
      const row = await findOrganizationById({ workspaceId, id });
      return row ? mapOrganizationRow(row) : null;
    },

    async createOrganization(
      workspaceId: string,
      actorUserId: string,
      input: CreateOrganizationInput
    ): Promise<OrganizationServiceMutationResult> {
      return mapMutationResult(
        await createOrganization({
          workspaceId,
          actorUserId,
          data: input
        })
      );
    },

    async updateOrganization(
      workspaceId: string,
      actorUserId: string,
      id: string,
      input: UpdateOrganizationInput
    ): Promise<OrganizationServiceMutationResult> {
      return mapMutationResult(
        await updateOrganization({
          workspaceId,
          actorUserId,
          id,
          data: input
        })
      );
    },

    async archiveOrganization(
      workspaceId: string,
      actorUserId: string,
      id: string
    ): Promise<OrganizationServiceMutationResult> {
      return mapMutationResult(
        await archiveOrganization({
          workspaceId,
          actorUserId,
          id
        })
      );
    }
  };
}
