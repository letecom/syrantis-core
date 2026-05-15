import { and, desc, eq, gte, inArray } from "drizzle-orm";

import {
  contacts,
  drafts,
  intakeClassifications,
  leadScores,
  leads,
  workspaceContextProfiles,
} from "@syrantis/db";

import { withWorkspaceDb } from "../lib/db.js";

export type DraftQueueDraftRow = {
  draftId: string;
  leadId: string | null;
  status: string;
  channel: string;
  subject: string | null;
  textBody: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadataJson: Record<string, unknown>;
  leadContactId: string | null;
  draftContactId: string | null;
  recipientAddress: string | null;
};

export type DraftQueueScoreRow = {
  id: string;
  leadId: string;
  score: number;
  qualification: string;
  recommendedAction: string;
  confidence: number;
  createdAt: Date;
};

export type DraftQueueIntakeClassificationRow = {
  leadId: string | null;
  classification: string;
  category: string;
  action: string;
  confidence: string;
  reasonCode: string;
  suggestedLabels: string[];
  createdAt: Date;
};

export type DraftQueueWorkspaceContextRow = {
  companyName: string;
  sector: string;
  language: string;
} | null;

export type DraftQueueRows = {
  drafts: DraftQueueDraftRow[];
  latestScoresByLeadId: Record<string, DraftQueueScoreRow>;
  latestClassificationsByLeadId: Record<string, DraftQueueIntakeClassificationRow>;
  previousLeadCountsByLeadId: Record<string, number>;
  workspaceContext: DraftQueueWorkspaceContextRow;
};

export type DraftQueueRepository = {
  listRows(input: { workspaceId: string; since: Date }): Promise<DraftQueueRows>;
  findDetailRows(input: { workspaceId: string; draftId: string }): Promise<DraftQueueRows>;
};

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function latestScoresByLeadId(rows: DraftQueueScoreRow[]): Record<string, DraftQueueScoreRow> {
  const latest: Record<string, DraftQueueScoreRow> = {};

  for (const row of rows) {
    latest[row.leadId] ??= row;
  }

  return latest;
}

function latestClassificationsByLeadId(
  rows: DraftQueueIntakeClassificationRow[],
): Record<string, DraftQueueIntakeClassificationRow> {
  const latest: Record<string, DraftQueueIntakeClassificationRow> = {};

  for (const row of rows) {
    if (row.leadId) {
      latest[row.leadId] ??= row;
    }
  }

  return latest;
}

function previousLeadCountsByLeadId(
  draftRows: DraftQueueDraftRow[],
  leadRows: Array<{ id: string; contactId: string | null }>,
): Record<string, number> {
  const contactsByLeadId = new Map(leadRows.map((row) => [row.id, row.contactId]));
  const countsByContactId = new Map<string, number>();
  const result: Record<string, number> = {};

  for (const row of leadRows) {
    if (!row.contactId) {
      continue;
    }

    countsByContactId.set(row.contactId, (countsByContactId.get(row.contactId) ?? 0) + 1);
  }

  for (const draftRow of draftRows) {
    if (!draftRow.leadId) {
      continue;
    }

    const contactId = contactsByLeadId.get(draftRow.leadId) ?? null;
    result[draftRow.leadId] = contactId ? Math.max(0, (countsByContactId.get(contactId) ?? 1) - 1) : 0;
  }

  return result;
}

async function hydrateRows(input: {
  workspaceId: string;
  drafts: DraftQueueDraftRow[];
}): Promise<Omit<DraftQueueRows, "drafts">> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const leadIds = unique(input.drafts.map((row) => row.leadId));
    const contactIds = unique(
      input.drafts.map((row) => row.leadContactId ?? row.draftContactId),
    );

    const scoreRows = leadIds.length
      ? await tx
          .select({
            id: leadScores.id,
            leadId: leadScores.leadId,
            score: leadScores.score,
            qualification: leadScores.qualification,
            recommendedAction: leadScores.recommendedAction,
            confidence: leadScores.confidence,
            createdAt: leadScores.createdAt,
          })
          .from(leadScores)
          .where(
            and(eq(leadScores.workspaceId, input.workspaceId), inArray(leadScores.leadId, leadIds)),
          )
          .orderBy(desc(leadScores.createdAt), desc(leadScores.id))
      : [];

    const classificationRows = leadIds.length
      ? await tx
          .select({
            leadId: intakeClassifications.leadId,
            classification: intakeClassifications.classification,
            category: intakeClassifications.category,
            action: intakeClassifications.action,
            confidence: intakeClassifications.confidence,
            reasonCode: intakeClassifications.reasonCode,
            suggestedLabels: intakeClassifications.suggestedLabels,
            createdAt: intakeClassifications.createdAt,
          })
          .from(intakeClassifications)
          .where(
            and(
              eq(intakeClassifications.workspaceId, input.workspaceId),
              inArray(intakeClassifications.leadId, leadIds),
            ),
          )
          .orderBy(desc(intakeClassifications.createdAt))
      : [];

    const relatedLeadRows = contactIds.length
      ? await tx
          .select({
            id: leads.id,
            contactId: leads.contactId,
          })
          .from(leads)
          .where(and(eq(leads.workspaceId, input.workspaceId), inArray(leads.contactId, contactIds)))
      : [];

    const [contextRow] = await tx
      .select({
        companyName: workspaceContextProfiles.companyName,
        sector: workspaceContextProfiles.sector,
        language: workspaceContextProfiles.language,
      })
      .from(workspaceContextProfiles)
      .where(eq(workspaceContextProfiles.workspaceId, input.workspaceId))
      .limit(1);

    return {
      latestScoresByLeadId: latestScoresByLeadId(scoreRows),
      latestClassificationsByLeadId: latestClassificationsByLeadId(classificationRows),
      previousLeadCountsByLeadId: previousLeadCountsByLeadId(input.drafts, relatedLeadRows),
      workspaceContext: contextRow ?? null,
    };
  });
}

export function createProductionDraftQueueRepository(): DraftQueueRepository {
  return {
    async listRows(input) {
      const draftRows = await withWorkspaceDb(input.workspaceId, async (tx) =>
        tx
          .select({
            draftId: drafts.id,
            leadId: drafts.leadId,
            status: drafts.status,
            channel: drafts.channel,
            subject: drafts.subject,
            textBody: drafts.textBody,
            createdAt: drafts.createdAt,
            updatedAt: drafts.updatedAt,
            metadataJson: drafts.metadataJson,
            leadContactId: leads.contactId,
            draftContactId: drafts.contactId,
            recipientAddress: contacts.email,
          })
          .from(drafts)
          .leftJoin(
            leads,
            and(eq(leads.id, drafts.leadId), eq(leads.workspaceId, input.workspaceId)),
          )
          .leftJoin(
            contacts,
            and(eq(contacts.id, drafts.contactId), eq(contacts.workspaceId, input.workspaceId)),
          )
          .where(
            and(
              eq(drafts.workspaceId, input.workspaceId),
              eq(drafts.channel, "email"),
              gte(drafts.createdAt, input.since),
            ),
          )
          .orderBy(desc(drafts.createdAt), desc(drafts.id)),
      );
      const hydrated = await hydrateRows({ workspaceId: input.workspaceId, drafts: draftRows });

      return {
        drafts: draftRows,
        ...hydrated,
      };
    },

    async findDetailRows(input) {
      const draftRows = await withWorkspaceDb(input.workspaceId, async (tx) =>
        tx
          .select({
            draftId: drafts.id,
            leadId: drafts.leadId,
            status: drafts.status,
            channel: drafts.channel,
            subject: drafts.subject,
            textBody: drafts.textBody,
            createdAt: drafts.createdAt,
            updatedAt: drafts.updatedAt,
            metadataJson: drafts.metadataJson,
            leadContactId: leads.contactId,
            draftContactId: drafts.contactId,
            recipientAddress: contacts.email,
          })
          .from(drafts)
          .leftJoin(
            leads,
            and(eq(leads.id, drafts.leadId), eq(leads.workspaceId, input.workspaceId)),
          )
          .leftJoin(
            contacts,
            and(eq(contacts.id, drafts.contactId), eq(contacts.workspaceId, input.workspaceId)),
          )
          .where(and(eq(drafts.workspaceId, input.workspaceId), eq(drafts.id, input.draftId)))
          .limit(1),
      );
      const hydrated = await hydrateRows({ workspaceId: input.workspaceId, drafts: draftRows });

      return {
        drafts: draftRows,
        ...hydrated,
      };
    },
  };
}
