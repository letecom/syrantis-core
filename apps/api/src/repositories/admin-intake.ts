import { count, and, eq } from "drizzle-orm";

import { backgroundJobs, leads } from "@syrantis/db";
import type { AdminIntakeTestEmailRequest } from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { hasText, inboundEmailTestSource, safeStringLength } from "../services/intake-shared.js";
import { createActivityLog } from "./activity-logs.js";
import { enqueueScoreLeadJob, type BackgroundJobRow } from "./background-jobs.js";

export type AdminIntakeCreatedLead = Pick<typeof leads.$inferSelect, "id" | "createdAt">;

export type AdminIntakeTestEmailRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  diagnosticTraceId: string;
  data: AdminIntakeTestEmailRequest;
};

export type AdminIntakeTestEmailRepositoryResult = {
  failedJobsBefore: number;
  lead: AdminIntakeCreatedLead;
  job: BackgroundJobRow;
};

function summarizeRawContent(data: AdminIntakeTestEmailRequest): string {
  const parts = [
    data.subject ? `Subject: ${data.subject}` : null,
    data.contactName ? `Contact: ${data.contactName}` : null,
    data.bodyText ? `Body: ${data.bodyText}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("\n\n") : "Inbound email test lead.";
}

async function countFailedJobs(tx: WorkspaceDbTransaction, workspaceId: string): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.workspaceId, workspaceId), eq(backgroundJobs.status, "failed")));

  return row?.value ?? 0;
}

export async function createAdminIntakeTestEmail(
  input: AdminIntakeTestEmailRepositoryInput,
): Promise<AdminIntakeTestEmailRepositoryResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const failedJobsBefore = await countFailedJobs(tx, input.workspaceId);
    const hasBody = hasText(input.data.bodyText);
    const subjectPresent = hasText(input.data.subject);
    const contactNamePresent = hasText(input.data.contactName);

    const [lead] = await tx
      .insert(leads)
      .values({
        workspaceId: input.workspaceId,
        source: "email",
        status: "new",
        rawContent: summarizeRawContent(input.data),
        normalizedJson: {
          source: inboundEmailTestSource,
          origin: inboundEmailTestSource,
          testLabel: input.data.testLabel ?? null,
          diagnosticTraceId: input.diagnosticTraceId,
          hasBody,
          subjectPresent,
          contactNamePresent,
          subjectLength: safeStringLength(input.data.subject),
          bodyLength: safeStringLength(input.data.bodyText),
        },
        receivedAt: new Date(),
      })
      .returning({
        id: leads.id,
        createdAt: leads.createdAt,
      });

    if (!lead) {
      throw new Error("Failed to create inbound email test lead.");
    }

    const job = await enqueueScoreLeadJob(tx, {
      workspaceId: input.workspaceId,
      leadId: lead.id,
    });

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "inbound_test.created",
      entityType: "lead",
      entityId: lead.id,
      metadataJson: {
        source: inboundEmailTestSource,
        testLabel: input.data.testLabel ?? null,
        diagnosticTraceId: input.diagnosticTraceId,
        hasBody,
        subjectLength: safeStringLength(input.data.subject),
        bodyLength: safeStringLength(input.data.bodyText),
      },
    });

    return {
      failedJobsBefore,
      lead,
      job,
    };
  });
}
