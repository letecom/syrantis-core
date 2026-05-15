import {
  DraftQueueDetailSchema,
  DraftQueueItemSchema,
  type DraftQueueDetail,
  type DraftQueueGmailExportStatus,
  type DraftQueueItem,
  type DraftQueueQuery,
  type DraftQueueReviewStatus,
  type DraftQueueScoreBand,
} from "@syrantis/shared";

import {
  createProductionDraftQueueRepository,
  type DraftQueueDraftRow,
  type DraftQueueIntakeClassificationRow,
  type DraftQueueRepository,
  type DraftQueueRows,
  type DraftQueueScoreRow,
  type DraftQueueWorkspaceContextRow,
} from "../repositories/draft-queue.repository.js";

const DEFAULT_WINDOW_DAYS = 30;
const STALE_DRAFT_DAYS = 7;
const HIGH_SCORE_MINIMUM = 75;
const LOW_CONFIDENCE_MAXIMUM = 49;

export type DraftQueueListResult = {
  items: DraftQueueItem[];
  summary: {
    pendingReview: number;
    readyForGmailExport: number;
    exported: number;
    blocked: number;
    attentionRequired: number;
  };
  limit: number;
  offset: number;
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
  generatedAt: string;
};

export type DraftQueueDetailResult =
  | { result: "ok"; detail: DraftQueueDetail }
  | { result: "not_found" };

export type DraftQueueService = {
  listDraftQueue(workspaceId: string, query: DraftQueueQuery): Promise<DraftQueueListResult>;
  getDraftQueueDetail(workspaceId: string, draftId: string): Promise<DraftQueueDetailResult>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function truncate(value: string | null | undefined, maxLength: number): string | null {
  const trimmed = trimToNull(value);

  if (!trimmed) {
    return null;
  }

  return trimmed.length > maxLength ? trimmed.slice(0, maxLength).trimEnd() : trimmed;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIso(value: Date): string {
  return value.toISOString();
}

function safeMetadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" ? truncate(value, 80) : null;
}

function gmailExportMetadata(metadataJson: Record<string, unknown>): Record<string, unknown> {
  return metadataRecord(metadataJson.gmailExport);
}

function isAiGeneratedDraft(row: DraftQueueDraftRow): boolean {
  return metadataRecord(row.metadataJson).origin === "ai_draft_generation";
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function isEmailValidEnough(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  return Boolean(trimmed) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed ?? "");
}

function scoreBandFromScore(score: number | null): DraftQueueScoreBand {
  if (score === null) {
    return "unknown";
  }

  if (score >= 75) {
    return "hot";
  }

  return score >= 45 ? "warm" : "cold";
}

function scoreBand(row: DraftQueueScoreRow | undefined): DraftQueueScoreBand {
  if (!row) {
    return "unknown";
  }

  if (row.qualification === "cold" || row.qualification === "warm" || row.qualification === "hot") {
    return row.qualification;
  }

  return scoreBandFromScore(row.score);
}

function intentFromClassification(
  row: DraftQueueIntakeClassificationRow | undefined,
): string | null {
  if (!row) {
    return null;
  }

  return truncate(row.reasonCode || row.category || row.action, 120);
}

function urgencyFromClassification(
  row: DraftQueueIntakeClassificationRow | undefined,
): string | null {
  if (!row) {
    return null;
  }

  const labels = row.suggestedLabels.join(" ").toLowerCase();
  const reason = row.reasonCode.toLowerCase();

  if (labels.includes("urgent") || reason.includes("urgent")) {
    return "high";
  }

  return null;
}

function scoreDto(input: {
  score: DraftQueueScoreRow | undefined;
  classification: DraftQueueIntakeClassificationRow | undefined;
}) {
  return {
    scoreBand: scoreBand(input.score),
    score: input.score?.score ?? null,
    confidence: input.score?.confidence ?? null,
    recommendedAction: truncate(input.score?.recommendedAction, 240),
    urgency: urgencyFromClassification(input.classification),
    intent: intentFromClassification(input.classification),
  };
}

function significantBlockingReasons(reasons: string[]): string[] {
  return reasons.filter((reason) => reason !== "export_not_requested");
}

function requestRelatedBlockingReasons(reasons: string[]): string[] {
  return reasons.filter(
    (reason) =>
      reason === "export_not_requested" ||
      reason === "export_request_expired" ||
      reason === "export_cancelled",
  );
}

function hasOnlyRequestRelatedBlockingReasons(reasons: string[]): boolean {
  return reasons.length === requestRelatedBlockingReasons(reasons).length;
}

function deriveGmailExport(row: DraftQueueDraftRow, now: Date) {
  const metadata = metadataRecord(row.metadataJson);
  const gmailExport = gmailExportMetadata(metadata);
  const exportedAt = parseDate(gmailExport.exportedAt);
  const requestedAt = parseDate(gmailExport.requestedAt);
  const requestExpiresAt = parseDate(gmailExport.requestExpiresAt);
  const leaseExpiresAt = parseDate(gmailExport.leaseExpiresAt);
  const cancelledAt = parseDate(gmailExport.cancelledAt);
  const hasSubject = hasText(row.subject);
  const hasBodyText = hasText(row.textBody);
  const hasRecipient = hasText(row.recipientAddress);
  const recipientValid = isEmailValidEnough(row.recipientAddress);
  const activeLease =
    typeof gmailExport.leaseToken === "string" && Boolean(leaseExpiresAt && leaseExpiresAt > now);
  const staleLease =
    typeof gmailExport.leaseToken === "string" && Boolean(leaseExpiresAt && leaseExpiresAt <= now);
  const exported = gmailExport.status === "exported" || Boolean(exportedAt);
  const cancelled = gmailExport.status === "cancelled" || Boolean(cancelledAt);
  const activeRequest =
    Boolean(requestedAt && requestExpiresAt && requestExpiresAt > now) &&
    !cancelled &&
    !exported &&
    !activeLease;
  const reasons: string[] = [];

  if (row.status !== "draft") {
    reasons.push("draft_not_ready");
  }

  if (!hasSubject) {
    reasons.push("missing_subject");
  }

  if (!hasBodyText) {
    reasons.push("missing_body");
  }

  if (!row.leadId) {
    reasons.push("missing_lead");
  }

  if (!hasRecipient) {
    reasons.push("missing_email");
  } else if (!recipientValid) {
    reasons.push("invalid_email");
  }

  if (exported) {
    reasons.push("already_exported");
  } else if (activeLease) {
    reasons.push("export_in_progress");
  } else if (staleLease) {
    reasons.push("stale_lease");
  } else if (cancelled) {
    reasons.push("export_cancelled");
  } else if (requestedAt && (!requestExpiresAt || requestExpiresAt <= now)) {
    reasons.push("export_request_expired");
  } else if (!activeRequest) {
    reasons.push("export_not_requested");
  }

  let exportStatus: DraftQueueGmailExportStatus = "not_exported";

  if (exported) {
    exportStatus = "exported";
  } else if (activeLease) {
    exportStatus = "leased";
  } else if (significantBlockingReasons(reasons).length > 0) {
    exportStatus = "blocked";
  } else if (activeRequest) {
    exportStatus = "requested";
  } else if (!isRecord(gmailExport) && Object.keys(gmailExport).length === 0) {
    exportStatus = "not_exported";
  }

  return {
    exportStatus,
    canExport:
      activeRequest &&
      row.status === "draft" &&
      hasSubject &&
      hasBodyText &&
      recipientValid &&
      !exported &&
      !activeLease,
    blockingReasons: reasons,
    exportedAt: exportedAt?.toISOString() ?? null,
  };
}

function draftActions(input: {
  row: DraftQueueDraftRow;
  gmailExport: ReturnType<typeof deriveGmailExport>;
}) {
  const structurallyReady =
    input.row.status === "draft" && hasText(input.row.subject) && hasText(input.row.textBody);
  const requestableStatus =
    input.gmailExport.exportStatus === "not_exported" ||
    (input.gmailExport.exportStatus === "blocked" &&
      hasOnlyRequestRelatedBlockingReasons(input.gmailExport.blockingReasons));

  return {
    canRequestGmailExport:
      structurallyReady &&
      requestableStatus &&
      !input.gmailExport.blockingReasons.includes("already_exported") &&
      !input.gmailExport.blockingReasons.includes("export_in_progress"),
    canCancelGmailExportRequest: input.gmailExport.exportStatus === "requested",
    canViewGmailExportStatus: Boolean(input.row.draftId),
  };
}

function reviewStatus(gmailExportStatus: DraftQueueGmailExportStatus): DraftQueueReviewStatus {
  if (gmailExportStatus === "exported") {
    return "exported";
  }

  if (gmailExportStatus === "blocked") {
    return "blocked";
  }

  if (gmailExportStatus === "not_exported" || gmailExportStatus === "requested") {
    return "pending_review";
  }

  return "unknown";
}

function contextSummary(input: {
  workspaceContext: DraftQueueWorkspaceContextRow;
  contactKnown: boolean;
  previousLeadCount: number;
  scoreConfidence: number | null;
}) {
  const riskFlags: string[] = [];

  if (!input.workspaceContext) {
    riskFlags.push("no_context");
  }

  if (input.previousLeadCount > 0) {
    riskFlags.push("duplicate_risk");
  }

  if (input.scoreConfidence !== null && input.scoreConfidence <= LOW_CONFIDENCE_MAXIMUM) {
    riskFlags.push("low_confidence");
  }

  return {
    companyName: trimToNull(input.workspaceContext?.companyName),
    sector: trimToNull(input.workspaceContext?.sector),
    language: trimToNull(input.workspaceContext?.language),
    contactKnown: input.contactKnown,
    previousLeadCount: input.previousLeadCount,
    riskFlags,
  };
}

function isUrgent(score: ReturnType<typeof scoreDto>): boolean {
  const value = `${score.urgency ?? ""} ${score.recommendedAction ?? ""}`.toLowerCase();
  return /\b(urgent|immediate|today|10 minutes|high)\b/.test(value);
}

function attentionFlags(input: {
  row: DraftQueueDraftRow;
  score: ReturnType<typeof scoreDto>;
  contextRiskFlags: string[];
  gmailExportStatus: DraftQueueGmailExportStatus;
  now: Date;
}): string[] {
  const flags = new Set<string>();

  if (
    input.score.scoreBand === "hot" ||
    (input.score.score !== null && input.score.score >= HIGH_SCORE_MINIMUM)
  ) {
    flags.add("high_score");
  }

  if (isUrgent(input.score)) {
    flags.add("urgent_action");
  }

  if (input.gmailExportStatus === "blocked") {
    flags.add("export_blocked");
  }

  if (
    input.now.getTime() - input.row.createdAt.getTime() >
    STALE_DRAFT_DAYS * 24 * 60 * 60 * 1000
  ) {
    flags.add("stale_draft");
  }

  for (const flag of input.contextRiskFlags) {
    flags.add(flag);
  }

  return [...flags];
}

function draftTone(row: DraftQueueDraftRow): string | null {
  return safeMetadataString(metadataRecord(row.metadataJson), "tone");
}

function draftLanguage(
  row: DraftQueueDraftRow,
  context: DraftQueueWorkspaceContextRow,
): string | null {
  return (
    safeMetadataString(metadataRecord(row.metadataJson), "language") ??
    trimToNull(context?.language)
  );
}

function baseDto(input: { row: DraftQueueDraftRow; rows: DraftQueueRows; now: Date }) {
  const leadId = input.row.leadId;

  if (!leadId) {
    return null;
  }

  const latestScore = input.rows.latestScoresByLeadId[leadId];
  const latestClassification = input.rows.latestClassificationsByLeadId[leadId];
  const score = scoreDto({ score: latestScore, classification: latestClassification });
  const previousLeadCount = input.rows.previousLeadCountsByLeadId[leadId] ?? 0;
  const context = contextSummary({
    workspaceContext: input.rows.workspaceContext,
    contactKnown: Boolean(input.row.leadContactId ?? input.row.draftContactId),
    previousLeadCount,
    scoreConfidence: score.confidence,
  });
  const gmailExport = deriveGmailExport(input.row, input.now);
  const actions = draftActions({ row: input.row, gmailExport });
  const resolvedReviewStatus = reviewStatus(gmailExport.exportStatus);
  const flags = attentionFlags({
    row: input.row,
    score,
    contextRiskFlags: context.riskFlags,
    gmailExportStatus: gmailExport.exportStatus,
    now: input.now,
  });
  const tone = draftTone(input.row);
  const language = draftLanguage(input.row, input.rows.workspaceContext);

  return {
    draftId: input.row.draftId,
    leadId,
    createdAt: toIso(input.row.createdAt),
    score,
    contextSummary: context,
    gmailExport,
    actions,
    reviewStatus: resolvedReviewStatus,
    attentionFlags: flags,
    tone,
    language,
  };
}

function mapItem(input: {
  row: DraftQueueDraftRow;
  rows: DraftQueueRows;
  now: Date;
}): DraftQueueItem | null {
  const base = baseDto(input);

  if (!base) {
    return null;
  }

  return DraftQueueItemSchema.parse({
    ...base,
    draftPreview: {
      hasSubject: hasText(input.row.subject),
      hasBodyText: hasText(input.row.textBody),
      subjectPreview: truncate(input.row.subject, 120),
      bodyPreview: truncate(input.row.textBody, 280),
      tone: base.tone,
      language: base.language,
    },
  });
}

function mapDetail(input: {
  row: DraftQueueDraftRow;
  rows: DraftQueueRows;
  now: Date;
}): DraftQueueDetail | null {
  const base = baseDto(input);

  if (!base) {
    return null;
  }

  return DraftQueueDetailSchema.parse({
    ...base,
    proposedDraft: {
      subject: input.row.subject ?? "",
      bodyText: input.row.textBody ?? "",
      tone: base.tone,
      language: base.language,
      generatedAt: toIso(input.row.createdAt),
    },
  });
}

function scoreBandRank(value: DraftQueueScoreBand): number {
  if (value === "hot") {
    return 3;
  }

  if (value === "warm") {
    return 2;
  }

  if (value === "cold") {
    return 1;
  }

  return 0;
}

function sortedItems(items: DraftQueueItem[]): DraftQueueItem[] {
  return [...items].sort((left, right) => {
    const attention =
      Number(right.attentionFlags.length > 0) - Number(left.attentionFlags.length > 0);

    if (attention !== 0) {
      return attention;
    }

    const hot = scoreBandRank(right.score.scoreBand) - scoreBandRank(left.score.scoreBand);

    if (hot !== 0) {
      return hot;
    }

    const urgent =
      Number(right.attentionFlags.includes("urgent_action")) -
      Number(left.attentionFlags.includes("urgent_action"));

    if (urgent !== 0) {
      return urgent;
    }

    const newest = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();

    if (newest !== 0) {
      return newest;
    }

    return right.draftId.localeCompare(left.draftId);
  });
}

function summarize(items: DraftQueueItem[]): DraftQueueListResult["summary"] {
  return {
    pendingReview: items.filter((item) => item.reviewStatus === "pending_review").length,
    readyForGmailExport: items.filter((item) => item.gmailExport.canExport).length,
    exported: items.filter((item) => item.reviewStatus === "exported").length,
    blocked: items.filter((item) => item.reviewStatus === "blocked").length,
    attentionRequired: items.filter((item) => item.attentionFlags.length > 0).length,
  };
}

function filteredItems(items: DraftQueueItem[], query: DraftQueueQuery): DraftQueueItem[] {
  return items.filter((item) => {
    if (query.scoreBand && item.score.scoreBand !== query.scoreBand) {
      return false;
    }

    if (query.exportStatus && item.gmailExport.exportStatus !== query.exportStatus) {
      return false;
    }

    if (query.attentionRequired === true && item.attentionFlags.length === 0) {
      return false;
    }

    if (query.attentionRequired === false && item.attentionFlags.length > 0) {
      return false;
    }

    return true;
  });
}

function defaultSince(now: Date): Date {
  return new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

function querySince(query: DraftQueueQuery, now: Date): Date {
  if (!query.since) {
    return defaultSince(now);
  }

  const parsed = new Date(query.since);
  return Number.isNaN(parsed.getTime()) ? defaultSince(now) : parsed;
}

export function createDraftQueueService(
  repository: DraftQueueRepository = createProductionDraftQueueRepository(),
  nowProvider: () => Date = () => new Date(),
): DraftQueueService {
  return {
    async listDraftQueue(workspaceId, query) {
      const now = nowProvider();
      const rows = await repository.listRows({ workspaceId, since: querySince(query, now) });
      const allItems = sortedItems(
        rows.drafts
          .filter(isAiGeneratedDraft)
          .map((row) => mapItem({ row, rows, now }))
          .filter((item): item is DraftQueueItem => Boolean(item)),
      );
      const filtered = filteredItems(allItems, query);

      return {
        items: filtered.slice(query.offset, query.offset + query.limit),
        summary: summarize(allItems),
        limit: query.limit,
        offset: query.offset,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: filtered.length,
        },
        generatedAt: now.toISOString(),
      };
    },

    async getDraftQueueDetail(workspaceId, draftId) {
      const now = nowProvider();
      const rows = await repository.findDetailRows({ workspaceId, draftId });
      const row = rows.drafts.find(
        (draft) => draft.draftId === draftId && isAiGeneratedDraft(draft),
      );

      if (!row) {
        return { result: "not_found" };
      }

      const detail = mapDetail({ row, rows, now });

      if (!detail) {
        return { result: "not_found" };
      }

      return { result: "ok", detail };
    },
  };
}

export function createProductionDraftQueueService(): DraftQueueService {
  return createDraftQueueService();
}
