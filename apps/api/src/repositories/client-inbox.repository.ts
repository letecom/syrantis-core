import { and, desc, eq, inArray } from "drizzle-orm";

import {
  clientMailItems,
  contacts,
  drafts,
  emailSends,
  intakeClassifications,
  leadScores,
  leads,
  organizations,
  workspaceContextProfiles,
} from "@syrantis/db";
import type { ClientInboxDraftEditInput } from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

export type ClientInboxMailRow = {
  mailItemId: string;
  classificationId: string | null;
  leadId: string | null;
  contactId: string | null;
  draftId: string | null;
  receivedAt: Date | null;
  createdAt: Date;
  fromDisplay: string | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  classification: string | null;
  category: string | null;
  action: string | null;
  confidence: string | null;
  reasonCode: string | null;
  suggestedLabels: string[] | null;
  leadStatus: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  companyName: string | null;
};

export type ClientInboxMailDetailRow = ClientInboxMailRow & {
  fromEmail: string | null;
  toDisplay: string | null;
  toEmail: string | null;
  bodyText: string | null;
  attachmentsJson: unknown[];
};

export type ClientInboxScoreRow = {
  id: string;
  leadId: string;
  score: number;
  qualification: string;
  recommendedAction: string;
  confidence: number;
  createdAt: Date;
};

export type ClientInboxDraftRow = {
  draftId: string;
  leadId: string | null;
  contactId: string | null;
  status: string;
  subject: string | null;
  textBody: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadataJson: Record<string, unknown>;
};

export type ClientInboxWorkspaceContextRow = {
  companyName: string;
  sector: string;
  language: string;
  contextJson: Record<string, unknown>;
} | null;

export type ClientInboxOutboundRow = {
  contactId: string | null;
  createdAt: Date;
  deliveryStatus: string | null;
  status: string;
};

export type ClientInboxRows<TMailRow extends ClientInboxMailRow = ClientInboxMailRow> = {
  mails: TMailRow[];
  latestScoresByLeadId: Record<string, ClientInboxScoreRow>;
  latestDraftsByLeadId: Record<string, ClientInboxDraftRow>;
  draftsById: Record<string, ClientInboxDraftRow>;
  previousLeadCountsByContactId: Record<string, number>;
  previousThreadCountsByContactId: Record<string, number>;
  lastInboundAtByContactId: Record<string, Date>;
  lastOutboundByContactId: Record<string, ClientInboxOutboundRow>;
  workspaceContext: ClientInboxWorkspaceContextRow;
};

export type ClientInboxDraftResolution =
  | { result: "ok"; mailItemId: string; draftId: string }
  | { result: "mail_not_found" }
  | { result: "no_draft" };

export type ClientInboxDraftEditResult =
  | {
      result: "ok";
      mailItemId: string;
      draftId: string;
      status: string;
      updatedAt: Date;
      metadataJson: Record<string, unknown>;
    }
  | { result: "mail_not_found" }
  | { result: "no_draft" };

export type ClientInboxRepository = {
  listRows(input: { workspaceId: string }): Promise<ClientInboxRows>;
  findDetailRows(input: {
    workspaceId: string;
    mailItemId: string;
  }): Promise<ClientInboxRows<ClientInboxMailDetailRow>>;
  resolveDraftForMailItem(input: {
    workspaceId: string;
    mailItemId: string;
  }): Promise<ClientInboxDraftResolution>;
  updateDraftFromMailItem(input: {
    workspaceId: string;
    actorUserId: string;
    mailItemId: string;
    data: ClientInboxDraftEditInput;
  }): Promise<ClientInboxDraftEditResult>;
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

function latestScoresByLeadId(rows: ClientInboxScoreRow[]): Record<string, ClientInboxScoreRow> {
  const latest: Record<string, ClientInboxScoreRow> = {};

  for (const row of rows) {
    latest[row.leadId] ??= row;
  }

  return latest;
}

function latestDraftsByLeadId(rows: ClientInboxDraftRow[]): Record<string, ClientInboxDraftRow> {
  const latest: Record<string, ClientInboxDraftRow> = {};

  for (const row of rows) {
    if (row.leadId) {
      latest[row.leadId] ??= row;
    }
  }

  return latest;
}

function draftsById(rows: ClientInboxDraftRow[]): Record<string, ClientInboxDraftRow> {
  return Object.fromEntries(rows.map((row) => [row.draftId, row]));
}

function previousCountsByContactId(
  rows: Array<{ contactId: string | null }>,
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const row of rows) {
    if (!row.contactId) {
      continue;
    }

    counts[row.contactId] = (counts[row.contactId] ?? 0) + 1;
  }

  return counts;
}

function lastInboundByContactId(
  rows: Array<{ contactId: string | null; receivedAt: Date | null; createdAt: Date }>,
): Record<string, Date> {
  const latest: Record<string, Date> = {};

  for (const row of rows) {
    if (!row.contactId) {
      continue;
    }

    const eventAt = row.receivedAt ?? row.createdAt;
    if (!latest[row.contactId] || latest[row.contactId]! < eventAt) {
      latest[row.contactId] = eventAt;
    }
  }

  return latest;
}

function lastOutboundByContactId(rows: ClientInboxOutboundRow[]): Record<string, ClientInboxOutboundRow> {
  const latest: Record<string, ClientInboxOutboundRow> = {};

  for (const row of rows) {
    if (!row.contactId) {
      continue;
    }

    latest[row.contactId] ??= row;
  }

  return latest;
}

function clientEditMetadata(metadataJson: Record<string, unknown>, editedAt: Date): Record<string, unknown> {
  return {
    ...metadataJson,
    humanEdited: true,
    editedAt: editedAt.toISOString(),
    editSource: "client_inbox_edit",
  };
}

async function findDraftForMailItem(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; mailItemId: string },
): Promise<ClientInboxDraftResolution> {
  const [mail] = await tx
    .select({
      mailItemId: clientMailItems.id,
      draftId: clientMailItems.draftId,
      leadId: clientMailItems.leadId,
    })
    .from(clientMailItems)
    .where(and(eq(clientMailItems.workspaceId, input.workspaceId), eq(clientMailItems.id, input.mailItemId)))
    .limit(1);

  if (!mail) {
    return { result: "mail_not_found" };
  }

  if (mail.draftId) {
    return { result: "ok", mailItemId: mail.mailItemId, draftId: mail.draftId };
  }

  if (!mail.leadId) {
    return { result: "no_draft" };
  }

  const [draft] = await tx
    .select({ draftId: drafts.id })
    .from(drafts)
    .where(
      and(
        eq(drafts.workspaceId, input.workspaceId),
        eq(drafts.leadId, mail.leadId),
        eq(drafts.channel, "email"),
      ),
    )
    .orderBy(desc(drafts.createdAt), desc(drafts.id))
    .limit(1);

  if (!draft) {
    return { result: "no_draft" };
  }

  await tx
    .update(clientMailItems)
    .set({ draftId: draft.draftId })
    .where(and(eq(clientMailItems.workspaceId, input.workspaceId), eq(clientMailItems.id, mail.mailItemId)));

  return { result: "ok", mailItemId: mail.mailItemId, draftId: draft.draftId };
}

async function hydrateRows<TMailRow extends ClientInboxMailRow>(input: {
  tx: WorkspaceDbTransaction;
  workspaceId: string;
  mails: TMailRow[];
}): Promise<Omit<ClientInboxRows<TMailRow>, "mails">> {
  const leadIds = unique(input.mails.map((row) => row.leadId));
  const contactIds = unique(input.mails.map((row) => row.contactId));
  const directDraftIds = unique(input.mails.map((row) => row.draftId));

  const scoreRows = leadIds.length
    ? await input.tx
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
        .where(and(eq(leadScores.workspaceId, input.workspaceId), inArray(leadScores.leadId, leadIds)))
        .orderBy(desc(leadScores.createdAt), desc(leadScores.id))
    : [];

  const draftRowsByLead = leadIds.length
    ? await input.tx
        .select({
          draftId: drafts.id,
          leadId: drafts.leadId,
          contactId: drafts.contactId,
          status: drafts.status,
          subject: drafts.subject,
          textBody: drafts.textBody,
          createdAt: drafts.createdAt,
          updatedAt: drafts.updatedAt,
          metadataJson: drafts.metadataJson,
        })
        .from(drafts)
        .where(and(eq(drafts.workspaceId, input.workspaceId), inArray(drafts.leadId, leadIds)))
        .orderBy(desc(drafts.createdAt), desc(drafts.id))
    : [];

  const draftRowsById = directDraftIds.length
    ? await input.tx
        .select({
          draftId: drafts.id,
          leadId: drafts.leadId,
          contactId: drafts.contactId,
          status: drafts.status,
          subject: drafts.subject,
          textBody: drafts.textBody,
          createdAt: drafts.createdAt,
          updatedAt: drafts.updatedAt,
          metadataJson: drafts.metadataJson,
        })
        .from(drafts)
        .where(and(eq(drafts.workspaceId, input.workspaceId), inArray(drafts.id, directDraftIds)))
        .orderBy(desc(drafts.createdAt), desc(drafts.id))
    : [];

  const draftRows = [...draftRowsById, ...draftRowsByLead];

  const relatedLeadRows = contactIds.length
    ? await input.tx
        .select({
          contactId: leads.contactId,
        })
        .from(leads)
        .where(and(eq(leads.workspaceId, input.workspaceId), inArray(leads.contactId, contactIds)))
    : [];

  const relatedThreadRows = contactIds.length
    ? await input.tx
        .select({
          contactId: clientMailItems.contactId,
          receivedAt: clientMailItems.receivedAt,
          createdAt: clientMailItems.createdAt,
        })
        .from(clientMailItems)
        .where(
          and(
            eq(clientMailItems.workspaceId, input.workspaceId),
            inArray(clientMailItems.contactId, contactIds),
          ),
        )
    : [];

  const outboundRows = contactIds.length
    ? await input.tx
        .select({
          contactId: emailSends.contactId,
          createdAt: emailSends.createdAt,
          deliveryStatus: emailSends.deliveryStatus,
          status: emailSends.status,
        })
        .from(emailSends)
        .where(and(eq(emailSends.workspaceId, input.workspaceId), inArray(emailSends.contactId, contactIds)))
        .orderBy(desc(emailSends.createdAt), desc(emailSends.id))
    : [];

  const [contextRow] = await input.tx
    .select({
      companyName: workspaceContextProfiles.companyName,
      sector: workspaceContextProfiles.sector,
      language: workspaceContextProfiles.language,
      contextJson: workspaceContextProfiles.contextJson,
    })
    .from(workspaceContextProfiles)
    .where(eq(workspaceContextProfiles.workspaceId, input.workspaceId))
    .limit(1);

  return {
    latestScoresByLeadId: latestScoresByLeadId(scoreRows),
    latestDraftsByLeadId: latestDraftsByLeadId(draftRows),
    draftsById: draftsById(draftRows),
    previousLeadCountsByContactId: previousCountsByContactId(relatedLeadRows),
    previousThreadCountsByContactId: previousCountsByContactId(relatedThreadRows),
    lastInboundAtByContactId: lastInboundByContactId(relatedThreadRows),
    lastOutboundByContactId: lastOutboundByContactId(outboundRows),
    workspaceContext: contextRow ?? null,
  };
}

function baseMailSelect() {
  return {
    mailItemId: clientMailItems.id,
    classificationId: clientMailItems.classificationId,
    leadId: clientMailItems.leadId,
    contactId: clientMailItems.contactId,
    draftId: clientMailItems.draftId,
    receivedAt: clientMailItems.receivedAt,
    createdAt: clientMailItems.createdAt,
    fromDisplay: clientMailItems.fromDisplay,
    subject: clientMailItems.subject,
    snippet: clientMailItems.snippet,
    bodyText: clientMailItems.bodyText,
    classification: intakeClassifications.classification,
    category: intakeClassifications.category,
    action: intakeClassifications.action,
    confidence: intakeClassifications.confidence,
    reasonCode: intakeClassifications.reasonCode,
    suggestedLabels: intakeClassifications.suggestedLabels,
    leadStatus: leads.status,
    contactFirstName: contacts.firstName,
    contactLastName: contacts.lastName,
    companyName: organizations.name,
  };
}

export function createProductionClientInboxRepository(): ClientInboxRepository {
  return {
    async listRows(input) {
      return withWorkspaceDb(input.workspaceId, async (tx) => {
        const mails = await tx
          .select(baseMailSelect())
          .from(clientMailItems)
          .leftJoin(
            intakeClassifications,
            and(
              eq(intakeClassifications.workspaceId, input.workspaceId),
              eq(intakeClassifications.id, clientMailItems.classificationId),
            ),
          )
          .leftJoin(
            leads,
            and(eq(leads.workspaceId, input.workspaceId), eq(leads.id, clientMailItems.leadId)),
          )
          .leftJoin(
            contacts,
            and(eq(contacts.workspaceId, input.workspaceId), eq(contacts.id, clientMailItems.contactId)),
          )
          .leftJoin(
            organizations,
            and(eq(organizations.workspaceId, input.workspaceId), eq(organizations.id, leads.organizationId)),
          )
          .where(eq(clientMailItems.workspaceId, input.workspaceId))
          .orderBy(
            desc(clientMailItems.receivedAt),
            desc(clientMailItems.createdAt),
            desc(clientMailItems.id),
          )
          .limit(500);

        const hydrated = await hydrateRows({ tx, workspaceId: input.workspaceId, mails });

        return {
          mails,
          ...hydrated,
        };
      });
    },

    async findDetailRows(input) {
      return withWorkspaceDb(input.workspaceId, async (tx) => {
        const mails = await tx
          .select({
            ...baseMailSelect(),
            fromEmail: clientMailItems.fromEmail,
            toDisplay: clientMailItems.toDisplay,
            toEmail: clientMailItems.toEmail,
            bodyText: clientMailItems.bodyText,
            attachmentsJson: clientMailItems.attachmentsJson,
          })
          .from(clientMailItems)
          .leftJoin(
            intakeClassifications,
            and(
              eq(intakeClassifications.workspaceId, input.workspaceId),
              eq(intakeClassifications.id, clientMailItems.classificationId),
            ),
          )
          .leftJoin(
            leads,
            and(eq(leads.workspaceId, input.workspaceId), eq(leads.id, clientMailItems.leadId)),
          )
          .leftJoin(
            contacts,
            and(eq(contacts.workspaceId, input.workspaceId), eq(contacts.id, clientMailItems.contactId)),
          )
          .leftJoin(
            organizations,
            and(eq(organizations.workspaceId, input.workspaceId), eq(organizations.id, leads.organizationId)),
          )
          .where(and(eq(clientMailItems.workspaceId, input.workspaceId), eq(clientMailItems.id, input.mailItemId)))
          .limit(1);

        const hydrated = await hydrateRows({ tx, workspaceId: input.workspaceId, mails });

        return {
          mails,
          ...hydrated,
        };
      });
    },

    async resolveDraftForMailItem(input) {
      return withWorkspaceDb(input.workspaceId, async (tx) => findDraftForMailItem(tx, input));
    },

    async updateDraftFromMailItem(input) {
      return withWorkspaceDb(input.workspaceId, async (tx) => {
        const resolution = await findDraftForMailItem(tx, input);

        if (resolution.result !== "ok") {
          return resolution;
        }

        const editedAt = new Date();
        const [existingDraft] = await tx
          .select({
            id: drafts.id,
            metadataJson: drafts.metadataJson,
          })
          .from(drafts)
          .where(and(eq(drafts.workspaceId, input.workspaceId), eq(drafts.id, resolution.draftId)))
          .limit(1)
          .for("update", { of: drafts });

        if (!existingDraft) {
          return { result: "no_draft" };
        }

        const [updatedDraft] = await tx
          .update(drafts)
          .set({
            subject: input.data.subject,
            textBody: input.data.bodyText,
            metadataJson: clientEditMetadata(metadataRecord(existingDraft.metadataJson), editedAt),
          })
          .where(and(eq(drafts.workspaceId, input.workspaceId), eq(drafts.id, resolution.draftId)))
          .returning({
            draftId: drafts.id,
            status: drafts.status,
            updatedAt: drafts.updatedAt,
            metadataJson: drafts.metadataJson,
          });

        if (!updatedDraft) {
          return { result: "no_draft" };
        }

        await createActivityLog(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          action: "draft.updated",
          entityType: "draft",
          entityId: updatedDraft.draftId,
          metadataJson: {
            mailItemId: resolution.mailItemId,
            draftId: updatedDraft.draftId,
            source: "client_inbox",
            editedAt: editedAt.toISOString(),
          },
        });

        return {
          result: "ok",
          mailItemId: resolution.mailItemId,
          draftId: updatedDraft.draftId,
          status: updatedDraft.status,
          updatedAt: updatedDraft.updatedAt,
          metadataJson: metadataRecord(updatedDraft.metadataJson),
        };
      });
    },
  };
}
