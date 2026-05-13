import {
  GmailExportPendingItemSchema,
  type GmailExportPendingItem,
  type GmailExportPendingQuery,
} from "@syrantis/shared";

import {
  leasePendingGmailExportDrafts,
  type GmailExportPendingDraftRow,
} from "../repositories/drafts-gmail-export.js";

export type GmailExportPendingService = {
  getPendingGmailExports(
    workspaceId: string,
    query: GmailExportPendingQuery,
  ): Promise<GmailExportPendingItem[]>;
};

function mapPendingRow(row: GmailExportPendingDraftRow): GmailExportPendingItem {
  return GmailExportPendingItemSchema.parse({
    draftId: row.draftId,
    leadId: row.leadId,
    toEmail: row.toEmail,
    subject: row.subject,
    bodyText: row.bodyText,
    leaseToken: row.leaseToken,
    leaseExpiresAt: row.leaseExpiresAt.toISOString(),
  });
}

export async function getPendingGmailExports(
  workspaceId: string,
  query: GmailExportPendingQuery,
): Promise<GmailExportPendingItem[]> {
  const rows = await leasePendingGmailExportDrafts({
    workspaceId,
    limit: query.limit,
  });

  return rows.map(mapPendingRow);
}

export function createProductionGmailExportPendingService(): GmailExportPendingService {
  return {
    getPendingGmailExports,
  };
}
