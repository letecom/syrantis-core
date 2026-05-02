import type { LeadScoreHistoryQuery, LeadScoreReadModel } from "@syrantis/shared";

import {
  getLatestLeadScore,
  listLeadScores,
  type LeadScoreReadRow,
  type ListLeadScoresResult,
} from "../repositories/lead-scores.js";

export type LeadScoreServiceLatestResult =
  | { result: "ok"; score: LeadScoreReadModel | null }
  | { result: "not_found" };

export type LeadScoreServiceHistoryResult =
  | { result: "ok"; scores: LeadScoreReadModel[]; nextCursor: string | null }
  | { result: "not_found" };

export type LeadScoreService = {
  getLatestLeadScore(workspaceId: string, id: string): Promise<LeadScoreServiceLatestResult>;
  listLeadScores(
    workspaceId: string,
    id: string,
    query: LeadScoreHistoryQuery,
  ): Promise<LeadScoreServiceHistoryResult>;
};

function mapLeadScoreRow(row: LeadScoreReadRow): LeadScoreReadModel {
  return {
    id: row.id,
    leadId: row.leadId,
    score: row.score,
    qualification: row.qualification as LeadScoreReadModel["qualification"],
    summary: row.summary,
    rationale: row.rationale,
    recommendedAction: row.recommendedAction,
    confidence: row.confidence,
    model: row.model,
    promptTemplateId: row.promptTemplateId,
    scoredAt: row.createdAt.toISOString(),
  };
}

function mapScoreHistoryResult(result: ListLeadScoresResult): LeadScoreServiceHistoryResult {
  if (result.result !== "ok") {
    return result;
  }

  return {
    result: "ok",
    scores: result.scores.map(mapLeadScoreRow),
    nextCursor: result.nextCursor ? result.nextCursor.toISOString() : null,
  };
}

export function createProductionLeadScoreService(): LeadScoreService {
  return {
    async getLatestLeadScore(workspaceId: string, id: string): Promise<LeadScoreServiceLatestResult> {
      const result = await getLatestLeadScore({ workspaceId, leadId: id });

      if (result.result !== "ok") {
        return result;
      }

      return {
        result: "ok",
        score: result.score ? mapLeadScoreRow(result.score) : null,
      };
    },

    async listLeadScores(
      workspaceId: string,
      id: string,
      query: LeadScoreHistoryQuery,
    ): Promise<LeadScoreServiceHistoryResult> {
      return mapScoreHistoryResult(
        await listLeadScores({
          workspaceId,
          leadId: id,
          limit: query.limit,
          ...(query.cursor ? { cursor: new Date(query.cursor) } : {}),
        }),
      );
    },
  };
}
