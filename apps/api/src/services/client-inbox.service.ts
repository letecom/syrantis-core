import {
  ClientInboxDraftEditResponseSchema,
  ClientInboxMessageDetailSchema,
  ClientInboxMessageItemSchema,
  type ClientInboxCategory,
  type ClientInboxContactStatus,
  type ClientInboxDraftEditInput,
  type ClientInboxDraftEditResponse,
  type ClientInboxDraftStatus,
  type ClientInboxGmailExportStatus,
  type ClientInboxMessageDetail,
  type ClientInboxMessageItem,
  type ClientInboxPipelineState,
  type ClientInboxQuery,
  type ClientInboxScoreBand,
} from "@syrantis/shared";

import {
  createProductionClientInboxRepository,
  type ClientInboxDraftRow,
  type ClientInboxMailDetailRow,
  type ClientInboxMailRow,
  type ClientInboxRepository,
  type ClientInboxRows,
  type ClientInboxScoreRow,
} from "../repositories/client-inbox.repository.js";
import {
  createProductionGmailExportRequestService,
  type GmailExportCancelServiceResult,
  type GmailExportRequestService,
  type GmailExportRequestServiceResult,
} from "./gmail-export-request.js";

const HIGH_SCORE_MINIMUM = 75;

export type ClientInboxListResult = {
  generatedAt: string;
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
  items: ClientInboxMessageItem[];
};

export type ClientInboxDetailResult =
  | { result: "ok"; detail: ClientInboxMessageDetail }
  | { result: "not_found" };

export type ClientInboxDraftEditServiceResult =
  | { result: "ok"; data: ClientInboxDraftEditResponse["data"] }
  | { result: "not_found" }
  | { result: "no_draft" };

export type ClientInboxGmailExportActionResult =
  | GmailExportRequestServiceResult
  | GmailExportCancelServiceResult
  | { result: "no_draft" };

export type ClientInboxService = {
  listMessages(workspaceId: string, query: ClientInboxQuery): Promise<ClientInboxListResult>;
  getMessageDetail(workspaceId: string, mailItemId: string): Promise<ClientInboxDetailResult>;
  updateDraft(
    workspaceId: string,
    actorUserId: string,
    mailItemId: string,
    input: ClientInboxDraftEditInput,
  ): Promise<ClientInboxDraftEditServiceResult>;
  requestGmailExport(
    workspaceId: string,
    actorUserId: string,
    mailItemId: string,
  ): Promise<ClientInboxGmailExportActionResult>;
  cancelGmailExport(
    workspaceId: string,
    actorUserId: string,
    mailItemId: string,
  ): Promise<ClientInboxGmailExportActionResult>;
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

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function scoreBandFromScore(score: number | null): ClientInboxScoreBand {
  if (score === null) {
    return "unknown";
  }

  if (score >= 75) {
    return "hot";
  }

  return score >= 45 ? "warm" : "cold";
}

function scoreBand(row: ClientInboxScoreRow | undefined): ClientInboxScoreBand {
  if (!row) {
    return "unknown";
  }

  if (row.qualification === "cold" || row.qualification === "warm" || row.qualification === "hot") {
    return row.qualification;
  }

  return scoreBandFromScore(row.score);
}

function category(rawCategory: string | null | undefined): ClientInboxCategory {
  const value = String(rawCategory ?? "").toLowerCase();

  if (value.includes("quote")) {
    return "quote_request";
  }

  if (value.includes("urgent") || value.includes("service")) {
    return "urgent_service";
  }

  if (value.includes("newsletter") || value.includes("marketing")) {
    return "newsletter";
  }

  if (
    value.includes("notification") ||
    value.includes("invoice") ||
    value.includes("spam") ||
    value.includes("job")
  ) {
    return "system";
  }

  if (value.includes("customer") || value.includes("appointment") || value.includes("business")) {
    return "follow_up";
  }

  return "unknown";
}

function urgency(input: {
  reasonCode: string | null;
  suggestedLabels: string[] | null;
  score: ClientInboxScoreRow | undefined;
}): string | null {
  const value = [
    input.reasonCode ?? "",
    ...(input.suggestedLabels ?? []),
    input.score?.recommendedAction ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return /\b(urgent|immediate|today|high|asap|10 minutes|depannage|fuite|panne)\b/.test(value)
    ? "high"
    : null;
}

function senderDisplay(row: ClientInboxMailRow): string | null {
  return (
    truncate(row.fromDisplay, 120) ??
    truncate([row.contactFirstName, row.contactLastName].filter(Boolean).join(" "), 120)
  );
}

function draftForMail(
  row: ClientInboxMailRow,
  rows: ClientInboxRows,
): ClientInboxDraftRow | undefined {
  if (row.draftId && rows.draftsById[row.draftId]) {
    return rows.draftsById[row.draftId];
  }

  return row.leadId ? rows.latestDraftsByLeadId[row.leadId] : undefined;
}

function gmailExportMetadata(row: ClientInboxDraftRow | undefined): Record<string, unknown> {
  return metadataRecord(metadataRecord(row?.metadataJson).gmailExport);
}

function deriveGmailExport(row: ClientInboxDraftRow | undefined, now: Date) {
  if (!row) {
    return {
      status: "none" as ClientInboxGmailExportStatus,
      requestedAt: null,
      exportedAt: null,
      blockingReasons: [] as string[],
      canRequest: false,
      canCancel: false,
      canExport: false,
    };
  }

  const metadata = gmailExportMetadata(row);
  const requestedAt = parseDate(metadata.requestedAt);
  const requestExpiresAt = parseDate(metadata.requestExpiresAt);
  const exportedAt = parseDate(metadata.exportedAt);
  const cancelledAt = parseDate(metadata.cancelledAt);
  const leaseExpiresAt = parseDate(metadata.leaseExpiresAt);
  const activeLease = typeof metadata.leaseToken === "string" && Boolean(leaseExpiresAt && leaseExpiresAt > now);
  const staleLease = typeof metadata.leaseToken === "string" && Boolean(leaseExpiresAt && leaseExpiresAt <= now);
  const exported = metadata.status === "exported" || Boolean(exportedAt);
  const cancelled = metadata.status === "cancelled" || Boolean(cancelledAt);
  const activeRequest = Boolean(
    requestedAt &&
      requestExpiresAt &&
      requestExpiresAt > now &&
      !cancelled &&
      !exported &&
      !activeLease,
  );
  const hasSubject = hasText(row.subject);
  const hasBody = hasText(row.textBody);
  const reasons: string[] = [];

  if (row.status !== "draft") {
    reasons.push("draft_not_ready");
  }

  if (!hasSubject) {
    reasons.push("missing_subject");
  }

  if (!hasBody) {
    reasons.push("missing_body");
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

  let status: ClientInboxGmailExportStatus = "not_exported";

  if (exported) {
    status = "exported";
  } else if (activeLease) {
    status = "leased";
  } else if (reasons.some((reason) => !["export_not_requested"].includes(reason))) {
    status = "blocked";
  } else if (activeRequest) {
    status = "requested";
  }

  const structurallyReady = row.status === "draft" && hasSubject && hasBody;

  return {
    status,
    requestedAt: requestedAt?.toISOString() ?? null,
    exportedAt: exportedAt?.toISOString() ?? null,
    blockingReasons: reasons,
    canRequest: structurallyReady && (status === "not_exported" || status === "blocked"),
    canCancel: status === "requested",
    canExport: structurallyReady && status === "requested",
  };
}

function draftStatus(input: {
  draft: ClientInboxDraftRow | undefined;
  gmailExport: ReturnType<typeof deriveGmailExport>;
}): ClientInboxDraftStatus {
  if (!input.draft) {
    return "no_draft";
  }

  if (input.gmailExport.status === "exported") {
    return "exported";
  }

  if (input.gmailExport.status === "requested" || input.gmailExport.status === "leased") {
    return "requested";
  }

  if (input.gmailExport.status === "blocked") {
    return "blocked";
  }

  return hasText(input.draft.subject) && hasText(input.draft.textBody) ? "ready" : "blocked";
}

function previousLeadCount(row: ClientInboxMailRow, rows: ClientInboxRows): number {
  if (!row.contactId) {
    return 0;
  }

  return Math.max(0, (rows.previousLeadCountsByContactId[row.contactId] ?? 0) - (row.leadId ? 1 : 0));
}

function previousThreadCount(row: ClientInboxMailRow, rows: ClientInboxRows): number {
  if (!row.contactId) {
    return 0;
  }

  return Math.max(0, (rows.previousThreadCountsByContactId[row.contactId] ?? 0) - 1);
}

function contactStatus(input: {
  row: ClientInboxMailRow;
  rows: ClientInboxRows;
}): ClientInboxContactStatus {
  const priorLeads = previousLeadCount(input.row, input.rows);
  const priorThreads = previousThreadCount(input.row, input.rows);

  if (priorLeads > 0 || priorThreads > 0) {
    return "returning";
  }

  if (input.row.contactId) {
    return "new_contact";
  }

  return "unknown";
}

function pipelineState(input: {
  row: ClientInboxMailRow;
  score: ClientInboxScoreRow | undefined;
  draft: ClientInboxDraftRow | undefined;
  draftStatus: ClientInboxDraftStatus;
  gmailExport: ReturnType<typeof deriveGmailExport>;
}): ClientInboxPipelineState {
  if (input.row.action === "ignore") {
    return "ignored";
  }

  if (input.gmailExport.status === "exported") {
    return "exported";
  }

  if (input.gmailExport.status === "blocked" || input.draftStatus === "blocked") {
    return "blocked";
  }

  if (input.gmailExport.status === "requested" || input.gmailExport.status === "leased") {
    return "export_requested";
  }

  if (input.draftStatus === "ready") {
    return "draft_ready";
  }

  if (input.score) {
    return "scored";
  }

  if (input.row.classificationId) {
    return "classified";
  }

  return "unknown";
}

function attentionFlags(input: {
  row: ClientInboxMailRow;
  scoreBand: ClientInboxScoreBand;
  score: number | null;
  urgency: string | null;
  contactStatus: ClientInboxContactStatus;
  draftStatus: ClientInboxDraftStatus;
  gmailExport: ReturnType<typeof deriveGmailExport>;
}): string[] {
  const flags = new Set<string>();

  if (input.scoreBand === "hot" || (input.score !== null && input.score >= HIGH_SCORE_MINIMUM)) {
    flags.add("high_score");
  }

  if (input.urgency === "high") {
    flags.add("urgent_action");
  }

  if (input.row.action === "ignore") {
    flags.add("ignored");
  }

  if (input.row.action !== "ignore" && input.draftStatus === "no_draft") {
    flags.add("no_draft");
  }

  if (input.draftStatus === "ready") {
    flags.add("draft_ready");
  }

  if (input.gmailExport.status === "requested" || input.gmailExport.status === "leased") {
    flags.add("export_requested");
  }

  if (input.gmailExport.status === "exported") {
    flags.add("exported");
  }

  if (input.draftStatus === "blocked" || input.gmailExport.status === "blocked") {
    flags.add("blocked");
  }

  if (input.contactStatus === "returning") {
    flags.add("returning_contact");
  }

  return [...flags];
}

function mapItem(input: {
  row: ClientInboxMailRow;
  rows: ClientInboxRows;
  now: Date;
}): ClientInboxMessageItem {
  const score = input.row.leadId ? input.rows.latestScoresByLeadId[input.row.leadId] : undefined;
  const draft = draftForMail(input.row, input.rows);
  const resolvedScoreBand = scoreBand(score);
  const resolvedUrgency = urgency({
    reasonCode: input.row.reasonCode,
    suggestedLabels: input.row.suggestedLabels,
    score,
  });
  const gmailExport = deriveGmailExport(draft, input.now);
  const resolvedDraftStatus = draftStatus({ draft, gmailExport });
  const resolvedContactStatus = contactStatus({ row: input.row, rows: input.rows });
  const resolvedPipelineState = pipelineState({
    row: input.row,
    score,
    draft,
    draftStatus: resolvedDraftStatus,
    gmailExport,
  });
  const flags = attentionFlags({
    row: input.row,
    scoreBand: resolvedScoreBand,
    score: score?.score ?? null,
    urgency: resolvedUrgency,
    contactStatus: resolvedContactStatus,
    draftStatus: resolvedDraftStatus,
    gmailExport,
  });

  return ClientInboxMessageItemSchema.parse({
    mailItemId: input.row.mailItemId,
    classificationId: input.row.classificationId,
    leadId: input.row.leadId,
    draftId: draft?.draftId ?? null,
    receivedAt: toIso(input.row.receivedAt ?? input.row.createdAt),
    senderDisplay: senderDisplay(input.row),
    companyDisplay: truncate(input.row.companyName, 120),
    subject: null,
    snippet: null,
    score: score?.score ?? null,
    scoreBand: resolvedScoreBand,
    category: category(input.row.category),
    intent: truncate(input.row.reasonCode || input.row.category, 120),
    urgency: resolvedUrgency,
    contactStatus: resolvedContactStatus,
    previousThreadCount: previousThreadCount(input.row, input.rows),
    draftStatus: resolvedDraftStatus,
    gmailExportStatus: gmailExport.status,
    pipelineState: resolvedPipelineState,
    attentionFlags: flags,
    needsReview:
      input.row.action === "review" ||
      (input.row.action !== "ignore" && (flags.length > 0 || resolvedDraftStatus !== "ready")),
  });
}

function filteredItems(items: ClientInboxMessageItem[], query: ClientInboxQuery): ClientInboxMessageItem[] {
  return items.filter((item) => {
    if (query.tab === "ignored" && item.pipelineState !== "ignored") {
      return false;
    }

    if (query.tab === "needs_review" && !item.needsReview) {
      return false;
    }

    if (query.tab === "hot" && item.scoreBand !== "hot") {
      return false;
    }

    if (query.tab === "existing_contact" && !["existing_contact", "returning"].includes(item.contactStatus)) {
      return false;
    }

    if (query.tab === "ready_draft" && item.draftStatus !== "ready") {
      return false;
    }

    if (query.tab !== "ignored" && query.tab !== "all" && item.pipelineState === "ignored") {
      return false;
    }

    if (query.scoreBand && item.scoreBand !== query.scoreBand) {
      return false;
    }

    if (query.category && item.category !== query.category) {
      return false;
    }

    if (query.contactStatus && item.contactStatus !== query.contactStatus) {
      return false;
    }

    if (query.draftStatus && item.draftStatus !== query.draftStatus) {
      return false;
    }

    return true;
  });
}

function sortedItems(items: ClientInboxMessageItem[], query: ClientInboxQuery): ClientInboxMessageItem[] {
  return [...items].sort((left, right) => {
    if (query.sort === "score") {
      const score = (right.score ?? -1) - (left.score ?? -1);
      if (score !== 0) {
        return score;
      }
    }

    if (query.sort === "urgency") {
      const urgent = Number(right.urgency === "high") - Number(left.urgency === "high");
      if (urgent !== 0) {
        return urgent;
      }
    }

    return (
      new Date(right.receivedAt ?? 0).getTime() - new Date(left.receivedAt ?? 0).getTime() ||
      right.mailItemId.localeCompare(left.mailItemId)
    );
  });
}

function safeStringArray(value: unknown, maxLength = 160): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => (item.length > maxLength ? item.slice(0, maxLength).trimEnd() : item))
    : [];
}

function safeAttachments(value: unknown[]): Array<{
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
}> {
  return value
    .filter(isRecord)
    .slice(0, 20)
    .map((item) => ({
      filename: typeof item.filename === "string" ? truncate(item.filename, 255) : null,
      mimeType: typeof item.mimeType === "string" ? truncate(item.mimeType, 120) : null,
      sizeBytes: typeof item.sizeBytes === "number" && item.sizeBytes >= 0 ? Math.floor(item.sizeBytes) : null,
    }));
}

function draftSource(row: ClientInboxDraftRow | undefined): string | null {
  const metadata = metadataRecord(row?.metadataJson);
  const editSource = metadata.editSource;
  const origin = metadata.origin;

  return typeof editSource === "string"
    ? truncate(editSource, 80)
    : typeof origin === "string"
      ? truncate(origin, 80)
      : null;
}

function editedAt(row: ClientInboxDraftRow | undefined): string | null {
  const metadata = metadataRecord(row?.metadataJson);
  const parsed = parseDate(metadata.editedAt);
  return parsed?.toISOString() ?? null;
}

function policyMatchScore(row: ClientInboxDraftRow | undefined): number | null {
  const value = metadataRecord(row?.metadataJson).policyMatchScore;
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function mapDetail(input: {
  row: ClientInboxMailDetailRow;
  rows: ClientInboxRows<ClientInboxMailDetailRow>;
  now: Date;
}): ClientInboxMessageDetail {
  const baseItem = mapItem({ row: input.row, rows: input.rows, now: input.now });
  const draft = draftForMail(input.row, input.rows);
  const gmailExport = deriveGmailExport(draft, input.now);
  const contextJson = metadataRecord(input.rows.workspaceContext?.contextJson);
  const responsePolicy = metadataRecord(contextJson.responsePolicy);
  const contactId = input.row.contactId;

  return ClientInboxMessageDetailSchema.parse({
    mail: {
      mailItemId: input.row.mailItemId,
      subject: input.row.subject,
      fromDisplay: input.row.fromDisplay,
      fromEmail: input.row.fromEmail,
      toDisplay: input.row.toDisplay,
      toEmail: input.row.toEmail,
      receivedAt: toIso(input.row.receivedAt ?? input.row.createdAt),
      bodyText: input.row.bodyText,
      snippet: input.row.snippet,
      attachments: safeAttachments(input.row.attachmentsJson),
    },
    analysis: {
      category: baseItem.category,
      action: input.row.action,
      reasonCode: input.row.reasonCode,
      intent: baseItem.intent,
      urgency: baseItem.urgency,
      score: baseItem.score,
      scoreBand: baseItem.scoreBand,
      confidence: input.row.leadId ? (input.rows.latestScoresByLeadId[input.row.leadId]?.confidence ?? null) : null,
      recommendedAction: input.row.leadId
        ? truncate(input.rows.latestScoresByLeadId[input.row.leadId]?.recommendedAction, 240)
        : null,
      attentionFlags: baseItem.attentionFlags,
    },
    contactContext: {
      contactKnown: Boolean(input.row.contactId),
      contactStatus: baseItem.contactStatus,
      previousLeadCount: previousLeadCount(input.row, input.rows),
      previousThreadCount: previousThreadCount(input.row, input.rows),
      lastInboundAt: contactId ? toIso(input.rows.lastInboundAtByContactId[contactId] ?? null) : null,
      lastOutboundAt: contactId
        ? toIso(input.rows.lastOutboundByContactId[contactId]?.createdAt ?? null)
        : null,
      lastOutboundStatus: contactId
        ? (input.rows.lastOutboundByContactId[contactId]?.deliveryStatus ??
          input.rows.lastOutboundByContactId[contactId]?.status ??
          null)
        : null,
    },
    companyPolicyContext: {
      companyName: trimToNull(input.rows.workspaceContext?.companyName),
      sector: trimToNull(input.rows.workspaceContext?.sector),
      language: trimToNull(input.rows.workspaceContext?.language),
      tone:
        typeof responsePolicy.tone === "string"
          ? truncate(responsePolicy.tone, 120)
          : typeof contextJson.tone === "string"
            ? truncate(contextJson.tone, 120)
            : null,
      keyRulesMatched: [],
      missingInfo: input.rows.workspaceContext ? [] : ["company_context_missing"],
      forbiddenClaims: safeStringArray(responsePolicy.forbiddenClaims),
    },
    draft: {
      draftId: draft?.draftId ?? null,
      subject: draft?.subject ?? null,
      bodyText: draft?.textBody ?? null,
      status: draft?.status ?? null,
      generatedAt: toIso(draft?.createdAt),
      editedAt: editedAt(draft),
      source: draftSource(draft),
      policyMatchScore: policyMatchScore(draft),
      canEdit: Boolean(draft && draft.status === "draft"),
      canRewrite: false,
      canExportToGmail: gmailExport.canRequest || gmailExport.canExport,
    },
    gmailExport: {
      status: gmailExport.status,
      requestedAt: gmailExport.requestedAt,
      exportedAt: gmailExport.exportedAt,
      blockingReasons: gmailExport.blockingReasons,
    },
    actions: {
      canEditDraft: Boolean(draft && draft.status === "draft"),
      canRequestGmailExport: gmailExport.canRequest,
      canCancelGmailExport: gmailExport.canCancel,
      canRewriteLater: Boolean(draft),
      canSendDirectLater: false,
    },
  });
}

function assertNoForbiddenFields(value: unknown, options: { allowDetailMailFields?: boolean } = {}): void {
  const forbidden = new Set([
    "workspaceId",
    "workspace_id",
    "metadataJson",
    "metadata_json",
    "normalizedJson",
    "normalized_json",
    "payloadJson",
    "payload_json",
    "rawMetadata",
    "rawPayload",
    "providerMessageId",
    "provider_message_id",
    "providerPayload",
    "externalId",
    "external_id",
    "externalThreadId",
    "threadId",
    "messageId",
    "leaseToken",
    "apiKey",
    "plaintextApiKey",
    "keyHash",
    "prompt",
    "output",
  ]);

  function visit(current: unknown, path: string[]): void {
    if (Array.isArray(current)) {
      current.forEach((child, index) => visit(child, [...path, String(index)]));
      return;
    }

    if (!isRecord(current)) {
      return;
    }

    for (const [key, child] of Object.entries(current)) {
      const joined = [...path, key].join(".");
      const allowedDetailMailField =
        options.allowDetailMailFields &&
        ["mail.bodyText", "mail.fromEmail", "mail.toEmail", "draft.bodyText"].includes(joined);

      if (!allowedDetailMailField && forbidden.has(key)) {
        throw new Error(`Forbidden client inbox DTO field: ${joined}`);
      }

      if (
        !options.allowDetailMailFields &&
        (key === "bodyText" || key === "fromEmail" || key === "toEmail")
      ) {
        throw new Error(`Forbidden client inbox list DTO field: ${joined}`);
      }

      visit(child, [...path, key]);
    }
  }

  visit(value, []);
}

export function createClientInboxService(
  repository: ClientInboxRepository = createProductionClientInboxRepository(),
  gmailExportRequestService: GmailExportRequestService = createProductionGmailExportRequestService(),
  nowProvider: () => Date = () => new Date(),
): ClientInboxService {
  return {
    async listMessages(workspaceId, query) {
      const now = nowProvider();
      const rows = await repository.listRows({ workspaceId });
      const allItems = rows.mails.map((row) => mapItem({ row, rows, now }));
      const filtered = sortedItems(filteredItems(allItems, query), query);
      const data = {
        generatedAt: now.toISOString(),
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: filtered.length,
        },
        items: filtered.slice(query.offset, query.offset + query.limit),
      };

      assertNoForbiddenFields(data);
      return data;
    },

    async getMessageDetail(workspaceId, mailItemId) {
      const now = nowProvider();
      const rows = await repository.findDetailRows({ workspaceId, mailItemId });
      const row = rows.mails[0];

      if (!row) {
        return { result: "not_found" };
      }

      const detail = mapDetail({ row, rows, now });
      assertNoForbiddenFields(detail, { allowDetailMailFields: true });

      return { result: "ok", detail };
    },

    async updateDraft(workspaceId, actorUserId, mailItemId, input) {
      const result = await repository.updateDraftFromMailItem({
        workspaceId,
        actorUserId,
        mailItemId,
        data: input,
      });

      if (result.result === "mail_not_found") {
        return { result: "not_found" };
      }

      if (result.result === "no_draft") {
        return { result: "no_draft" };
      }

      return {
        result: "ok",
        data: ClientInboxDraftEditResponseSchema.parse({
          success: true,
          data: {
            mailItemId: result.mailItemId,
            draftId: result.draftId,
            status: result.status,
            updatedAt: result.updatedAt.toISOString(),
            canExportToGmail: result.status === "draft",
          },
        }).data,
      };
    },

    async requestGmailExport(workspaceId, actorUserId, mailItemId) {
      const resolution = await repository.resolveDraftForMailItem({ workspaceId, mailItemId });

      if (resolution.result === "mail_not_found") {
        return { result: "not_found" };
      }

      if (resolution.result === "no_draft") {
        return { result: "no_draft" };
      }

      return gmailExportRequestService.requestGmailExport(
        workspaceId,
        actorUserId,
        resolution.draftId,
      );
    },

    async cancelGmailExport(workspaceId, actorUserId, mailItemId) {
      const resolution = await repository.resolveDraftForMailItem({ workspaceId, mailItemId });

      if (resolution.result === "mail_not_found") {
        return { result: "not_found" };
      }

      if (resolution.result === "no_draft") {
        return { result: "no_draft" };
      }

      return gmailExportRequestService.cancelGmailExport(
        workspaceId,
        actorUserId,
        resolution.draftId,
      );
    },
  };
}

export function createProductionClientInboxService(): ClientInboxService {
  return createClientInboxService();
}
