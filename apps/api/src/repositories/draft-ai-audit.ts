import { and, eq, ne } from "drizzle-orm";

import { aiRuns, drafts, leadScores } from "@syrantis/db";

import { withWorkspaceDb } from "../lib/db.js";

export type DraftAiAuditDraftRow = {
  id: string;
  leadId: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: Date;
};

export type DraftAiAuditRunRow = {
  id: string;
  status: string;
  provider: string | null;
  modelUsed: string | null;
  latencyMs: number | null;
  finishReason: string | null;
  updatedAt: Date;
};

export type DraftAiAuditSourceScoreRow = {
  id: string;
  score: number;
  qualification: string;
  confidence: number;
  createdAt: Date;
};

export type FindDraftAiAuditDraftInput = {
  workspaceId: string;
  draftId: string;
};

export type FindDraftAiAuditRunInput = {
  workspaceId: string;
  aiRunId: string;
};

export type FindDraftAiAuditSourceScoreInput = {
  workspaceId: string;
  sourceLeadScoreId: string;
};

export async function findDraftForAiAudit(
  input: FindDraftAiAuditDraftInput,
): Promise<DraftAiAuditDraftRow | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [draft] = await tx
      .select({
        id: drafts.id,
        leadId: drafts.leadId,
        metadataJson: drafts.metadataJson,
        createdAt: drafts.createdAt,
      })
      .from(drafts)
      .where(
        and(
          eq(drafts.workspaceId, input.workspaceId),
          eq(drafts.id, input.draftId),
          ne(drafts.status, "archived"),
        ),
      )
      .limit(1);

    return draft ?? null;
  });
}

export async function findAiRunForDraftAiAudit(
  input: FindDraftAiAuditRunInput,
): Promise<DraftAiAuditRunRow | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [aiRun] = await tx
      .select({
        id: aiRuns.id,
        status: aiRuns.status,
        provider: aiRuns.provider,
        modelUsed: aiRuns.modelUsed,
        latencyMs: aiRuns.latencyMs,
        finishReason: aiRuns.finishReason,
        updatedAt: aiRuns.updatedAt,
      })
      .from(aiRuns)
      .where(and(eq(aiRuns.workspaceId, input.workspaceId), eq(aiRuns.id, input.aiRunId)))
      .limit(1);

    return aiRun ?? null;
  });
}

export async function findSourceScoreForDraftAiAudit(
  input: FindDraftAiAuditSourceScoreInput,
): Promise<DraftAiAuditSourceScoreRow | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [sourceScore] = await tx
      .select({
        id: leadScores.id,
        score: leadScores.score,
        qualification: leadScores.qualification,
        confidence: leadScores.confidence,
        createdAt: leadScores.createdAt,
      })
      .from(leadScores)
      .where(
        and(
          eq(leadScores.workspaceId, input.workspaceId),
          eq(leadScores.id, input.sourceLeadScoreId),
        ),
      )
      .limit(1);

    return sourceScore ?? null;
  });
}
