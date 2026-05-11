import {
  LeadScoreStatusDtoSchema,
  type LeadScoreStatus,
  type LeadScoreStatusDto,
  type LeadScoreStatusJob,
  type LeadScoreStatusLatestScore,
} from "@syrantis/shared";

import {
  findScoringStatusRecord,
  type FindScoringStatusRecordResult,
  type ScoringStatusJobRow,
  type ScoringStatusScoreRow,
} from "../repositories/scoring-status.js";

export type ScoringStatusServiceResult =
  | { result: "ok"; status: LeadScoreStatusDto }
  | { result: "not_found" };

export type ScoringStatusService = {
  getStatus(workspaceId: string, leadId: string): Promise<ScoringStatusServiceResult>;
};

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toUuidOrNull(value: string | null): string | null {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function mapJob(row: ScoringStatusJobRow): LeadScoreStatusJob {
  return {
    id: row.id,
    status: row.status as LeadScoreStatusJob["status"],
    attempts: row.attempts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: toIsoDate(row.completedAt),
    failedAt: toIsoDate(row.failedAt),
    diagnosticTraceId: toUuidOrNull(row.diagnosticTraceId),
  };
}

function mapScore(row: ScoringStatusScoreRow): LeadScoreStatusLatestScore {
  return {
    id: row.id,
    score: row.score,
    scoreBand: row.scoreBand,
    intent: null,
    urgency: null,
    confidence: row.confidence,
    recommendedAction: row.recommendedAction,
    diagnosticTraceId: null,
    createdAt: row.createdAt.toISOString(),
  };
}

function calculateStatus(input: {
  latestJob: LeadScoreStatusJob | null;
  latestScore: LeadScoreStatusLatestScore | null;
}): LeadScoreStatus {
  const hasScore = Boolean(input.latestScore);

  if (!input.latestJob) {
    return hasScore ? "completed" : "not_requested";
  }

  if ((input.latestJob.status === "pending" || input.latestJob.status === "running") && hasScore) {
    return "rescoring_pending_with_previous_score";
  }

  if (input.latestJob.status === "pending") {
    return "pending";
  }

  if (input.latestJob.status === "running") {
    return "running";
  }

  if (input.latestJob.status === "completed") {
    return hasScore ? "completed" : "completed_but_score_missing";
  }

  if (input.latestJob.status === "failed") {
    return hasScore ? "failed_with_previous_score" : "failed";
  }

  return hasScore ? "failed_with_previous_score" : "failed";
}

function processingNoteForStatus(status: LeadScoreStatus): string {
  if (status === "not_requested") {
    return "No scoring job or score was found for this lead.";
  }

  if (status === "completed_but_score_missing") {
    return "The latest scoring job completed, but no score row is available.";
  }

  if (status === "rescoring_pending_with_previous_score") {
    return "A newer scoring job is in progress; the latest available previous score is shown.";
  }

  if (status === "failed_with_previous_score") {
    return "The latest scoring job failed; the latest available previous score is shown.";
  }

  if (status === "failed") {
    return "The latest scoring job failed and no previous score is available.";
  }

  return "Lead scoring status was read without mutating workflow state.";
}

function mapRecord(
  result: Extract<FindScoringStatusRecordResult, { result: "ok" }>,
): LeadScoreStatusDto {
  const latestJob = result.record.jobs[0] ? mapJob(result.record.jobs[0]) : null;
  const latestScore = result.record.scores[0] ? mapScore(result.record.scores[0]) : null;
  const scoreStatus = calculateStatus({ latestJob, latestScore });

  return LeadScoreStatusDtoSchema.parse({
    scoreStatus,
    latestJob,
    latestScore,
    counts: {
      totalScoringJobs: result.record.jobs.length,
      totalScores: result.record.scores.length,
    },
    checkedAt: new Date().toISOString(),
    processingNote: processingNoteForStatus(scoreStatus),
  });
}

export function createProductionScoringStatusService(): ScoringStatusService {
  return {
    async getStatus(workspaceId: string, leadId: string): Promise<ScoringStatusServiceResult> {
      const result = await findScoringStatusRecord({ workspaceId, leadId });

      if (result.result !== "ok") {
        return result;
      }

      return {
        result: "ok",
        status: mapRecord(result),
      };
    },
  };
}
