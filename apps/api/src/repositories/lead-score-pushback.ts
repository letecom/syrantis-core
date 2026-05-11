import { and, eq, sql } from "drizzle-orm";

import { activityLogs, leadScores, leads } from "@syrantis/db";

import type { WorkspaceDbTransaction } from "../lib/db.js";

export type LeadScorePushbackLeadRow = {
  id: string;
  source: string;
  normalizedJson: Record<string, unknown>;
  createdAt: Date;
};

export type LeadScorePushbackScoreRow = {
  id: string;
  leadId: string;
  score: number;
  qualification: string;
  confidence: number;
  recommendedAction: string;
  createdAt: Date;
};

export async function findLeadForLeadScorePushback(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; leadId: string },
): Promise<LeadScorePushbackLeadRow | null> {
  const [lead] = await tx
    .select({
      id: leads.id,
      source: leads.source,
      normalizedJson: leads.normalizedJson,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(and(eq(leads.id, input.leadId), eq(leads.workspaceId, input.workspaceId)))
    .limit(1);

  return lead ?? null;
}

export async function findScoreForLeadScorePushback(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; leadId: string; scoreId: string },
): Promise<LeadScorePushbackScoreRow | null> {
  const [score] = await tx
    .select({
      id: leadScores.id,
      leadId: leadScores.leadId,
      score: leadScores.score,
      qualification: leadScores.qualification,
      confidence: leadScores.confidence,
      recommendedAction: leadScores.recommendedAction,
      createdAt: leadScores.createdAt,
    })
    .from(leadScores)
    .where(
      and(
        eq(leadScores.id, input.scoreId),
        eq(leadScores.leadId, input.leadId),
        eq(leadScores.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);

  return score ?? null;
}

export async function hasSucceededLeadScorePushback(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; scoreId: string },
): Promise<boolean> {
  const [log] = await tx
    .select({ id: activityLogs.id })
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.workspaceId, input.workspaceId),
        eq(activityLogs.type, "lead_score_pushback.succeeded"),
        sql`${activityLogs.metadataJson}->>'scoreId' = ${input.scoreId}`,
      ),
    )
    .limit(1);

  return Boolean(log);
}
