import { randomUUID } from "node:crypto";

import { and, count, desc, eq, isNotNull, ne } from "drizzle-orm";

import { contacts, drafts, emailSends, leads } from "@syrantis/db";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
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

export type GmailExportRequestResult =
  | {
      result: "requested";
      draftId: string;
      leadId: string;
      requestedAt: Date;
      requestExpiresAt: Date;
      alreadyRequested: false;
    }
  | {
      result: "requested";
      draftId: string;
      leadId: string;
      requestedAt: Date;
      requestExpiresAt: Date;
      alreadyRequested: true;
    }
  | { result: "not_found" }
  | {
      result: "conflict";
      reason:
        | "already_exported"
        | "active_lease"
        | "non_draft_status"
        | "missing_content"
        | "missing_recipient"
        | "has_email_sends";
    };

export type GmailExportCancelResult =
  | {
      result: "cancelled";
      draftId: string;
      leadId: string;
      cancelledAt: Date;
    }
  | { result: "not_found" }
  | {
      result: "conflict";
      reason: "already_exported" | "active_lease" | "no_active_request";
    };

export type LeasePendingGmailExportsInput = {
  workspaceId: string;
  limit: number;
  now?: Date;
};

export type RequestGmailExportInput = {
  workspaceId: string;
  actorUserId: string;
  draftId: string;
  now?: Date;
};

export type CancelGmailExportInput = {
  workspaceId: string;
  actorUserId: string;
  draftId: string;
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

type ExportRequestDraftRow = {
  id: string;
  leadId: string | null;
  status: string;
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

function isExported(metadata: Record<string, unknown>): boolean {
  const gmailExport = gmailExportMetadata(metadata);
  return gmailExport.status === "exported" || Boolean(exportedAtFromMetadata(metadata));
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

function activeRequest(
  metadata: Record<string, unknown>,
  now: Date,
): { requestedAt: Date; requestExpiresAt: Date } | null {
  const gmailExport = gmailExportMetadata(metadata);
  const requestedAt = parseMetadataDate(gmailExport.requestedAt);
  const requestExpiresAt = parseMetadataDate(gmailExport.requestExpiresAt);

  if (
    !requestedAt ||
    !requestExpiresAt ||
    requestExpiresAt <= now ||
    gmailExport.status === "cancelled" ||
    gmailExport.status === "exported" ||
    gmailExport.cancelledAt ||
    gmailExport.exportedAt
  ) {
    return null;
  }

  return { requestedAt, requestExpiresAt };
}

function hasActiveExportRequest(metadata: Record<string, unknown>, now: Date): boolean {
  return Boolean(activeRequest(metadata, now));
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

function requestedMetadata(
  metadata: Record<string, unknown>,
  input: { requestedAt: Date; requestExpiresAt: Date },
): Record<string, unknown> {
  return {
    ...metadata,
    gmailExport: {
      ...gmailExportMetadata(metadata),
      requestedAt: input.requestedAt.toISOString(),
      requestExpiresAt: input.requestExpiresAt.toISOString(),
      requestSource: "admin_api",
      cancelledAt: null,
      status: "requested",
      leaseToken: null,
      leaseExpiresAt: null,
    },
  };
}

function cancelledMetadata(
  metadata: Record<string, unknown>,
  cancelledAt: Date,
): Record<string, unknown> {
  return {
    ...metadata,
    gmailExport: {
      ...gmailExportMetadata(metadata),
      cancelledAt: cancelledAt.toISOString(),
      status: "cancelled",
      leaseToken: null,
      leaseExpiresAt: null,
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

async function hasEmailSends(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; draftId: string },
): Promise<boolean> {
  const [emailSendsCountRow] = await tx
    .select({ value: count() })
    .from(emailSends)
    .where(
      and(eq(emailSends.workspaceId, input.workspaceId), eq(emailSends.draftId, input.draftId)),
    )
    .limit(1);

  return Number(emailSendsCountRow?.value ?? 0) > 0;
}

async function resolvesValidRecipient(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; leadId: string | null },
): Promise<boolean> {
  if (!input.leadId) {
    return false;
  }

  const [lead] = await tx
    .select({ id: leads.id, contactId: leads.contactId })
    .from(leads)
    .where(and(eq(leads.workspaceId, input.workspaceId), eq(leads.id, input.leadId)))
    .limit(1);

  if (!lead?.contactId) {
    return false;
  }

  const [contact] = await tx
    .select({ email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, input.workspaceId), eq(contacts.id, lead.contactId)))
    .limit(1);

  return isEmailValidEnoughForGmail(contact?.email ?? null);
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
      .orderBy(desc(drafts.updatedAt))
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
        isExported(metadata) ||
        !hasActiveExportRequest(metadata, now) ||
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

export async function requestGmailExport(
  input: RequestGmailExportInput,
): Promise<GmailExportRequestResult> {
  const now = input.now ?? new Date();
  const requestExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [draft]: ExportRequestDraftRow[] = await tx
      .select({
        id: drafts.id,
        leadId: drafts.leadId,
        status: drafts.status,
        subject: drafts.subject,
        textBody: drafts.textBody,
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
    const activeLease = activeLeaseExpiresAt(metadata, now);

    if (isExported(metadata)) {
      return { result: "conflict", reason: "already_exported" };
    }

    if (activeLease) {
      return { result: "conflict", reason: "active_lease" };
    }

    if (draft.status !== "draft") {
      return { result: "conflict", reason: "non_draft_status" };
    }

    if (!hasText(draft.subject) || !hasText(draft.textBody)) {
      return { result: "conflict", reason: "missing_content" };
    }

    if (
      !(await resolvesValidRecipient(tx, { workspaceId: input.workspaceId, leadId: draft.leadId }))
    ) {
      return { result: "conflict", reason: "missing_recipient" };
    }

    if (await hasEmailSends(tx, { workspaceId: input.workspaceId, draftId: draft.id })) {
      return { result: "conflict", reason: "has_email_sends" };
    }

    const existingRequest = activeRequest(metadata, now);
    if (existingRequest && draft.leadId) {
      return {
        result: "requested",
        draftId: draft.id,
        leadId: draft.leadId,
        requestedAt: existingRequest.requestedAt,
        requestExpiresAt: existingRequest.requestExpiresAt,
        alreadyRequested: true,
      };
    }

    const [updatedDraft] = await tx
      .update(drafts)
      .set({
        metadataJson: requestedMetadata(metadata, { requestedAt: now, requestExpiresAt }),
      })
      .where(and(eq(drafts.workspaceId, input.workspaceId), eq(drafts.id, input.draftId)))
      .returning({ id: drafts.id });

    if (!updatedDraft || !draft.leadId) {
      return { result: "not_found" };
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "draft.gmail_export_requested",
      entityType: "draft",
      entityId: draft.id,
      metadataJson: {
        draftId: draft.id,
        leadId: draft.leadId,
        source: "admin_api",
        requestedAt: now.toISOString(),
        requestExpiresAt: requestExpiresAt.toISOString(),
      },
    });

    return {
      result: "requested",
      draftId: draft.id,
      leadId: draft.leadId,
      requestedAt: now,
      requestExpiresAt,
      alreadyRequested: false,
    };
  });
}

export async function cancelGmailExport(
  input: CancelGmailExportInput,
): Promise<GmailExportCancelResult> {
  const now = input.now ?? new Date();

  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [draft]: ExportRequestDraftRow[] = await tx
      .select({
        id: drafts.id,
        leadId: drafts.leadId,
        status: drafts.status,
        subject: drafts.subject,
        textBody: drafts.textBody,
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

    if (isExported(metadata)) {
      return { result: "conflict", reason: "already_exported" };
    }

    if (activeLeaseExpiresAt(metadata, now)) {
      return { result: "conflict", reason: "active_lease" };
    }

    if (!activeRequest(metadata, now) || !draft.leadId) {
      return { result: "conflict", reason: "no_active_request" };
    }

    const [updatedDraft] = await tx
      .update(drafts)
      .set({
        metadataJson: cancelledMetadata(metadata, now),
      })
      .where(and(eq(drafts.workspaceId, input.workspaceId), eq(drafts.id, input.draftId)))
      .returning({ id: drafts.id });

    if (!updatedDraft) {
      return { result: "not_found" };
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "draft.gmail_export_cancelled",
      entityType: "draft",
      entityId: draft.id,
      metadataJson: {
        draftId: draft.id,
        leadId: draft.leadId,
        source: "admin_api",
        cancelledAt: now.toISOString(),
      },
    });

    return {
      result: "cancelled",
      draftId: draft.id,
      leadId: draft.leadId,
      cancelledAt: now,
    };
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
