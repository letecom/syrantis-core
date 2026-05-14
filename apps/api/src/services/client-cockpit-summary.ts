import {
  ClientCockpitSummaryDataSchema,
  type ClientCockpitGmailExportStatus,
  type ClientCockpitGmailIntakeStatus,
  type ClientCockpitQueueStatus,
  type ClientCockpitSummaryData,
} from "@syrantis/shared";

import {
  createProductionClientCockpitSummaryRepository,
  type ClientCockpitBackgroundJobRow,
  type ClientCockpitDraftRow,
  type ClientCockpitSummaryRepository,
} from "../repositories/client-cockpit-summary.js";

const WINDOW_HOURS = 24;
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;
const ATTENTION_PENDING_MINUTES = 30;

export type ClientCockpitSummaryService = {
  getSummary(workspaceId: string): Promise<ClientCockpitSummaryData>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function gmailExportMetadata(metadataJson: Record<string, unknown>): Record<string, unknown> {
  return metadataRecord(metadataJson.gmailExport);
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

function isExported(gmailExport: Record<string, unknown>): boolean {
  return gmailExport.status === "exported" || Boolean(parseDate(gmailExport.exportedAt));
}

function isCancelled(gmailExport: Record<string, unknown>): boolean {
  return gmailExport.status === "cancelled" || Boolean(parseDate(gmailExport.cancelledAt));
}

function hasGmailExportSignal(gmailExport: Record<string, unknown>): boolean {
  return [
    "status",
    "requestedAt",
    "requestExpiresAt",
    "leaseExpiresAt",
    "leaseToken",
    "exportedAt",
    "cancelledAt",
  ].some((key) => gmailExport[key] !== undefined && gmailExport[key] !== null);
}

function activeLease(gmailExport: Record<string, unknown>, now: Date): boolean {
  const leaseExpiresAt = parseDate(gmailExport.leaseExpiresAt);
  return typeof gmailExport.leaseToken === "string" && Boolean(leaseExpiresAt && leaseExpiresAt > now);
}

function staleLease(gmailExport: Record<string, unknown>, now: Date): boolean {
  const leaseExpiresAt = parseDate(gmailExport.leaseExpiresAt);
  return typeof gmailExport.leaseToken === "string" && Boolean(leaseExpiresAt && leaseExpiresAt <= now);
}

function activeRequest(gmailExport: Record<string, unknown>, now: Date): boolean {
  const requestedAt = parseDate(gmailExport.requestedAt);
  const requestExpiresAt = parseDate(gmailExport.requestExpiresAt);

  return Boolean(
    requestedAt &&
      requestExpiresAt &&
      requestExpiresAt > now &&
      !isCancelled(gmailExport) &&
      !isExported(gmailExport) &&
      !activeLease(gmailExport, now),
  );
}

function deriveGmailExport(
  drafts: ClientCockpitDraftRow[],
  input: { since: Date; now: Date },
): ClientCockpitSummaryData["gmailExport"] {
  let signalSeen = false;
  let pendingRequestCount = 0;
  let activeLeaseCount = 0;
  let staleLeaseCount = 0;
  let exported24h = 0;
  let lastExportedAtDate: Date | null = null;

  for (const draft of drafts) {
    const gmailExport = gmailExportMetadata(metadataRecord(draft.metadataJson));
    signalSeen ||= hasGmailExportSignal(gmailExport);

    if (isExported(gmailExport)) {
      const exportedAt = parseDate(gmailExport.exportedAt);

      if (exportedAt) {
        if (exportedAt >= input.since) {
          exported24h += 1;
        }

        if (!lastExportedAtDate || exportedAt > lastExportedAtDate) {
          lastExportedAtDate = exportedAt;
        }
      }

      continue;
    }

    if (activeLease(gmailExport, input.now)) {
      activeLeaseCount += 1;
      continue;
    }

    if (staleLease(gmailExport, input.now)) {
      staleLeaseCount += 1;
      continue;
    }

    if (activeRequest(gmailExport, input.now)) {
      pendingRequestCount += 1;
    }
  }

  let status: ClientCockpitGmailExportStatus = "unknown";

  if (staleLeaseCount > 0) {
    status = "attention_required";
  } else if (activeLeaseCount > 0) {
    status = "leased";
  } else if (pendingRequestCount > 0) {
    status = "requested";
  } else if (exported24h > 0) {
    status = "exported_recently";
  } else if (signalSeen) {
    status = "idle";
  }

  return {
    status,
    pendingRequestCount,
    activeLeaseCount,
    staleLeaseCount,
    exported24h,
    lastExportedAt: lastExportedAtDate?.toISOString() ?? null,
  };
}

function deriveGmailIntake(input: {
  lastIntakeAt: Date | null;
  leadsReceived24h: number;
  since: Date;
}): ClientCockpitSummaryData["gmailIntake"] {
  let status: ClientCockpitGmailIntakeStatus = "unknown";

  if (input.lastIntakeAt && input.lastIntakeAt >= input.since) {
    status = "activity_seen";
  } else if (input.lastIntakeAt) {
    status = "no_recent_activity";
  }

  return {
    status,
    lastIntakeAt: input.lastIntakeAt?.toISOString() ?? null,
    leadsReceived24h: input.leadsReceived24h,
  };
}

function dueAt(job: ClientCockpitBackgroundJobRow): Date {
  return job.scheduledAt ?? job.runAfter;
}

function deriveSystem(
  jobs: ClientCockpitBackgroundJobRow[],
  input: { since: Date; now: Date; staleLeaseCount: number },
): ClientCockpitSummaryData["system"] {
  const pendingReadyJobs = jobs.filter(
    (job) => job.status === "pending" && dueAt(job) <= input.now,
  );
  const runningJobs = jobs.filter((job) => job.status === "running");
  const failedJobs24h = jobs.filter(
    (job) =>
      job.status === "failed" && (job.createdAt >= input.since || job.updatedAt >= input.since),
  );
  const oldestPendingDueAt = pendingReadyJobs
    .map(dueAt)
    .sort((left, right) => left.getTime() - right.getTime())[0];
  const oldestPendingJobMinutes = oldestPendingDueAt
    ? Math.max(0, Math.floor((input.now.getTime() - oldestPendingDueAt.getTime()) / 60_000))
    : null;

  let queueStatus: ClientCockpitQueueStatus = "clear";

  if (
    failedJobs24h.length > 0 ||
    input.staleLeaseCount > 0 ||
    (oldestPendingJobMinutes !== null && oldestPendingJobMinutes > ATTENTION_PENDING_MINUTES)
  ) {
    queueStatus = "attention_required";
  } else if (pendingReadyJobs.length > 0 || runningJobs.length > 0) {
    queueStatus = "busy";
  }

  return {
    queueStatus,
    pendingReadyJobs: pendingReadyJobs.length,
    runningJobs: runningJobs.length,
    failedJobs24h: failedJobs24h.length,
    oldestPendingJobMinutes,
  };
}

export function createClientCockpitSummaryService(
  repository: ClientCockpitSummaryRepository = createProductionClientCockpitSummaryRepository(),
  nowProvider: () => Date = () => new Date(),
): ClientCockpitSummaryService {
  return {
    async getSummary(workspaceId) {
      const now = nowProvider();
      const since = new Date(now.getTime() - WINDOW_MS);
      const rows = await repository.getSummaryRows({ workspaceId, since });
      const workspaceLeads = rows.leads.filter((row) => row.workspaceId === workspaceId);
      const workspaceLeadScores = rows.leadScores.filter((row) => row.workspaceId === workspaceId);
      const workspaceDrafts = rows.drafts.filter((row) => row.workspaceId === workspaceId);
      const workspaceJobs = rows.backgroundJobs.filter((row) => row.workspaceId === workspaceId);
      const scoredLeadIds = new Set(
        workspaceLeadScores.filter((row) => row.createdAt >= since).map((row) => row.leadId),
      );
      const lastIntakeAt =
        workspaceLeads
          .map((row) => row.createdAt)
          .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
      const gmailExport = deriveGmailExport(workspaceDrafts, { since, now });
      const system = deriveSystem(workspaceJobs, {
        since,
        now,
        staleLeaseCount: gmailExport.staleLeaseCount,
      });

      return ClientCockpitSummaryDataSchema.parse({
        generatedAt: now.toISOString(),
        window: {
          since: since.toISOString(),
          hours: WINDOW_HOURS,
        },
        pipeline: {
          leads24h: workspaceLeads.filter((row) => row.createdAt >= since).length,
          scoredLeads24h: scoredLeadIds.size,
          draftsGenerated24h: workspaceDrafts.filter((row) => row.createdAt >= since).length,
          pendingDrafts: workspaceDrafts.filter((row) => row.status === "draft").length,
        },
        gmailExport,
        gmailIntake: deriveGmailIntake({
          lastIntakeAt,
          leadsReceived24h: workspaceLeads.filter((row) => row.createdAt >= since).length,
          since,
        }),
        googleSheets: {
          status: "unknown",
        },
        system,
        actions: [
          {
            label: "Open Gmail Export Ops",
            href: "/app/gmail-export",
            kind: "primary",
            reason: null,
          },
          {
            label: "Open Client Install",
            href: "/app/client-install",
            kind: "secondary",
            reason: null,
          },
          {
            label: "Draft Queue",
            href: "/app/client-drafts",
            kind: "disabled",
            reason: "Coming in a later issue.",
          },
        ],
      });
    },
  };
}

export function createProductionClientCockpitSummaryService(): ClientCockpitSummaryService {
  return createClientCockpitSummaryService();
}
