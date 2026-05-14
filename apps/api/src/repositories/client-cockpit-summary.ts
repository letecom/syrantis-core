import { and, eq, gte, inArray } from "drizzle-orm";

import { backgroundJobs, drafts, leadScores, leads } from "@syrantis/db";

import { withWorkspaceDb } from "../lib/db.js";

export type ClientCockpitLeadRow = {
  workspaceId: string;
  createdAt: Date;
};

export type ClientCockpitLeadScoreRow = {
  workspaceId: string;
  leadId: string;
  createdAt: Date;
};

export type ClientCockpitDraftRow = {
  workspaceId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  metadataJson: Record<string, unknown>;
};

export type ClientCockpitBackgroundJobRow = {
  workspaceId: string;
  status: string;
  runAfter: Date;
  scheduledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ClientCockpitSummaryRows = {
  leads: ClientCockpitLeadRow[];
  leadScores: ClientCockpitLeadScoreRow[];
  drafts: ClientCockpitDraftRow[];
  backgroundJobs: ClientCockpitBackgroundJobRow[];
};

export type ClientCockpitSummaryRepository = {
  getSummaryRows(input: {
    workspaceId: string;
    since: Date;
  }): Promise<ClientCockpitSummaryRows>;
};

export function createProductionClientCockpitSummaryRepository(): ClientCockpitSummaryRepository {
  return {
    async getSummaryRows(input) {
      return withWorkspaceDb(input.workspaceId, async (tx) => {
        const leadRows = await tx
          .select({
            workspaceId: leads.workspaceId,
            createdAt: leads.createdAt,
          })
          .from(leads)
          .where(and(eq(leads.workspaceId, input.workspaceId), gte(leads.createdAt, input.since)));

        const leadScoreRows = await tx
          .select({
            workspaceId: leadScores.workspaceId,
            leadId: leadScores.leadId,
            createdAt: leadScores.createdAt,
          })
          .from(leadScores)
          .where(
            and(
              eq(leadScores.workspaceId, input.workspaceId),
              gte(leadScores.createdAt, input.since),
            ),
          );

        const draftRows = await tx
          .select({
            workspaceId: drafts.workspaceId,
            status: drafts.status,
            createdAt: drafts.createdAt,
            updatedAt: drafts.updatedAt,
            metadataJson: drafts.metadataJson,
          })
          .from(drafts)
          .where(eq(drafts.workspaceId, input.workspaceId));

        const backgroundJobRows = await tx
          .select({
            workspaceId: backgroundJobs.workspaceId,
            status: backgroundJobs.status,
            runAfter: backgroundJobs.runAfter,
            scheduledAt: backgroundJobs.scheduledAt,
            createdAt: backgroundJobs.createdAt,
            updatedAt: backgroundJobs.updatedAt,
          })
          .from(backgroundJobs)
          .where(
            and(
              eq(backgroundJobs.workspaceId, input.workspaceId),
              inArray(backgroundJobs.status, ["pending", "running", "failed"]),
            ),
          );

        return {
          leads: leadRows,
          leadScores: leadScoreRows,
          drafts: draftRows,
          backgroundJobs: backgroundJobRows,
        };
      });
    },
  };
}
