import { and, desc, eq, sql } from "drizzle-orm";

import { backgroundJobs, leadScores, leads } from "@syrantis/db";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";

export type ScoringStatusJobRow = {
  id: string;
  status: string;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
  diagnosticTraceId: string | null;
};

export type ScoringStatusScoreRow = {
  id: string;
  score: number;
  scoreBand: string;
  confidence: number;
  recommendedAction: string;
  createdAt: Date;
};

export type ScoringStatusRecord = {
  jobs: ScoringStatusJobRow[];
  scores: ScoringStatusScoreRow[];
};

export type FindScoringStatusRecordInput = {
  workspaceId: string;
  leadId: string;
};

export type FindScoringStatusRecordResult =
  | { result: "ok"; record: ScoringStatusRecord }
  | { result: "not_found" };

async function leadExists(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; leadId: string },
): Promise<boolean> {
  const [lead] = await tx
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.workspaceId, input.workspaceId), eq(leads.id, input.leadId)))
    .limit(1);

  return Boolean(lead);
}

export async function findScoringStatusRecord(
  input: FindScoringStatusRecordInput,
): Promise<FindScoringStatusRecordResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const exists = await leadExists(tx, input);

    if (!exists) {
      return { result: "not_found" };
    }

    const jobs = await tx
      .select({
        id: backgroundJobs.id,
        status: backgroundJobs.status,
        attempts: backgroundJobs.attempts,
        createdAt: backgroundJobs.createdAt,
        updatedAt: backgroundJobs.updatedAt,
        completedAt: backgroundJobs.completedAt,
        failedAt: backgroundJobs.failedAt,
        diagnosticTraceId: sql<string | null>`${backgroundJobs.payloadJson}->>'diagnosticTraceId'`,
      })
      .from(backgroundJobs)
      .where(
        and(
          eq(backgroundJobs.workspaceId, input.workspaceId),
          eq(backgroundJobs.type, "score_lead"),
          sql`${backgroundJobs.payloadJson}->>'leadId' = ${input.leadId}`,
        ),
      )
      .orderBy(desc(backgroundJobs.createdAt), desc(backgroundJobs.id));

    const scores = await tx
      .select({
        id: leadScores.id,
        score: leadScores.score,
        scoreBand: leadScores.qualification,
        confidence: leadScores.confidence,
        recommendedAction: leadScores.recommendedAction,
        createdAt: leadScores.createdAt,
      })
      .from(leadScores)
      .where(
        and(eq(leadScores.workspaceId, input.workspaceId), eq(leadScores.leadId, input.leadId)),
      )
      .orderBy(desc(leadScores.createdAt), desc(leadScores.id));

    return {
      result: "ok",
      record: {
        jobs,
        scores,
      },
    };
  });
}
