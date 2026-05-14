import { and, desc, eq } from "drizzle-orm";

import { drafts } from "@syrantis/db";

import { withWorkspaceDb } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

export type GmailExportStaleLeaseDraftRow = {
  draftId: string;
  metadataJson: Record<string, unknown>;
};

export type GmailExportStaleLeaseRepository = {
  listCandidateDrafts(workspaceId: string): Promise<GmailExportStaleLeaseDraftRow[]>;
  expireDraftLease(input: {
    workspaceId: string;
    actorUserId: string;
    draftId: string;
    nextMetadataJson: Record<string, unknown>;
    diagnosticTraceId: string;
    previousLeaseExpiresAt: string;
  }): Promise<boolean>;
};

export function createProductionGmailExportStaleLeaseRepository(): GmailExportStaleLeaseRepository {
  return {
    async listCandidateDrafts(workspaceId) {
      return withWorkspaceDb(workspaceId, async (tx) => {
        return tx
          .select({
            draftId: drafts.id,
            metadataJson: drafts.metadataJson,
          })
          .from(drafts)
          .where(eq(drafts.workspaceId, workspaceId))
          .orderBy(desc(drafts.updatedAt));
      });
    },

    async expireDraftLease(input) {
      return withWorkspaceDb(input.workspaceId, async (tx) => {
        const [updatedDraft] = await tx
          .update(drafts)
          .set({
            metadataJson: input.nextMetadataJson,
          })
          .where(and(eq(drafts.workspaceId, input.workspaceId), eq(drafts.id, input.draftId)))
          .returning({ id: drafts.id });

        if (!updatedDraft) {
          return false;
        }

        await createActivityLog(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          action: "draft.gmail_export_stale_lease_expired",
          entityType: "draft",
          entityId: input.draftId,
          metadataJson: {
            diagnosticTraceId: input.diagnosticTraceId,
            draftId: input.draftId,
            previousLeaseExpiresAt: input.previousLeaseExpiresAt,
            source: "admin_stale_lease_hygiene",
          },
        });

        return true;
      });
    },
  };
}
