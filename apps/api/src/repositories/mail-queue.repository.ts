import { and, desc, eq, gte, inArray } from "drizzle-orm";

import {
  drafts,
  intakeClassifications,
  leadScores,
  leads,
  workspaceContextProfiles,
} from "@syrantis/db";

import { withWorkspaceDb } from "../lib/db.js";

export type MailQueueClassificationRow = {
  classificationId: string;
  category: string;
  action: string;
  confidence: string;
  reasonCode: string;
  suggestedLabels: string[];
  leadId: string | null;
  classifiedAt: Date;
  leadCreatedAt: Date | null;
  leadStatus: string | null;
  leadContactId: string | null;
};

export type MailQueueScoreRow = {
  id: string;
  leadId: string;
  score: number;
  qualification: string;
  recommendedAction: string;
  confidence: number;
  createdAt: Date;
};

export type MailQueueDraftRow = {
  draftId: string;
  leadId: string | null;
  contactId: string | null;
  status: string;
  channel: string;
  subject: string | null;
  textBody: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadataJson: Record<string, unknown>;
};

export type MailQueueWorkspaceContextRow = {
  companyName: string;
  sector: string;
  language: string;
} | null;

export type MailQueueRows = {
  classifications: MailQueueClassificationRow[];
  latestScoresByLeadId: Record<string, MailQueueScoreRow>;
  latestDraftsByLeadId: Record<string, MailQueueDraftRow>;
  previousLeadCountsByLeadId: Record<string, number>;
  workspaceContext: MailQueueWorkspaceContextRow;
};

export type MailQueueRepository = {
  listRows(input: { workspaceId: string; since: Date }): Promise<MailQueueRows>;
  findDetailRows(input: { workspaceId: string; classificationId: string }): Promise<MailQueueRows>;
};

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isAiGeneratedDraft(row: MailQueueDraftRow): boolean {
  return metadataRecord(row.metadataJson).origin === "ai_draft_generation";
}

function latestScoresByLeadId(rows: MailQueueScoreRow[]): Record<string, MailQueueScoreRow> {
  const latest: Record<string, MailQueueScoreRow> = {};

  for (const row of rows) {
    latest[row.leadId] ??= row;
  }

  return latest;
}

function latestDraftsByLeadId(rows: MailQueueDraftRow[]): Record<string, MailQueueDraftRow> {
  const latest: Record<string, MailQueueDraftRow> = {};

  for (const row of rows) {
    if (row.leadId && isAiGeneratedDraft(row)) {
      latest[row.leadId] ??= row;
    }
  }

  return latest;
}

function previousLeadCountsByLeadId(
  classifications: MailQueueClassificationRow[],
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

  for (const classification of classifications) {
    if (!classification.leadId) {
      continue;
    }

    const contactId = contactsByLeadId.get(classification.leadId) ?? null;
    result[classification.leadId] = contactId
      ? Math.max(0, (countsByContactId.get(contactId) ?? 1) - 1)
      : 0;
  }

  return result;
}

async function hydrateRows(input: {
  workspaceId: string;
  classifications: MailQueueClassificationRow[];
}): Promise<Omit<MailQueueRows, "classifications">> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const leadIds = unique(input.classifications.map((row) => row.leadId));
    const contactIds = unique(input.classifications.map((row) => row.leadContactId));

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

    const draftRows = leadIds.length
      ? await tx
          .select({
            draftId: drafts.id,
            leadId: drafts.leadId,
            contactId: drafts.contactId,
            status: drafts.status,
            channel: drafts.channel,
            subject: drafts.subject,
            textBody: drafts.textBody,
            createdAt: drafts.createdAt,
            updatedAt: drafts.updatedAt,
            metadataJson: drafts.metadataJson,
          })
          .from(drafts)
          .where(
            and(
              eq(drafts.workspaceId, input.workspaceId),
              eq(drafts.channel, "email"),
              inArray(drafts.leadId, leadIds),
            ),
          )
          .orderBy(desc(drafts.createdAt), desc(drafts.id))
      : [];

    const relatedLeadRows = contactIds.length
      ? await tx
          .select({
            id: leads.id,
            contactId: leads.contactId,
          })
          .from(leads)
          .where(
            and(eq(leads.workspaceId, input.workspaceId), inArray(leads.contactId, contactIds)),
          )
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
      latestDraftsByLeadId: latestDraftsByLeadId(draftRows),
      previousLeadCountsByLeadId: previousLeadCountsByLeadId(
        input.classifications,
        relatedLeadRows,
      ),
      workspaceContext: contextRow ?? null,
    };
  });
}

export function createProductionMailQueueRepository(): MailQueueRepository {
  return {
    async listRows(input) {
      const classificationRows = await withWorkspaceDb(input.workspaceId, async (tx) =>
        tx
          .select({
            classificationId: intakeClassifications.id,
            category: intakeClassifications.category,
            action: intakeClassifications.action,
            confidence: intakeClassifications.confidence,
            reasonCode: intakeClassifications.reasonCode,
            suggestedLabels: intakeClassifications.suggestedLabels,
            leadId: intakeClassifications.leadId,
            classifiedAt: intakeClassifications.createdAt,
            leadCreatedAt: leads.createdAt,
            leadStatus: leads.status,
            leadContactId: leads.contactId,
          })
          .from(intakeClassifications)
          .leftJoin(
            leads,
            and(
              eq(leads.id, intakeClassifications.leadId),
              eq(leads.workspaceId, input.workspaceId),
            ),
          )
          .where(
            and(
              eq(intakeClassifications.workspaceId, input.workspaceId),
              gte(intakeClassifications.createdAt, input.since),
            ),
          )
          .orderBy(desc(intakeClassifications.createdAt), desc(intakeClassifications.id)),
      );
      const hydrated = await hydrateRows({
        workspaceId: input.workspaceId,
        classifications: classificationRows,
      });

      return {
        classifications: classificationRows,
        ...hydrated,
      };
    },

    async findDetailRows(input) {
      const classificationRows = await withWorkspaceDb(input.workspaceId, async (tx) =>
        tx
          .select({
            classificationId: intakeClassifications.id,
            category: intakeClassifications.category,
            action: intakeClassifications.action,
            confidence: intakeClassifications.confidence,
            reasonCode: intakeClassifications.reasonCode,
            suggestedLabels: intakeClassifications.suggestedLabels,
            leadId: intakeClassifications.leadId,
            classifiedAt: intakeClassifications.createdAt,
            leadCreatedAt: leads.createdAt,
            leadStatus: leads.status,
            leadContactId: leads.contactId,
          })
          .from(intakeClassifications)
          .leftJoin(
            leads,
            and(
              eq(leads.id, intakeClassifications.leadId),
              eq(leads.workspaceId, input.workspaceId),
            ),
          )
          .where(
            and(
              eq(intakeClassifications.workspaceId, input.workspaceId),
              eq(intakeClassifications.id, input.classificationId),
            ),
          )
          .limit(1),
      );
      const hydrated = await hydrateRows({
        workspaceId: input.workspaceId,
        classifications: classificationRows,
      });

      return {
        classifications: classificationRows,
        ...hydrated,
      };
    },
  };
}
