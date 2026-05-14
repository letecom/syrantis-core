import { randomUUID } from "node:crypto";

import type { GmailExportStaleLeaseExpireData, GmailExportStaleLeaseItem } from "@syrantis/shared";

import {
  createProductionGmailExportStaleLeaseRepository,
  type GmailExportStaleLeaseDraftRow,
  type GmailExportStaleLeaseRepository,
} from "../repositories/gmail-export-stale-lease.repository.js";

export const GMAIL_EXPORT_STALE_LEASE_CONFIRM = "EXPIRE_STALE_GMAIL_EXPORT_LEASES";

export type GmailExportStaleLeaseServiceResult =
  | { result: "ok"; data: GmailExportStaleLeaseExpireData }
  | { result: "invalid_confirm" };

export type GmailExportStaleLeaseService = {
  expireStaleLeases(input: {
    workspaceId: string;
    actorUserId: string;
    dryRun: boolean;
    maxLimit: number;
    confirm?: string;
  }): Promise<GmailExportStaleLeaseServiceResult>;
};

type ExpirableLease = {
  action: "would_expire";
  previousLeaseExpiresAt: string;
  nextMetadataJson: Record<string, unknown>;
};

type ClassifiedLease =
  | ExpirableLease
  | {
      action:
        | "skipped_active"
        | "skipped_exported"
        | "skipped_cancelled"
        | "skipped_invalid_metadata";
      previousLeaseExpiresAt: string | null;
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

function parseMetadataDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasLeaseToken(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasLeaseSignal(gmailExport: Record<string, unknown>): boolean {
  return (
    hasLeaseToken(gmailExport.leaseToken) ||
    gmailExport.status === "leased" ||
    gmailExport.leaseExpiresAt !== undefined
  );
}

function isExported(gmailExport: Record<string, unknown>): boolean {
  return gmailExport.status === "exported" || Boolean(parseMetadataDate(gmailExport.exportedAt));
}

function isCancelled(gmailExport: Record<string, unknown>): boolean {
  return gmailExport.status === "cancelled" || Boolean(parseMetadataDate(gmailExport.cancelledAt));
}

function clearedLeaseMetadata(metadataJson: Record<string, unknown>): Record<string, unknown> {
  const gmailExport = gmailExportMetadata(metadataJson);
  const nextGmailExport: Record<string, unknown> = {
    ...gmailExport,
    leaseToken: null,
    leaseExpiresAt: null,
  };

  if (nextGmailExport.status === "leased") {
    nextGmailExport.status = parseMetadataDate(gmailExport.requestedAt) ? "requested" : null;
  }

  return {
    ...metadataJson,
    gmailExport: nextGmailExport,
  };
}

export function classifyGmailExportStaleLease(
  row: GmailExportStaleLeaseDraftRow,
  now: Date,
): ClassifiedLease | null {
  const metadataJson = metadataRecord(row.metadataJson);
  const gmailExport = gmailExportMetadata(metadataJson);

  if (!hasLeaseSignal(gmailExport)) {
    return null;
  }

  const leaseExpiresAt = parseMetadataDate(gmailExport.leaseExpiresAt);
  const previousLeaseExpiresAt = leaseExpiresAt?.toISOString() ?? null;

  if (isExported(gmailExport)) {
    return { action: "skipped_exported", previousLeaseExpiresAt };
  }

  if (isCancelled(gmailExport)) {
    return { action: "skipped_cancelled", previousLeaseExpiresAt };
  }

  if (
    !leaseExpiresAt ||
    (!hasLeaseToken(gmailExport.leaseToken) && gmailExport.status !== "leased")
  ) {
    return { action: "skipped_invalid_metadata", previousLeaseExpiresAt };
  }

  if (leaseExpiresAt > now) {
    return { action: "skipped_active", previousLeaseExpiresAt };
  }

  return {
    action: "would_expire",
    previousLeaseExpiresAt: leaseExpiresAt.toISOString(),
    nextMetadataJson: clearedLeaseMetadata(metadataJson),
  };
}

function resultCounts(
  items: GmailExportStaleLeaseItem[],
): Pick<GmailExportStaleLeaseExpireData, "expired" | "skipped"> {
  const expired = items.filter((item) => item.action === "expired").length;
  const skipped = items.filter((item) => item.action.startsWith("skipped_")).length;

  return {
    expired,
    skipped,
  };
}

export function createGmailExportStaleLeaseService(
  repository: GmailExportStaleLeaseRepository = createProductionGmailExportStaleLeaseRepository(),
  nowProvider: () => Date = () => new Date(),
  traceIdProvider: () => string = randomUUID,
): GmailExportStaleLeaseService {
  return {
    async expireStaleLeases(input) {
      if (!input.dryRun && input.confirm !== GMAIL_EXPORT_STALE_LEASE_CONFIRM) {
        return { result: "invalid_confirm" };
      }

      const now = nowProvider();
      const diagnosticTraceId = traceIdProvider();
      const rows = await repository.listCandidateDrafts(input.workspaceId);
      const items: GmailExportStaleLeaseItem[] = [];

      for (const row of rows) {
        if (items.length >= input.maxLimit) {
          break;
        }

        const classified = classifyGmailExportStaleLease(row, now);

        if (!classified) {
          continue;
        }

        if (classified.action !== "would_expire") {
          items.push({
            draftId: row.draftId,
            action: classified.action,
            previousLeaseExpiresAt: classified.previousLeaseExpiresAt,
          });
          continue;
        }

        if (input.dryRun) {
          items.push({
            draftId: row.draftId,
            action: "would_expire",
            previousLeaseExpiresAt: classified.previousLeaseExpiresAt,
          });
          continue;
        }

        const updated = await repository.expireDraftLease({
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          draftId: row.draftId,
          nextMetadataJson: classified.nextMetadataJson,
          diagnosticTraceId,
          previousLeaseExpiresAt: classified.previousLeaseExpiresAt,
        });

        items.push({
          draftId: row.draftId,
          action: updated ? "expired" : "skipped_invalid_metadata",
          previousLeaseExpiresAt: classified.previousLeaseExpiresAt,
        });
      }

      const counts = resultCounts(items);

      return {
        result: "ok",
        data: {
          dryRun: input.dryRun,
          processed: items.length,
          expired: counts.expired,
          skipped: counts.skipped,
          diagnosticTraceId,
          items,
        },
      };
    },
  };
}

export function createProductionGmailExportStaleLeaseService(): GmailExportStaleLeaseService {
  return createGmailExportStaleLeaseService();
}
