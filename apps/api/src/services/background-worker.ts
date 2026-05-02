import { ScoreLeadJobPayloadSchema, SendEmailJobPayloadSchema } from "@syrantis/shared";

import { withWorkspaceDb } from "../lib/db.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import {
  claimNextBackgroundJob,
  completeBackgroundJob,
  failBackgroundJob,
  type BackgroundJobRow,
} from "../repositories/background-jobs.js";
import { handleSendEmailJob } from "./send-email-job-handler.js";
import { handleScoreLeadJob } from "./score-lead-job-handler.js";

export type ProcessNextBackgroundJobInput = {
  workerId: string;
};

export type ProcessNextBackgroundJobResult =
  | { status: "idle" }
  | { status: "completed"; job: BackgroundJobRow }
  | { status: "failed"; job: BackgroundJobRow; errorCode: string };

function resolveErrorCode(error: unknown): string {
  if (error instanceof Error && error.name === "ZodError") {
    return "INVALID_JOB_PAYLOAD";
  }

  if (error instanceof Error && error.message) {
    return error.message.trim().slice(0, 120) || "BACKGROUND_JOB_FAILED";
  }

  return "BACKGROUND_JOB_FAILED";
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.trim().slice(0, 500);
  }

  return "Background job failed.";
}

export async function processNextBackgroundJob(
  input: ProcessNextBackgroundJobInput,
): Promise<ProcessNextBackgroundJobResult> {
  const job = await claimNextBackgroundJob({
    workerId: input.workerId,
  });

  if (!job) {
    return { status: "idle" };
  }

  try {
    if (job.type === "score_lead") {
      const payload = ScoreLeadJobPayloadSchema.parse(job.payloadJson);

      await withWorkspaceDb(job.workspaceId, async (tx) => {
        await createActivityLog(tx, {
          workspaceId: job.workspaceId,
          actorUserId: null,
          action: "background_job.claimed",
          entityType: "background_job",
          entityId: job.id,
          metadataJson: {
            jobId: job.id,
            type: job.type,
            workerId: input.workerId,
            attempts: job.attempts,
          },
        });
      });

      await handleScoreLeadJob({
        workspaceId: job.workspaceId,
        jobId: job.id,
        payload,
      });

      const completedJob = await withWorkspaceDb(job.workspaceId, async (tx) => {
        const completed = await completeBackgroundJob(tx, {
          workspaceId: job.workspaceId,
          jobId: job.id,
        });

        await createActivityLog(tx, {
          workspaceId: job.workspaceId,
          actorUserId: null,
          action: "background_job.completed",
          entityType: "background_job",
          entityId: job.id,
          metadataJson: {
            jobId: job.id,
            type: job.type,
            workerId: input.workerId,
          },
        });

        return completed;
      });

      return { status: "completed", job: completedJob };
    }

    if (job.type !== "send_email") {
      throw new Error("BACKGROUND_JOB_TYPE_UNSUPPORTED");
    }

    const payload = SendEmailJobPayloadSchema.parse(job.payloadJson);

    await withWorkspaceDb(job.workspaceId, async (tx) => {
      await createActivityLog(tx, {
        workspaceId: job.workspaceId,
        actorUserId: null,
        action: "background_job.claimed",
        entityType: "background_job",
        entityId: job.id,
        metadataJson: {
          jobId: job.id,
          type: job.type,
          workerId: input.workerId,
          attempts: job.attempts,
        },
      });
    });

    await handleSendEmailJob({
      workspaceId: job.workspaceId,
      jobId: job.id,
      payload,
    });

    const completedJob = await withWorkspaceDb(job.workspaceId, async (tx) => {
      const completionMetadata: Record<string, unknown> = {
        jobId: job.id,
        type: job.type,
        workerId: input.workerId,
        emailSendId: payload.emailSendId,
      };

      const completed = await completeBackgroundJob(tx, {
        workspaceId: job.workspaceId,
        jobId: job.id,
      });

      await createActivityLog(tx, {
        workspaceId: job.workspaceId,
        actorUserId: null,
        action: "background_job.completed",
        entityType: "background_job",
        entityId: job.id,
        metadataJson: completionMetadata,
      });

      return completed;
    });

    return { status: "completed", job: completedJob };
  } catch (error) {
    const errorCode = resolveErrorCode(error);
    const errorMessage = resolveErrorMessage(error);

    const failedJob = await withWorkspaceDb(job.workspaceId, async (tx) => {
      const failed = await failBackgroundJob(tx, {
        workspaceId: job.workspaceId,
        jobId: job.id,
        errorCode,
        errorMessage,
      });

      await createActivityLog(tx, {
        workspaceId: job.workspaceId,
        actorUserId: null,
        action: "background_job.failed",
        entityType: "background_job",
        entityId: job.id,
        metadataJson: {
          jobId: job.id,
          type: job.type,
          workerId: input.workerId,
          errorCode,
          attempts: job.attempts,
        },
      });

      return failed;
    });

    return { status: "failed", job: failedJob, errorCode };
  }
}
