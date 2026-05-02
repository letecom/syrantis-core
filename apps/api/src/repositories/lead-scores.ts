import { and, desc, eq, lt, type SQL } from "drizzle-orm";

import { leadScores, leads } from "@syrantis/db";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";

export type LeadScoreReadRow = {
  id: string;
  leadId: string;
  score: number;
  qualification: string;
  summary: string;
  rationale: string;
  recommendedAction: string;
  confidence: number;
  model: string;
  promptTemplateId: string;
  createdAt: Date;
};

export type GetLatestLeadScoreInput = {
  workspaceId: string;
  leadId: string;
};

export type ListLeadScoresInput = {
  workspaceId: string;
  leadId: string;
  limit: number;
  cursor?: Date | undefined;
};

export type GetLatestLeadScoreResult =
  | { result: "ok"; score: LeadScoreReadRow | null }
  | { result: "not_found" };

export type ListLeadScoresResult =
  | { result: "ok"; scores: LeadScoreReadRow[]; nextCursor: Date | null }
  | { result: "not_found" };

const publicLeadScoreSelection = {
  id: leadScores.id,
  leadId: leadScores.leadId,
  score: leadScores.score,
  qualification: leadScores.qualification,
  summary: leadScores.summary,
  rationale: leadScores.rationale,
  recommendedAction: leadScores.recommendedAction,
  confidence: leadScores.confidence,
  model: leadScores.model,
  promptTemplateId: leadScores.promptTemplateId,
  createdAt: leadScores.createdAt,
};

async function leadExists(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; leadId: string },
): Promise<boolean> {
  const [lead] = await tx
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, input.leadId), eq(leads.workspaceId, input.workspaceId)))
    .limit(1);

  return Boolean(lead);
}

function scoreFilters(input: { workspaceId: string; leadId: string; cursor?: Date | undefined }): SQL[] {
  const filters = [
    eq(leadScores.workspaceId, input.workspaceId),
    eq(leadScores.leadId, input.leadId),
  ];

  if (input.cursor) {
    filters.push(lt(leadScores.createdAt, input.cursor));
  }

  return filters;
}

export async function getLatestLeadScore(input: GetLatestLeadScoreInput): Promise<GetLatestLeadScoreResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const exists = await leadExists(tx, input);

    if (!exists) {
      return { result: "not_found" };
    }

    const [score] = await tx
      .select(publicLeadScoreSelection)
      .from(leadScores)
      .where(and(...scoreFilters(input)))
      .orderBy(desc(leadScores.createdAt))
      .limit(1);

    return {
      result: "ok",
      score: score ?? null,
    };
  });
}

export async function listLeadScores(input: ListLeadScoresInput): Promise<ListLeadScoresResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const exists = await leadExists(tx, input);

    if (!exists) {
      return { result: "not_found" };
    }

    const rows = await tx
      .select(publicLeadScoreSelection)
      .from(leadScores)
      .where(and(...scoreFilters(input)))
      .orderBy(desc(leadScores.createdAt))
      .limit(input.limit + 1);

    const scores = rows.slice(0, input.limit);
    const nextCursor = rows.length > input.limit ? scores[scores.length - 1]?.createdAt ?? null : null;

    return {
      result: "ok",
      scores,
      nextCursor,
    };
  });
}
