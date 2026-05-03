import type {
  DraftAiAuditFinishReason,
  DraftAiAuditOutput,
  DraftAiAuditWarning,
} from "@syrantis/shared";

import {
  findAiRunForDraftAiAudit,
  findDraftForAiAudit,
  findSourceScoreForDraftAiAudit,
  type DraftAiAuditRunRow,
  type DraftAiAuditSourceScoreRow,
} from "../repositories/draft-ai-audit.js";

export type DraftAiAuditServiceResult =
  | { result: "ok"; audit: DraftAiAuditOutput | null }
  | { result: "not_found" };

export type DraftAiAuditService = {
  getDraftAiAudit(workspaceId: string, draftId: string): Promise<DraftAiAuditServiceResult>;
};

type AiRunAuditOutput = NonNullable<DraftAiAuditOutput["aiRun"]>;
type SourceScoreAuditOutput = NonNullable<DraftAiAuditOutput["sourceScore"]>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(
  metadata: Record<string, unknown>,
  key: string,
  warnings: Set<DraftAiAuditWarning>,
): string | null {
  const value = metadata[key];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    warnings.add("AI_DRAFT_METADATA_INVALID");
    return null;
  }

  return value.trim() ? value : null;
}

function readOptionalUuid(
  metadata: Record<string, unknown>,
  key: string,
  invalidWarning: DraftAiAuditWarning | null,
  warnings: Set<DraftAiAuditWarning>,
): string | null {
  const value = readOptionalString(metadata, key, warnings);

  if (!value) {
    return null;
  }

  if (!uuidPattern.test(value)) {
    warnings.add("AI_DRAFT_METADATA_INVALID");

    if (invalidWarning) {
      warnings.add(invalidWarning);
    }

    return null;
  }

  return value;
}

function mapFinishReason(value: string | null): DraftAiAuditFinishReason {
  if (value === "stop") {
    return "completed";
  }

  if (value === "length") {
    return "truncated";
  }

  if (value === "content_filter") {
    return "filtered";
  }

  return "unknown";
}

function completedAtFor(row: DraftAiAuditRunRow): string | null {
  return row.status === "running" || row.status === "pending" ? null : row.updatedAt.toISOString();
}

function mapAiRun(row: DraftAiAuditRunRow, warnings: Set<DraftAiAuditWarning>): AiRunAuditOutput {
  const finishReason = mapFinishReason(row.finishReason);

  if (finishReason !== "completed") {
    warnings.add("AI_RUN_FINISH_REASON_WARNING");
  }

  return {
    id: row.id,
    status: row.status as AiRunAuditOutput["status"],
    provider: row.provider,
    model: row.modelUsed,
    finishReason,
    latencyMs: row.latencyMs,
    completedAt: completedAtFor(row),
  };
}

function mapSourceScore(row: DraftAiAuditSourceScoreRow): SourceScoreAuditOutput {
  return {
    id: row.id,
    score: row.score,
    qualification: row.qualification as SourceScoreAuditOutput["qualification"],
    confidence: row.confidence,
    scoredAt: row.createdAt.toISOString(),
  };
}

export function createProductionDraftAiAuditService(): DraftAiAuditService {
  return {
    async getDraftAiAudit(
      workspaceId: string,
      draftId: string,
    ): Promise<DraftAiAuditServiceResult> {
      const draft = await findDraftForAiAudit({ workspaceId, draftId });

      if (!draft) {
        return { result: "not_found" };
      }

      const metadata = isRecord(draft.metadataJson) ? draft.metadataJson : {};

      if (metadata.origin !== "ai_draft_generation") {
        return { result: "ok", audit: null };
      }

      const warnings = new Set<DraftAiAuditWarning>();

      if (!isRecord(draft.metadataJson) || !draft.leadId) {
        warnings.add("AI_DRAFT_METADATA_INVALID");
      }

      const aiRunId = readOptionalUuid(metadata, "aiRunId", "AI_RUN_INVALID", warnings);
      const sourceLeadScoreId = readOptionalUuid(metadata, "sourceLeadScoreId", null, warnings);
      const promptTemplateId = readOptionalString(metadata, "promptTemplateId", warnings);

      let aiRun: DraftAiAuditOutput["aiRun"] = null;
      let sourceScore: DraftAiAuditOutput["sourceScore"] = null;

      if (aiRunId) {
        const row = await findAiRunForDraftAiAudit({ workspaceId, aiRunId });

        if (row) {
          aiRun = mapAiRun(row, warnings);
        } else {
          warnings.add("AI_RUN_NOT_FOUND");
        }
      } else if (!warnings.has("AI_RUN_INVALID")) {
        warnings.add("AI_RUN_NOT_FOUND");
      }

      if (sourceLeadScoreId) {
        const row = await findSourceScoreForDraftAiAudit({
          workspaceId,
          sourceLeadScoreId,
        });

        if (row) {
          sourceScore = mapSourceScore(row);
        } else {
          warnings.add("SOURCE_SCORE_NOT_FOUND");
        }
      } else {
        warnings.add("SOURCE_SCORE_NOT_FOUND");
      }

      return {
        result: "ok",
        audit: {
          draftId: draft.id,
          leadId: draft.leadId ?? draft.id,
          origin: "ai_draft_generation",
          generatedAt: draft.createdAt.toISOString(),
          promptTemplateId,
          aiRun,
          sourceScore,
          warnings: [...warnings],
        },
      };
    },
  };
}
