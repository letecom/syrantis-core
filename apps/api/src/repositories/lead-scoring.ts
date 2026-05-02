import { and, eq } from "drizzle-orm";

import { leads } from "@syrantis/db";

import { withWorkspaceDb } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";
import { enqueueScoreLeadJob, type BackgroundJobRow } from "./background-jobs.js";

export type RequestLeadScoreInput = {
  workspaceId: string;
  actorUserId: string;
  leadId: string;
};

export type RequestLeadScoreResult =
  | { result: "ok"; job: BackgroundJobRow; leadId: string }
  | { result: "not_found" };

export async function requestLeadScore(input: RequestLeadScoreInput): Promise<RequestLeadScoreResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [lead] = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.id, input.leadId), eq(leads.workspaceId, input.workspaceId)))
      .limit(1);

    if (!lead) {
      return { result: "not_found" };
    }

    const job = await enqueueScoreLeadJob(tx, {
      workspaceId: input.workspaceId,
      leadId: input.leadId,
    });

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "lead.score_requested",
      entityType: "lead",
      entityId: input.leadId,
      metadataJson: {
        jobId: job.id,
      },
    });

    return { result: "ok", job, leadId: input.leadId };
  });
}
