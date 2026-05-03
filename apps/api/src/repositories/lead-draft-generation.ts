import { and, eq } from "drizzle-orm";

import { leads } from "@syrantis/db";

import { withWorkspaceDb } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";
import {
  enqueueGenerateAiDraftJob,
  findActiveGenerateAiDraftJob,
  type BackgroundJobRow,
} from "./background-jobs.js";

export type RequestLeadDraftGenerationInput = {
  workspaceId: string;
  actorUserId: string;
  leadId: string;
};

export type RequestLeadDraftGenerationResult =
  | { result: "ok"; job: BackgroundJobRow; leadId: string }
  | { result: "not_found" };

export async function requestLeadDraftGeneration(
  input: RequestLeadDraftGenerationInput,
): Promise<RequestLeadDraftGenerationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [lead] = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.id, input.leadId), eq(leads.workspaceId, input.workspaceId)))
      .limit(1);

    if (!lead) {
      return { result: "not_found" };
    }

    const job =
      (await findActiveGenerateAiDraftJob(tx, {
        workspaceId: input.workspaceId,
        leadId: input.leadId,
      })) ??
      (await enqueueGenerateAiDraftJob(tx, {
        workspaceId: input.workspaceId,
        leadId: input.leadId,
      }));

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "draft.ai_generation_requested",
      entityType: "lead",
      entityId: input.leadId,
      metadataJson: {
        leadId: input.leadId,
        jobId: job.id,
      },
    });

    return { result: "ok", job, leadId: input.leadId };
  });
}
