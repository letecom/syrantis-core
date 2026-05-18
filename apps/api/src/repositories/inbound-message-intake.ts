import { and, desc, eq, gt, sql } from "drizzle-orm";

import {
  backgroundJobs,
  clientMailItems,
  contacts,
  intakeClassifications,
  leads,
  workspaceApiKeys,
} from "@syrantis/db";
import type { InboundMessageIntakeRequest } from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import {
  classifyInboundMessage,
  type IntakeClassifierResult,
} from "../services/intake-classifier.service.js";
import {
  hasText,
  publicInboundMessageSource,
  safeStringLength,
} from "../services/intake-shared.js";
import { createActivityLog } from "./activity-logs.js";
import { enqueueScoreLeadJob, type BackgroundJobRow } from "./background-jobs.js";

const databaseLeadSource = "email";
const idempotencyWindowMs = 24 * 60 * 60 * 1000;

export type InboundMessageLeadRow = Pick<
  typeof leads.$inferSelect,
  "id" | "contactId" | "createdAt"
>;

export type InboundMessageContactRow = Pick<typeof contacts.$inferSelect, "id" | "email">;

export type InboundMessageIntakeRepositoryInput = {
  workspaceId: string;
  apiKeyId: string;
  diagnosticTraceId: string;
  data: InboundMessageIntakeRequest;
};

export type InboundMessageIntakeRepositoryResult = {
  result: "created" | "idempotent_replay" | "ignored" | "idempotent_ignored";
  lead: InboundMessageLeadRow | null;
  job: BackgroundJobRow | null;
  classification: IntakeClassifierResult & {
    diagnosticTraceId: string;
    classificationId: string;
  };
};

type IntakeClassificationRow = Pick<
  typeof intakeClassifications.$inferSelect,
  | "id"
  | "classification"
  | "category"
  | "action"
  | "confidence"
  | "reasonCode"
  | "diagnosticTraceId"
  | "suggestedLabels"
  | "leadId"
>;

type ClientMailItemRow = Pick<typeof clientMailItems.$inferSelect, "id">;

function normalizedNullable(value: string | null | undefined): string | null {
  return value ?? null;
}

function normalizeExternalId(data: InboundMessageIntakeRequest, diagnosticTraceId: string): string {
  return (
    normalizedNullable(data.externalId) ??
    normalizedNullable(data.messageId) ??
    `generated:${diagnosticTraceId}`
  );
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function summarizeRawContent(data: InboundMessageIntakeRequest): string {
  const parts = [
    "Public inbound message captured for the Client Inbox Domain.",
    `Source: ${data.source}`,
    `Has subject: ${hasText(data.subject)}`,
    `Has body: ${hasText(data.bodyText)}`,
    `Has contact name: ${hasText(data.contactName)}`,
  ];

  return parts.join("\n\n");
}

function normalizeMailExternalId(data: InboundMessageIntakeRequest): string | null {
  return normalizedNullable(data.externalId) ?? normalizedNullable(data.messageId);
}

function normalizeMailSnippet(data: InboundMessageIntakeRequest): string | null {
  return normalizedNullable(data.bodySnippet) ?? data.bodyText.slice(0, 280);
}

async function updateClientMailItemLinks(
  tx: WorkspaceDbTransaction,
  input: {
    workspaceId: string;
    mailItemId: string;
    classificationId: string;
    leadId: string | null;
    contactId: string | null;
  },
): Promise<void> {
  await tx
    .update(clientMailItems)
    .set({
      classificationId: input.classificationId,
      leadId: input.leadId,
      contactId: input.contactId,
    })
    .where(
      and(
        eq(clientMailItems.workspaceId, input.workspaceId),
        eq(clientMailItems.id, input.mailItemId),
      ),
    );
}

async function findClientMailItemByExternalId(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; externalId: string },
): Promise<ClientMailItemRow | null> {
  const [row] = await tx
    .select({ id: clientMailItems.id })
    .from(clientMailItems)
    .where(
      and(
        eq(clientMailItems.workspaceId, input.workspaceId),
        eq(clientMailItems.externalId, input.externalId),
      ),
    )
    .limit(1);

  return row ?? null;
}

async function createOrReuseClientMailItem(
  tx: WorkspaceDbTransaction,
  input: {
    workspaceId: string;
    data: InboundMessageIntakeRequest;
    classificationId: string;
    leadId: string | null;
    contactId: string | null;
  },
): Promise<ClientMailItemRow> {
  const mailExternalId = normalizeMailExternalId(input.data);
  const receivedAt = input.data.receivedAt ? new Date(input.data.receivedAt) : new Date();
  const [inserted] = await tx
    .insert(clientMailItems)
    .values({
      workspaceId: input.workspaceId,
      classificationId: input.classificationId,
      leadId: input.leadId,
      contactId: input.contactId,
      externalId: mailExternalId,
      externalThreadId: normalizedNullable(input.data.threadId),
      source: input.data.source,
      direction: "inbound",
      fromDisplay: normalizedNullable(input.data.contactName),
      fromEmail: input.data.fromEmail,
      toDisplay: normalizedNullable(input.data.toDisplay),
      toEmail: normalizedNullable(input.data.toEmail),
      subject: normalizedNullable(input.data.subject),
      snippet: normalizeMailSnippet(input.data),
      bodyText: input.data.bodyText,
      receivedAt,
      hasAttachments: false,
      attachmentsJson: [],
    })
    .onConflictDoNothing({
      target: [clientMailItems.workspaceId, clientMailItems.externalId],
      where: sql`${clientMailItems.externalId} is not null`,
    })
    .returning({ id: clientMailItems.id });

  if (inserted) {
    return inserted;
  }

  if (!mailExternalId) {
    throw new Error("Failed to create client mail item.");
  }

  const existing = await findClientMailItemByExternalId(tx, {
    workspaceId: input.workspaceId,
    externalId: mailExternalId,
  });

  if (!existing) {
    throw new Error("Failed to load idempotent client mail item.");
  }

  await updateClientMailItemLinks(tx, {
    workspaceId: input.workspaceId,
    mailItemId: existing.id,
    classificationId: input.classificationId,
    leadId: input.leadId,
    contactId: input.contactId,
  });

  return existing;
}

async function markApiKeyUsed(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; apiKeyId: string },
): Promise<void> {
  await tx
    .update(workspaceApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(workspaceApiKeys.workspaceId, input.workspaceId),
        eq(workspaceApiKeys.id, input.apiKeyId),
        eq(workspaceApiKeys.status, "active"),
      ),
    );
}

async function findRecentIdempotentLead(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; externalId: string; createdAfter: Date },
): Promise<InboundMessageLeadRow | null> {
  const [lead] = await tx
    .select({
      id: leads.id,
      contactId: leads.contactId,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(
      and(
        eq(leads.workspaceId, input.workspaceId),
        eq(leads.source, databaseLeadSource),
        sql`${leads.normalizedJson}->>'source' = ${publicInboundMessageSource}`,
        sql`${leads.normalizedJson}->>'externalId' = ${input.externalId}`,
        gt(leads.createdAt, input.createdAfter),
      ),
    )
    .orderBy(desc(leads.createdAt))
    .limit(1);

  return lead ?? null;
}

function mapClassificationRow(
  row: IntakeClassificationRow,
): InboundMessageIntakeRepositoryResult["classification"] {
  return {
    classification: row.classification as IntakeClassifierResult["classification"],
    category: row.category,
    action: row.action as IntakeClassifierResult["action"],
    confidence: row.confidence as IntakeClassifierResult["confidence"],
    reasonCode: row.reasonCode,
    diagnosticTraceId: row.diagnosticTraceId,
    suggestedLabels: row.suggestedLabels,
    classificationId: row.id,
  };
}

function safeClassificationMetadata(classification: IntakeClassifierResult) {
  return {
    category: classification.category,
    action: classification.action,
    reasonCode: classification.reasonCode,
    confidence: classification.confidence,
  };
}

async function findClassificationByExternalId(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; externalId: string },
): Promise<IntakeClassificationRow | null> {
  const [row] = await tx
    .select({
      id: intakeClassifications.id,
      classification: intakeClassifications.classification,
      category: intakeClassifications.category,
      action: intakeClassifications.action,
      confidence: intakeClassifications.confidence,
      reasonCode: intakeClassifications.reasonCode,
      diagnosticTraceId: intakeClassifications.diagnosticTraceId,
      suggestedLabels: intakeClassifications.suggestedLabels,
      leadId: intakeClassifications.leadId,
    })
    .from(intakeClassifications)
    .where(
      and(
        eq(intakeClassifications.workspaceId, input.workspaceId),
        eq(intakeClassifications.externalId, input.externalId),
      ),
    )
    .limit(1);

  return row ?? null;
}

async function insertClassificationIfAbsent(
  tx: WorkspaceDbTransaction,
  input: {
    workspaceId: string;
    externalId: string;
    diagnosticTraceId: string;
    classification: IntakeClassifierResult;
  },
): Promise<IntakeClassificationRow | null> {
  const [row] = await tx
    .insert(intakeClassifications)
    .values({
      workspaceId: input.workspaceId,
      externalId: input.externalId,
      classification: input.classification.classification,
      category: input.classification.category,
      action: input.classification.action,
      confidence: input.classification.confidence,
      reasonCode: input.classification.reasonCode,
      diagnosticTraceId: input.diagnosticTraceId,
      suggestedLabels: input.classification.suggestedLabels,
      leadId: null,
    })
    .onConflictDoNothing({
      target: [intakeClassifications.workspaceId, intakeClassifications.externalId],
    })
    .returning({
      id: intakeClassifications.id,
      classification: intakeClassifications.classification,
      category: intakeClassifications.category,
      action: intakeClassifications.action,
      confidence: intakeClassifications.confidence,
      reasonCode: intakeClassifications.reasonCode,
      diagnosticTraceId: intakeClassifications.diagnosticTraceId,
      suggestedLabels: intakeClassifications.suggestedLabels,
      leadId: intakeClassifications.leadId,
    });

  return row ?? null;
}

async function attachLeadToClassification(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; classificationId: string; leadId: string },
): Promise<void> {
  await tx
    .update(intakeClassifications)
    .set({ leadId: input.leadId })
    .where(
      and(
        eq(intakeClassifications.workspaceId, input.workspaceId),
        eq(intakeClassifications.id, input.classificationId),
      ),
    );
}

async function findContactByNormalizedEmail(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; email: string },
): Promise<InboundMessageContactRow | null> {
  const [contact] = await tx
    .select({
      id: contacts.id,
      email: contacts.email,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, input.workspaceId),
        sql`lower(btrim(${contacts.email})) = ${input.email}`,
      ),
    )
    .limit(1);

  return contact ?? null;
}

async function findOrCreateInboundContact(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; fromEmail: string },
): Promise<InboundMessageContactRow> {
  const email = normalizeEmail(input.fromEmail);
  const existing = await findContactByNormalizedEmail(tx, {
    workspaceId: input.workspaceId,
    email,
  });

  if (existing) {
    return existing;
  }

  const [contact] = await tx
    .insert(contacts)
    .values({
      workspaceId: input.workspaceId,
      email,
      metadataJson: {
        origin: publicInboundMessageSource,
      },
    })
    .returning({
      id: contacts.id,
      email: contacts.email,
    });

  if (!contact) {
    throw new Error("Failed to create public inbound message contact.");
  }

  return contact;
}

async function findLatestScoreLeadJobForLead(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; leadId: string },
): Promise<BackgroundJobRow | null> {
  const [job] = await tx
    .select()
    .from(backgroundJobs)
    .where(
      and(
        eq(backgroundJobs.workspaceId, input.workspaceId),
        eq(backgroundJobs.type, "score_lead"),
        sql`${backgroundJobs.payloadJson}->>'leadId' = ${input.leadId}`,
      ),
    )
    .orderBy(desc(backgroundJobs.createdAt))
    .limit(1);

  return job ?? null;
}

export async function createInboundMessageIntake(
  input: InboundMessageIntakeRepositoryInput,
): Promise<InboundMessageIntakeRepositoryResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    await markApiKeyUsed(tx, {
      workspaceId: input.workspaceId,
      apiKeyId: input.apiKeyId,
    });

    const externalId = normalizeExternalId(input.data, input.diagnosticTraceId);
    const existingClassification = await findClassificationByExternalId(tx, {
      workspaceId: input.workspaceId,
      externalId,
    });

    if (existingClassification) {
      const classification = mapClassificationRow(existingClassification);

      if (existingClassification.leadId) {
        const lead =
          (await findRecentIdempotentLead(tx, {
            workspaceId: input.workspaceId,
            externalId,
            createdAfter: new Date(Date.now() - idempotencyWindowMs),
          })) ??
          ({
            id: existingClassification.leadId,
            contactId: null,
            createdAt: new Date(),
          } satisfies InboundMessageLeadRow);
        const job = await findLatestScoreLeadJobForLead(tx, {
          workspaceId: input.workspaceId,
          leadId: existingClassification.leadId,
        });
        await createOrReuseClientMailItem(tx, {
          workspaceId: input.workspaceId,
          data: input.data,
          classificationId: existingClassification.id,
          leadId: existingClassification.leadId,
          contactId: lead.contactId,
        });

        return {
          result: "idempotent_replay",
          lead,
          job,
          classification,
        };
      }

      await createOrReuseClientMailItem(tx, {
        workspaceId: input.workspaceId,
        data: input.data,
        classificationId: existingClassification.id,
        leadId: null,
        contactId: null,
      });

      return {
        result: "idempotent_ignored",
        lead: null,
        job: null,
        classification,
      };
    }

    const classificationResult = classifyInboundMessage({
      fromEmail: input.data.fromEmail,
      subject: input.data.subject,
      bodySnippet: input.data.bodySnippet ?? input.data.bodyText,
      isBulk: input.data.isBulk,
    });
    const insertedClassification = await insertClassificationIfAbsent(tx, {
      workspaceId: input.workspaceId,
      externalId,
      diagnosticTraceId: input.diagnosticTraceId,
      classification: classificationResult,
    });

    if (!insertedClassification) {
      const replayedClassification = await findClassificationByExternalId(tx, {
        workspaceId: input.workspaceId,
        externalId,
      });

      if (!replayedClassification) {
        throw new Error("Failed to load idempotent intake classification.");
      }

      const classification = mapClassificationRow(replayedClassification);

      if (!replayedClassification.leadId) {
        await createOrReuseClientMailItem(tx, {
          workspaceId: input.workspaceId,
          data: input.data,
          classificationId: replayedClassification.id,
          leadId: null,
          contactId: null,
        });

        return {
          result: "idempotent_ignored",
          lead: null,
          job: null,
          classification,
        };
      }

      const job = await findLatestScoreLeadJobForLead(tx, {
        workspaceId: input.workspaceId,
        leadId: replayedClassification.leadId,
      });
      await createOrReuseClientMailItem(tx, {
        workspaceId: input.workspaceId,
        data: input.data,
        classificationId: replayedClassification.id,
        leadId: replayedClassification.leadId,
        contactId: null,
      });

      return {
        result: "idempotent_replay",
        lead: {
          id: replayedClassification.leadId,
          contactId: null,
          createdAt: new Date(),
        },
        job,
        classification,
      };
    }

    const classification = mapClassificationRow(insertedClassification);

    if (classificationResult.classification === "ignored") {
      await createOrReuseClientMailItem(tx, {
        workspaceId: input.workspaceId,
        data: input.data,
        classificationId: insertedClassification.id,
        leadId: null,
        contactId: null,
      });

      await createActivityLog(tx, {
        workspaceId: input.workspaceId,
        actorUserId: null,
        action: "public_inbound_message.ignored",
        entityType: "lead",
        entityId: null,
        metadataJson: {
          source: publicInboundMessageSource,
          diagnosticTraceId: input.diagnosticTraceId,
          classificationId: insertedClassification.id,
          ...safeClassificationMetadata(classificationResult),
        },
      });

      return {
        result: "ignored",
        lead: null,
        job: null,
        classification,
      };
    }

    const hasBody = hasText(input.data.bodyText);
    const subjectPresent = hasText(input.data.subject);
    const contactNamePresent = hasText(input.data.contactName);
    const apiSource = input.data.source;
    const receivedAt = input.data.receivedAt ? new Date(input.data.receivedAt) : new Date();
    const contact = await findOrCreateInboundContact(tx, {
      workspaceId: input.workspaceId,
      fromEmail: input.data.fromEmail,
    });

    const [lead] = await tx
      .insert(leads)
      .values({
        workspaceId: input.workspaceId,
        contactId: contact.id,
        source: databaseLeadSource,
        status: "new",
        rawContent: summarizeRawContent(input.data),
        normalizedJson: {
          source: publicInboundMessageSource,
          origin: publicInboundMessageSource,
          apiSource,
          ...(externalId ? { externalId } : {}),
          ...(input.data.receivedAt ? { receivedAt: input.data.receivedAt } : {}),
          diagnosticTraceId: input.diagnosticTraceId,
          intakeClassification: safeClassificationMetadata(classificationResult),
          hasBody,
          subjectPresent,
          contactNamePresent,
          subjectLength: safeStringLength(input.data.subject),
          bodyLength: safeStringLength(input.data.bodyText),
        },
        receivedAt,
      })
      .returning({
        id: leads.id,
        contactId: leads.contactId,
        createdAt: leads.createdAt,
      });

    if (!lead) {
      throw new Error("Failed to create public inbound message lead.");
    }

    const job = await enqueueScoreLeadJob(tx, {
      workspaceId: input.workspaceId,
      leadId: lead.id,
      diagnosticTraceId: input.diagnosticTraceId,
      source: publicInboundMessageSource,
    });

    await attachLeadToClassification(tx, {
      workspaceId: input.workspaceId,
      classificationId: insertedClassification.id,
      leadId: lead.id,
    });

    await createOrReuseClientMailItem(tx, {
      workspaceId: input.workspaceId,
      data: input.data,
      classificationId: insertedClassification.id,
      leadId: lead.id,
      contactId: contact.id,
    });

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "public_inbound_message.created",
      entityType: "lead",
      entityId: lead.id,
      metadataJson: {
        source: publicInboundMessageSource,
        apiSource,
        hasExternalId: Boolean(externalId),
        diagnosticTraceId: input.diagnosticTraceId,
        leadId: lead.id,
        scoringJobId: job.id,
        ...safeClassificationMetadata(classificationResult),
        hasBody,
        subjectLength: safeStringLength(input.data.subject),
        bodyLength: safeStringLength(input.data.bodyText),
      },
    });

    return {
      result: "created",
      lead,
      job,
      classification,
    };
  });
}
