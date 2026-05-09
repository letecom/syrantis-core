import { and, desc, eq, gt, sql } from "drizzle-orm";

import { backgroundJobs, leads, workspaceApiKeys } from "@syrantis/db";
import type { InboundMessageIntakeRequest } from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { hasText, publicInboundMessageSource, safeStringLength } from "../services/intake-shared.js";
import { createActivityLog } from "./activity-logs.js";
import { enqueueScoreLeadJob, type BackgroundJobRow } from "./background-jobs.js";

const databaseLeadSource = "email";
const idempotencyWindowMs = 24 * 60 * 60 * 1000;

export type InboundMessageLeadRow = Pick<typeof leads.$inferSelect, "id" | "createdAt">;

export type InboundMessageIntakeRepositoryInput = {
  workspaceId: string;
  apiKeyId: string;
  diagnosticTraceId: string;
  data: InboundMessageIntakeRequest;
};

export type InboundMessageIntakeRepositoryResult = {
  result: "created" | "idempotent_replay";
  lead: InboundMessageLeadRow;
  job: BackgroundJobRow;
};

function normalizedNullable(value: string | null | undefined): string | null {
  return value ?? null;
}

function summarizeRawContent(data: InboundMessageIntakeRequest): string {
  const parts = [
    `From: ${data.fromEmail}`,
    data.subject ? `Subject: ${data.subject}` : null,
    data.contactName ? `Contact: ${data.contactName}` : null,
    `Body: ${data.bodyText}`,
  ].filter(Boolean);

  return parts.join("\n\n");
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

    const externalId = normalizedNullable(input.data.externalId);

    if (externalId) {
      const lead = await findRecentIdempotentLead(tx, {
        workspaceId: input.workspaceId,
        externalId,
        createdAfter: new Date(Date.now() - idempotencyWindowMs),
      });

      if (lead) {
        const job = await findLatestScoreLeadJobForLead(tx, {
          workspaceId: input.workspaceId,
          leadId: lead.id,
        });

        if (!job) {
          throw new Error("Failed to load idempotent score_lead job.");
        }

        return {
          result: "idempotent_replay",
          lead,
          job,
        };
      }
    }

    const hasBody = hasText(input.data.bodyText);
    const subjectPresent = hasText(input.data.subject);
    const contactNamePresent = hasText(input.data.contactName);
    const apiSource = input.data.source;
    const receivedAt = input.data.receivedAt ? new Date(input.data.receivedAt) : new Date();

    const [lead] = await tx
      .insert(leads)
      .values({
        workspaceId: input.workspaceId,
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
        hasBody,
        subjectLength: safeStringLength(input.data.subject),
        bodyLength: safeStringLength(input.data.bodyText),
      },
    });

    return {
      result: "created",
      lead,
      job,
    };
  });
}
