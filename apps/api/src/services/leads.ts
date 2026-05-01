import {
  LeadOutputSchema,
  type CreateLeadInput,
  type LeadListQuery,
  type LeadOutput,
  type UpdateLeadInput
} from "@syrantis/shared";

import type { LeadListResult, LeadMutationResult, LeadRow } from "../repositories/leads.js";
import { createLead, findLeadById, listLeads, updateLead } from "../repositories/leads.js";

export type LeadServiceListResult =
  | { result: "ok"; leads: LeadOutput[] }
  | { result: "not_found" };

export type LeadServiceMutationResult =
  | { result: "ok"; lead: LeadOutput }
  | { result: "not_found" }
  | { result: "conflict" };

export type LeadService = {
  listLeads(workspaceId: string, query: LeadListQuery): Promise<LeadServiceListResult>;
  getLead(workspaceId: string, id: string): Promise<LeadOutput | null>;
  createLead(workspaceId: string, actorUserId: string, input: CreateLeadInput): Promise<LeadServiceMutationResult>;
  updateLead(
    workspaceId: string,
    actorUserId: string,
    id: string,
    input: UpdateLeadInput
  ): Promise<LeadServiceMutationResult>;
};

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapLeadRow(row: LeadRow): LeadOutput {
  return LeadOutputSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    organizationId: row.organizationId,
    contactId: row.contactId,
    source: row.source,
    status: row.status,
    rawContent: row.rawContent,
    metadata: row.normalizedJson,
    score: row.score,
    scoreReason: row.scoreReason,
    receivedAt: toIsoDate(row.receivedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function mapListResult(result: LeadListResult): LeadServiceListResult {
  if (result.result !== "ok") {
    return result;
  }

  return {
    result: "ok",
    leads: result.leads.map(mapLeadRow)
  };
}

function mapMutationResult(result: LeadMutationResult): LeadServiceMutationResult {
  if (result.result !== "ok") {
    return result;
  }

  return {
    result: "ok",
    lead: mapLeadRow(result.lead)
  };
}

export function createProductionLeadService(): LeadService {
  return {
    async listLeads(workspaceId: string, query: LeadListQuery): Promise<LeadServiceListResult> {
      return mapListResult(
        await listLeads({
          workspaceId,
          ...(query.organizationId !== undefined ? { organizationId: query.organizationId } : {}),
          ...(query.contactId !== undefined ? { contactId: query.contactId } : {}),
          ...(query.source !== undefined ? { source: query.source } : {}),
          ...(query.status !== undefined ? { status: query.status } : {}),
          limit: query.limit,
          offset: query.offset
        })
      );
    },

    async getLead(workspaceId: string, id: string): Promise<LeadOutput | null> {
      const row = await findLeadById({ workspaceId, id });
      return row ? mapLeadRow(row) : null;
    },

    async createLead(
      workspaceId: string,
      actorUserId: string,
      input: CreateLeadInput
    ): Promise<LeadServiceMutationResult> {
      return mapMutationResult(
        await createLead({
          workspaceId,
          actorUserId,
          data: input
        })
      );
    },

    async updateLead(
      workspaceId: string,
      actorUserId: string,
      id: string,
      input: UpdateLeadInput
    ): Promise<LeadServiceMutationResult> {
      return mapMutationResult(
        await updateLead({
          workspaceId,
          actorUserId,
          id,
          data: input
        })
      );
    }
  };
}
