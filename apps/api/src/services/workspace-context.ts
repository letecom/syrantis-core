import {
  WorkspaceContextInputSchema,
  WorkspaceContextProfileSchema,
  type WorkspaceContextInput,
  type WorkspaceContextProfile,
} from "@syrantis/shared";

import type { WorkspaceContextProfileRow } from "../repositories/workspace-context.js";
import {
  findWorkspaceContextProfile,
  upsertWorkspaceContextProfile,
} from "../repositories/workspace-context.js";

export type WorkspaceContextServicePutResult = {
  profile: WorkspaceContextProfile;
  created: boolean;
  changedFields: string[];
};

export type WorkspaceContextService = {
  getWorkspaceContext(workspaceId: string): Promise<WorkspaceContextProfile | null>;
  putWorkspaceContext(
    workspaceId: string,
    userId: string,
    input: WorkspaceContextInput,
  ): Promise<WorkspaceContextServicePutResult>;
};

function mapWorkspaceContextProfileRow(row: WorkspaceContextProfileRow): WorkspaceContextProfile {
  const contextJson = row.contextJson as Record<string, unknown>;
  const normalized = WorkspaceContextInputSchema.parse({
    companyName: row.companyName,
    sector: row.sector,
    language: row.language,
    timezone: row.timezone,
    companySummary: contextJson.companySummary,
    offers: contextJson.offers,
    serviceAreas: contextJson.serviceAreas,
    idealCustomerProfile: contextJson.idealCustomerProfile,
    badFitSignals: contextJson.badFitSignals,
    qualificationRules: contextJson.qualificationRules,
    commonObjections: contextJson.commonObjections,
    proofPoints: contextJson.proofPoints,
    tone: contextJson.tone,
    ctaPreference: contextJson.ctaPreference,
    forbiddenClaims: contextJson.forbiddenClaims,
    handoffRules: contextJson.handoffRules,
  });

  return WorkspaceContextProfileSchema.parse({
    ...normalized,
    profileId: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function createProductionWorkspaceContextService(): WorkspaceContextService {
  return {
    async getWorkspaceContext(workspaceId) {
      const row = await findWorkspaceContextProfile(workspaceId);
      return row ? mapWorkspaceContextProfileRow(row) : null;
    },

    async putWorkspaceContext(workspaceId, userId, input) {
      const result = await upsertWorkspaceContextProfile(workspaceId, userId, input);

      return {
        profile: mapWorkspaceContextProfileRow(result.row),
        created: result.created,
        changedFields: result.changedFields,
      };
    },
  };
}
