import { randomUUID } from "node:crypto";

import { and, asc, eq, isNotNull, ne } from "drizzle-orm";

import { contacts, drafts, leads } from "@syrantis/db";

import { withWorkspaceDb } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

const LEASE_MS = 10 * 60 * 1000;
const CANDIDATE_MULTIPLIER = 5;

export type GmailExportPendingDraftRow = {
  draftId: string;
  leadId: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  leaseToken: string;
  leaseExpiresAt: Date;
};

export type GmailExportConfirmResult =
  | { result: "exported"; draftId: string; exportedAt: Date; alreadyExported: false }
  | { result: "exported"; draftId: string; exportedAt: Date; alreadyExported: true }
  | { result: "not_found" }
  | {
      result: "conflict";
      reason: "missing_lease" | "lease_mismatch" | "lease_expired";
    };

export type LeasePendingGmailExportsInput = {
  workspaceId: string;
  limit: number;
  now?: Date;
};

export type ConfirmGmailExportInput = {
  workspaceId: string;
  draftId: string;
  leaseToken: string;
  now?: Date;
};

type PendingCandidateRow = {
  draftId: string;
  leadId: string | null;
  contactEmail: string | null;
  subject: string | null;
  textBody: string | null;
  metadataJson: Record<string, unknown>;
};

type ConfirmDraftRow = {
  id: string;
  leadId: string | null;
  metadataJson: Record<string, unknown>;
};

function hasText(value: string | null): value is string {
  return Boolean(value?.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function gmailExportMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return metadataRecord(metadata.gmailExport);
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

function exportedAtFromMetadata(metadata: Record<string, unknown>): Date | null {
  return parseMetadataDate(gmailExportMetadata(metadata).exportedAt);
}

function activeLeaseExpiresAt(metadata: Record<string, unknown>, now: Date): Date | null {
  const gmailExport = gmailExportMetadata(metadata);

  if (typeof gmailExport.leaseToken !== "string") {
    return null;
  }

  const leaseExpiresAt = parseMetadataDate(gmailExport.leaseExpiresAt);
  return leaseExpiresAt && leaseExpiresAt > now ? leaseExpiresAt : null;
}

function isEmailValidEnoughForGmail(value: string | null): value is string {
  if (!hasText(value)) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function leasedMetadata(
  metadata: Record<string, unknown>,
  input: { leaseToken: string; leaseExpiresAt: Date },
): Record<string, unknown> {
  return {
    ...metadata,
    gmailExport: {
      ...gmailExportMetadata(metadata),
      status: "leased",
      leaseToken: input.leaseToken,
      leaseExpiresAt: input.leaseExpiresAt.toISOString(),
      exportedAt: null,
      source: "apps_script",
    },
  };
}

function exportedMetadata(
  metadata: Record<string, unknown>,
  exportedAt: Date,
): Record<string, unknown> {
  return {
    ...metadata,
    gmailExport: {
      ...gmailExportMetadata(metadata),
      status: "exported",
      leaseToken: null,
      leaseExpiresAt: null,
      exportedAt: exportedAt.toISOString(),
      source: "apps_script",
    },
  };
}

function candidateLimit(limit: number): number {
  return Math.min(Math.max(limit * CANDIDATE_MULTIPLIER, 10), 50);
}

export async function leasePendingGmailExportDrafts(
  input: LeasePendingGmailExportsInput,
): Promise<GmailExportPendingDraftRow[]> {
  const now = input.now ?? new Date();
  const resolvedLimit = Math.min(Math.max(input.limit, 1), 10);

  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const candidates: PendingCandidateRow[] = await tx
      .select({
        draftId: drafts.id,
        leadId: drafts.leadId,
        contactEmail: contacts.email,
        subject: drafts.subject,
        textBody: drafts.textBody,
        metadataJson: drafts.metadataJson,
      })
      .from(drafts)
      .innerJoin(
        leads,
        and(
          eq(leads.workspaceId, input.workspaceId),
          eq(leads.id, drafts.leadId),
          isNotNull(leads.contactId),
        ),
      )
      .innerJoin(
        contacts,
        and(eq(contacts.workspaceId, input.workspaceId), eq(contacts.id, leads.contactId)),
      )
      .where(
        and(
          eq(drafts.workspaceId, input.workspaceId),
          eq(drafts.status, "draft"),
          isNotNull(drafts.leadId),
          isNotNull(drafts.subject),
          isNotNull(drafts.textBody),
        ),
      )
      .orderBy(asc(drafts.createdAt))
      .limit(candidateLimit(resolvedLimit))
      .for("update", { of: drafts, skipLocked: true });

    const leased: GmailExportPendingDraftRow[] = [];

    for (const candidate of candidates) {
      if (leased.length >= resolvedLimit) {
        break;
      }

      const metadata = metadataRecord(candidate.metadataJson);

      if (
        !candidate.leadId ||
        !hasText(candidate.subject) ||
        !hasText(candidate.textBody) ||
        !isEmailValidEnoughForGmail(candidate.contactEmail) ||
        exportedAtFromMetadata(metadata) ||
        activeLeaseExpiresAt(metadata, now)
      ) {
        continue;
      }

      const leaseToken = randomUUID();
      const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
      const [updatedDraft] = await tx
        .update(drafts)
        .set({
          metadataJson: leasedMetadata(metadata, { leaseToken, leaseExpiresAt }),
        })
        .where(
          and(
            eq(drafts.workspaceId, input.workspaceId),
            eq(drafts.id, candidate.draftId),
            ne(drafts.status, "archived"),
          ),
        )
        .returning({ id: drafts.id });

      if (!updatedDraft) {
        continue;
      }

      leased.push({
        draftId: candidate.draftId,
        leadId: candidate.leadId,
        toEmail: candidate.contactEmail.trim(),
        subject: candidate.subject,
        bodyText: candidate.textBody,
        leaseToken,
        leaseExpiresAt,
      });
    }

    return leased;
  });
}

export async function confirmGmailExport(
  input: ConfirmGmailExportInput,
): Promise<GmailExportConfirmResult> {
  const now = input.now ?? new Date();

  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [draft]: ConfirmDraftRow[] = await tx
      .select({
        id: drafts.id,
        leadId: drafts.leadId,
        metadataJson: drafts.metadataJson,
      })
      .from(drafts)
      .where(and(eq(drafts.workspaceId, input.workspaceId), eq(drafts.id, input.draftId)))
      .limit(1)
      .for("update", { of: drafts });

    if (!draft) {
      return { result: "not_found" };
    }

    const metadata = metadataRecord(draft.metadataJson);
    const previousExportedAt = exportedAtFromMetadata(metadata);

    if (previousExportedAt) {
      return {
        result: "exported",
        draftId: draft.id,
        exportedAt: previousExportedAt,
        alreadyExported: true,
      };
    }

    const gmailExport = gmailExportMetadata(metadata);

    if (typeof gmailExport.leaseToken !== "string") {
      return { result: "conflict", reason: "missing_lease" };
    }

    if (gmailExport.leaseToken !== input.leaseToken) {
      return { result: "conflict", reason: "lease_mismatch" };
    }

    const leaseExpiresAt = parseMetadataDate(gmailExport.leaseExpiresAt);

    if (!leaseExpiresAt || leaseExpiresAt <= now) {
      return { result: "conflict", reason: "lease_expired" };
    }

    const [updatedDraft] = await tx
      .update(drafts)
      .set({
        metadataJson: exportedMetadata(metadata, now),
      })
      .where(and(eq(drafts.workspaceId, input.workspaceId), eq(drafts.id, input.draftId)))
      .returning({ id: drafts.id });

    if (!updatedDraft) {
      return { result: "not_found" };
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "draft.gmail_exported",
      entityType: "draft",
      entityId: draft.id,
      metadataJson: {
        draftId: draft.id,
        leadId: draft.leadId,
        source: "apps_script",
        exportedAt: now.toISOString(),
      },
    });

    return {
      result: "exported",
      draftId: draft.id,
      exportedAt: now,
      alreadyExported: false,
    };
  });
}
