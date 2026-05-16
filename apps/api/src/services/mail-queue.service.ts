import {
  MailQueueItemSchema,
  type MailQueueContactStatus,
  type MailQueueData,
  type MailQueueGmailExportStatus,
  type MailQueueItem,
  type MailQueueNextBestAction,
  type MailQueuePipelineState,
  type MailQueueQuery,
  type MailQueueScoreBand,
} from "@syrantis/shared";

import {
  createProductionMailQueueRepository,
  type MailQueueClassificationRow,
  type MailQueueDraftRow,
  type MailQueueRepository,
  type MailQueueRows,
  type MailQueueScoreRow,
  type MailQueueWorkspaceContextRow,
} from "../repositories/mail-queue.repository.js";

const DEFAULT_WINDOW_DAYS = 30;
const HIGH_SCORE_MINIMUM = 75;
const STALE_MAIL_DAYS = 2;

export type MailQueueDetailResult =
  | { result: "ok"; detail: MailQueueItem }
  | { result: "not_found" };

export type MailQueueService = {
  listMailQueue(workspaceId: string, query: MailQueueQuery): Promise<MailQueueData>;
  getMailQueueDetail(workspaceId: string, classificationId: string): Promise<MailQueueDetailResult>;
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

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
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

function defaultSince(now: Date): Date {
  return new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

function querySince(query: MailQueueQuery, now: Date): Date {
  if (!query.since) {
    return defaultSince(now);
  }

  const parsed = new Date(query.since);
  return Number.isNaN(parsed.getTime()) ? defaultSince(now) : parsed;
}

function scoreBandFromScore(score: number | null): MailQueueScoreBand {
  if (score === null) {
    return "unknown";
  }

  if (score >= 75) {
    return "hot";
  }

  return score >= 45 ? "warm" : "cold";
}

function scoreBand(row: MailQueueScoreRow | undefined): MailQueueScoreBand {
  if (!row) {
    return "unknown";
  }

  if (row.qualification === "cold" || row.qualification === "warm" || row.qualification === "hot") {
    return row.qualification;
  }

  return scoreBandFromScore(row.score);
}

function urgencyFromSignals(input: {
  classification: MailQueueClassificationRow;
  score: MailQueueScoreRow | undefined;
}): string | null {
  const value = [
    input.classification.reasonCode,
    input.classification.suggestedLabels.join(" "),
    input.score?.recommendedAction ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (/\b(urgent|immediate|today|high|asap|10 minutes)\b/.test(value)) {
    return "high";
  }

  return null;
}

function scoreDto(input: {
  classification: MailQueueClassificationRow;
  score: MailQueueScoreRow | undefined;
}) {
  return {
    scoreBand: scoreBand(input.score),
    score: input.score?.score ?? null,
    confidence: input.score?.confidence ?? null,
    recommendedAction: truncate(input.score?.recommendedAction, 240),
    urgency: urgencyFromSignals(input),
    intent: truncate(input.classification.reasonCode || input.classification.category, 120),
    scoredAt: input.score?.createdAt.toISOString() ?? null,
  };
}

function contextDto(context: MailQueueWorkspaceContextRow) {
  return {
    companyName: trimToNull(context?.companyName),
    sector: trimToNull(context?.sector),
    language: trimToNull(context?.language),
  };
}

function gmailExportMetadata(row: MailQueueDraftRow | undefined): Record<string, unknown> {
  return metadataRecord(metadataRecord(row?.metadataJson).gmailExport);
}

function hasGmailExportSignal(metadata: Record<string, unknown>): boolean {
  return [
    "status",
    "requestedAt",
    "requestExpiresAt",
    "leaseExpiresAt",
    "leaseToken",
    "exportedAt",
    "cancelledAt",
  ].some((key) => metadata[key] !== undefined && metadata[key] !== null);
}

function isExported(metadata: Record<string, unknown>): boolean {
  return metadata.status === "exported" || Boolean(parseDate(metadata.exportedAt));
}

function isCancelled(metadata: Record<string, unknown>): boolean {
  return metadata.status === "cancelled" || Boolean(parseDate(metadata.cancelledAt));
}

function activeLease(metadata: Record<string, unknown>, now: Date): boolean {
  const leaseExpiresAt = parseDate(metadata.leaseExpiresAt);
  return typeof metadata.leaseToken === "string" && Boolean(leaseExpiresAt && leaseExpiresAt > now);
}

function staleLease(metadata: Record<string, unknown>, now: Date): boolean {
  const leaseExpiresAt = parseDate(metadata.leaseExpiresAt);
  return (
    typeof metadata.leaseToken === "string" && Boolean(leaseExpiresAt && leaseExpiresAt <= now)
  );
}

function activeRequest(metadata: Record<string, unknown>, now: Date): boolean {
  const requestedAt = parseDate(metadata.requestedAt);
  const requestExpiresAt = parseDate(metadata.requestExpiresAt);

  return Boolean(
    requestedAt &&
    requestExpiresAt &&
    requestExpiresAt > now &&
    !isCancelled(metadata) &&
    !isExported(metadata) &&
    !activeLease(metadata, now),
  );
}

function deriveGmailExport(row: MailQueueDraftRow | undefined, now: Date) {
  if (!row) {
    return {
      exportStatus: "none" as MailQueueGmailExportStatus,
      canExport: false,
      exportedAt: null,
    };
  }

  const metadata = gmailExportMetadata(row);
  const exportedAt = parseDate(metadata.exportedAt);
  const structurallyReady = row.status === "draft" && hasText(row.subject) && hasText(row.textBody);
  const exported = isExported(metadata);
  const requested = activeRequest(metadata, now);
  const leased = activeLease(metadata, now);
  const blocked =
    staleLease(metadata, now) ||
    isCancelled(metadata) ||
    (hasGmailExportSignal(metadata) && !exported && !requested && !leased) ||
    row.status !== "draft" ||
    !hasText(row.subject) ||
    !hasText(row.textBody);

  let exportStatus: MailQueueGmailExportStatus = "not_exported";

  if (exported) {
    exportStatus = "exported";
  } else if (leased) {
    exportStatus = "leased";
  } else if (blocked) {
    exportStatus = "blocked";
  } else if (requested) {
    exportStatus = "requested";
  } else if (!hasGmailExportSignal(metadata)) {
    exportStatus = "not_exported";
  } else {
    exportStatus = "unknown";
  }

  return {
    exportStatus,
    canExport: requested && structurallyReady && !exported && !leased,
    exportedAt: exportedAt?.toISOString() ?? null,
  };
}

function draftTone(row: MailQueueDraftRow | undefined): string | null {
  const value = metadataRecord(row?.metadataJson).tone;
  return typeof value === "string" ? truncate(value, 80) : null;
}

function draftLanguage(
  row: MailQueueDraftRow | undefined,
  context: MailQueueWorkspaceContextRow,
): string | null {
  const metadataLanguage = metadataRecord(row?.metadataJson).language;

  return (
    (typeof metadataLanguage === "string" ? truncate(metadataLanguage, 80) : null) ??
    trimToNull(context?.language)
  );
}

function contactStatus(input: {
  classification: MailQueueClassificationRow;
  previousLeadCount: number;
}): MailQueueContactStatus {
  if (!input.classification.leadId) {
    return "unknown";
  }

  if (input.previousLeadCount > 0) {
    return "returning";
  }

  if (input.classification.leadContactId) {
    return "known";
  }

  return "new";
}

function derivePipelineState(input: {
  classification: MailQueueClassificationRow;
  score: ReturnType<typeof scoreDto>;
  draft: MailQueueDraftRow | undefined;
  gmailExport: ReturnType<typeof deriveGmailExport>;
}): MailQueuePipelineState {
  if (input.classification.action === "ignore") {
    return "ignored";
  }

  if (!input.classification.leadId && input.classification.action === "create_lead") {
    return "processing";
  }

  if (input.gmailExport.exportStatus === "exported") {
    return "exported";
  }

  if (input.gmailExport.exportStatus === "blocked") {
    return "blocked";
  }

  if (
    input.gmailExport.exportStatus === "requested" ||
    input.gmailExport.exportStatus === "leased"
  ) {
    return "export_requested";
  }

  if (input.draft && hasText(input.draft.subject) && hasText(input.draft.textBody)) {
    return "draft_ready";
  }

  if (input.score.score !== null) {
    return "scored";
  }

  if (input.classification.classificationId) {
    return "classified";
  }

  return "unknown";
}

function isUrgent(score: ReturnType<typeof scoreDto>): boolean {
  const value = `${score.urgency ?? ""} ${score.recommendedAction ?? ""}`.toLowerCase();
  return /\b(urgent|immediate|today|high|asap|10 minutes)\b/.test(value);
}

function deriveAttentionFlags(input: {
  classification: MailQueueClassificationRow;
  score: ReturnType<typeof scoreDto>;
  draft: MailQueueDraftRow | undefined;
  gmailExport: ReturnType<typeof deriveGmailExport>;
  contactStatus: MailQueueContactStatus;
  pipelineState: MailQueuePipelineState;
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

  if (input.classification.action === "ignore") {
    flags.add("ignored");
  }

  if (input.classification.action !== "ignore" && input.score.score === null) {
    flags.add("no_score");
  }

  if (input.classification.action !== "ignore" && !input.draft) {
    flags.add("no_draft");
  }

  if (input.pipelineState === "draft_ready") {
    flags.add("draft_ready");
  }

  if (
    input.gmailExport.exportStatus === "requested" ||
    input.gmailExport.exportStatus === "leased"
  ) {
    flags.add("export_requested");
  }

  if (input.gmailExport.exportStatus === "exported") {
    flags.add("exported");
  }

  if (input.gmailExport.exportStatus === "blocked") {
    flags.add("blocked");
  }

  if (
    input.now.getTime() - input.classification.classifiedAt.getTime() >
    STALE_MAIL_DAYS * 24 * 60 * 60 * 1000
  ) {
    flags.add("stale_mail");
  }

  if (input.contactStatus === "returning") {
    flags.add("returning_contact");
  }

  return [...flags];
}

function deriveNextBestAction(input: {
  classification: MailQueueClassificationRow;
  pipelineState: MailQueuePipelineState;
  draft: MailQueueDraftRow | undefined;
  gmailExport: ReturnType<typeof deriveGmailExport>;
  attentionFlags: string[];
}): MailQueueNextBestAction {
  if (input.classification.action === "ignore") {
    return "ignored";
  }

  if (
    input.gmailExport.exportStatus === "requested" ||
    input.gmailExport.exportStatus === "leased"
  ) {
    return "wait";
  }

  if (input.gmailExport.exportStatus === "exported") {
    return "wait";
  }

  if (input.gmailExport.exportStatus === "blocked") {
    return "review_now";
  }

  if (input.draft && input.pipelineState === "draft_ready") {
    return input.gmailExport.exportStatus === "not_exported" ? "request_export" : "view_draft";
  }

  if (input.attentionFlags.length > 0) {
    return "review_now";
  }

  return "unknown";
}

function mapItem(input: {
  classification: MailQueueClassificationRow;
  rows: MailQueueRows;
  now: Date;
}): MailQueueItem {
  const leadId = input.classification.leadId;
  const score = leadId ? input.rows.latestScoresByLeadId[leadId] : undefined;
  const draft = leadId ? input.rows.latestDraftsByLeadId[leadId] : undefined;
  const scoreData = scoreDto({ classification: input.classification, score });
  const previousLeadCount = leadId ? (input.rows.previousLeadCountsByLeadId[leadId] ?? 0) : 0;
  const resolvedContactStatus = contactStatus({
    classification: input.classification,
    previousLeadCount,
  });
  const gmailExport = deriveGmailExport(draft, input.now);
  const pipelineState = derivePipelineState({
    classification: input.classification,
    score: scoreData,
    draft,
    gmailExport,
  });
  const attentionFlags = deriveAttentionFlags({
    classification: input.classification,
    score: scoreData,
    draft,
    gmailExport,
    contactStatus: resolvedContactStatus,
    pipelineState,
    now: input.now,
  });

  return MailQueueItemSchema.parse({
    classificationId: input.classification.classificationId,
    classifiedAt: input.classification.classifiedAt.toISOString(),
    classification: {
      category: input.classification.category,
      action: input.classification.action,
      confidence: input.classification.confidence,
      reasonCode: input.classification.reasonCode,
    },
    lead: {
      leadId,
      leadCreatedAt: input.classification.leadCreatedAt?.toISOString() ?? null,
      leadStatus: input.classification.leadStatus,
    },
    score: scoreData,
    contact: {
      known: Boolean(input.classification.leadContactId),
      previousLeadCount,
      status: resolvedContactStatus,
    },
    draft: {
      draftId: draft?.draftId ?? null,
      status: draft?.status ?? null,
      hasSubject: hasText(draft?.subject),
      hasBodyText: hasText(draft?.textBody),
      subjectPreview: truncate(draft?.subject, 120),
      bodyPreview: truncate(draft?.textBody, 280),
      tone: draftTone(draft),
      language: draftLanguage(draft, input.rows.workspaceContext),
      createdAt: draft?.createdAt.toISOString() ?? null,
    },
    gmailExport,
    companyContext: contextDto(input.rows.workspaceContext),
    derived: {
      pipelineState,
      attentionFlags,
      nextBestAction: deriveNextBestAction({
        classification: input.classification,
        pipelineState,
        draft,
        gmailExport,
        attentionFlags,
      }),
    },
  });
}

function filteredItems(items: MailQueueItem[], query: MailQueueQuery): MailQueueItem[] {
  return items.filter((item) => {
    if (!query.includeIgnored && item.classification.action === "ignore") {
      return false;
    }

    if (query.category?.length && !query.category.includes(item.classification.category)) {
      return false;
    }

    if (query.action?.length && !query.action.includes(item.classification.action)) {
      return false;
    }

    if (query.scoreBand?.length && !query.scoreBand.includes(item.score.scoreBand)) {
      return false;
    }

    if (query.contactStatus?.length && !query.contactStatus.includes(item.contact.status)) {
      return false;
    }

    if (query.hasDraft !== undefined && Boolean(item.draft.draftId) !== query.hasDraft) {
      return false;
    }

    if (query.exportStatus?.length && !query.exportStatus.includes(item.gmailExport.exportStatus)) {
      return false;
    }

    if (query.pipelineState?.length && !query.pipelineState.includes(item.derived.pipelineState)) {
      return false;
    }

    if (query.attentionRequired === true && item.derived.attentionFlags.length === 0) {
      return false;
    }

    if (query.attentionRequired === false && item.derived.attentionFlags.length > 0) {
      return false;
    }

    return true;
  });
}

function summarize(items: MailQueueItem[]): MailQueueData["summary"] {
  return {
    totalClassified: items.length,
    totalIgnored: items.filter((item) => item.classification.action === "ignore").length,
    totalLeadsCreated: items.filter((item) => item.lead.leadId !== null).length,
    totalScored: items.filter((item) => item.score.score !== null).length,
    totalWithDraft: items.filter((item) => item.draft.draftId !== null).length,
    totalExportRequested: items.filter(
      (item) =>
        item.gmailExport.exportStatus === "requested" || item.gmailExport.exportStatus === "leased",
    ).length,
    totalExported: items.filter((item) => item.gmailExport.exportStatus === "exported").length,
    totalAttentionRequired: items.filter((item) => item.derived.attentionFlags.length > 0).length,
  };
}

function appliedFilters(input: {
  query: MailQueueQuery;
  since: Date;
}): MailQueueData["filters"]["applied"] {
  return {
    limit: input.query.limit,
    offset: input.query.offset,
    since: input.since.toISOString(),
    includeIgnored: input.query.includeIgnored,
    category: input.query.category ?? [],
    action: input.query.action ?? [],
    scoreBand: input.query.scoreBand ?? [],
    contactStatus: input.query.contactStatus ?? [],
    hasDraft: input.query.hasDraft ?? null,
    exportStatus: input.query.exportStatus ?? [],
    pipelineState: input.query.pipelineState ?? [],
    attentionRequired: input.query.attentionRequired ?? null,
  };
}

function assertNoForbiddenFields(value: unknown): void {
  const forbidden = new Set([
    "workspaceId",
    "workspace_id",
    "contactEmail",
    "fromEmail",
    "toEmail",
    "recipientEmail",
    "normalized_json",
    "metadata_json",
    "payload_json",
    "rawMetadata",
    "rawPayload",
    "providerMessageId",
    "provider_message_id",
    "providerPayload",
    "leaseToken",
    "apiKey",
    "plaintextApiKey",
    "keyHash",
    "prompt",
    "output",
    "threadId",
    "messageId",
    "externalId",
  ]);

  function visit(current: unknown): void {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }

    if (!isRecord(current)) {
      return;
    }

    for (const [key, child] of Object.entries(current)) {
      if (forbidden.has(key)) {
        throw new Error("Forbidden mail queue DTO field.");
      }

      visit(child);
    }
  }

  visit(value);
}

export function createMailQueueService(
  repository: MailQueueRepository = createProductionMailQueueRepository(),
  nowProvider: () => Date = () => new Date(),
): MailQueueService {
  return {
    async listMailQueue(workspaceId, query) {
      const now = nowProvider();
      const since = querySince(query, now);
      const rows = await repository.listRows({ workspaceId, since });
      const allItems = rows.classifications.map((classification) =>
        mapItem({ classification, rows, now }),
      );
      const filtered = filteredItems(allItems, query);
      const data = {
        generatedAt: now.toISOString(),
        filters: {
          applied: appliedFilters({ query, since }),
        },
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: filtered.length,
        },
        summary: summarize(allItems),
        items: filtered.slice(query.offset, query.offset + query.limit),
      };

      assertNoForbiddenFields(data);
      return data;
    },

    async getMailQueueDetail(workspaceId, classificationId) {
      const now = nowProvider();
      const rows = await repository.findDetailRows({ workspaceId, classificationId });
      const classification = rows.classifications[0];

      if (!classification) {
        return { result: "not_found" };
      }

      const detail = mapItem({ classification, rows, now });
      assertNoForbiddenFields(detail);
      return { result: "ok", detail };
    },
  };
}

export function createProductionMailQueueService(): MailQueueService {
  return createMailQueueService();
}
