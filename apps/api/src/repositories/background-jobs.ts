import { and, eq, inArray, sql } from "drizzle-orm";

import { backgroundJobs } from "@syrantis/db";
import type {
  GenerateAiDraftJobPayload,
  ScoreLeadJobPayload,
  SendEmailJobPayload,
} from "@syrantis/shared";

import type { WorkspaceDbTransaction } from "../lib/db.js";
import { getWorkerDbClient } from "../lib/worker-db.js";

export type BackgroundJobRow = typeof backgroundJobs.$inferSelect;

export type EnqueueSendEmailJobInput = {
  workspaceId: string;
  emailSendId: string;
  runAfter?: Date;
};

export type EnqueueScoreLeadJobInput = {
  workspaceId: string;
  leadId: string;
  runAfter?: Date;
};

export type EnqueueGenerateAiDraftJobInput = {
  workspaceId: string;
  leadId: string;
  runAfter?: Date;
};

export type FindActiveGenerateAiDraftJobInput = {
  workspaceId: string;
  leadId: string;
};

export type ClaimNextBackgroundJobInput = {
  workerId: string;
};

export type CompleteBackgroundJobInput = {
  workspaceId: string;
  jobId: string;
};

export type FailBackgroundJobInput = {
  workspaceId: string;
  jobId: string;
  errorCode: string;
  errorMessage: string;
};

type RawBackgroundJobRow = {
  id: string;
  workspace_id: string;
  type: string;
  payload_json: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after: Date;
  locked_at: Date | null;
  locked_by: string | null;
  completed_at: Date | null;
  failed_at: Date | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

type QueryResultLike<T> = {
  rows?: T[];
};

function mapRawBackgroundJobRow(row: RawBackgroundJobRow): BackgroundJobRow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type,
    payloadJson: row.payload_json,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAfter: row.run_after,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function compactErrorMessage(message: string): string {
  return message.trim().slice(0, 500);
}

export async function enqueueSendEmailJob(
  tx: WorkspaceDbTransaction,
  input: EnqueueSendEmailJobInput,
): Promise<BackgroundJobRow> {
  const payload: SendEmailJobPayload = {
    emailSendId: input.emailSendId,
  };

  const [job] = await tx
    .insert(backgroundJobs)
    .values({
      workspaceId: input.workspaceId,
      type: "send_email",
      payloadJson: payload,
      status: "pending",
      runAfter: input.runAfter ?? new Date(),
    })
    .returning();

  if (!job) {
    throw new Error("Failed to enqueue send_email job.");
  }

  return job;
}

export async function enqueueScoreLeadJob(
  tx: WorkspaceDbTransaction,
  input: EnqueueScoreLeadJobInput,
): Promise<BackgroundJobRow> {
  const payload: ScoreLeadJobPayload = {
    leadId: input.leadId,
  };

  const [job] = await tx
    .insert(backgroundJobs)
    .values({
      workspaceId: input.workspaceId,
      type: "score_lead",
      payloadJson: payload,
      status: "pending",
      runAfter: input.runAfter ?? new Date(),
    })
    .returning();

  if (!job) {
    throw new Error("Failed to enqueue score_lead job.");
  }

  return job;
}

export async function findActiveGenerateAiDraftJob(
  tx: WorkspaceDbTransaction,
  input: FindActiveGenerateAiDraftJobInput,
): Promise<BackgroundJobRow | null> {
  const [job] = await tx
    .select()
    .from(backgroundJobs)
    .where(
      and(
        eq(backgroundJobs.workspaceId, input.workspaceId),
        eq(backgroundJobs.type, "generate_ai_draft"),
        inArray(backgroundJobs.status, ["pending", "running"]),
        sql`${backgroundJobs.payloadJson}->>'leadId' = ${input.leadId}`,
      ),
    )
    .limit(1);

  return job ?? null;
}

export async function enqueueGenerateAiDraftJob(
  tx: WorkspaceDbTransaction,
  input: EnqueueGenerateAiDraftJobInput,
): Promise<BackgroundJobRow> {
  const payload: GenerateAiDraftJobPayload = {
    leadId: input.leadId,
  };

  const [job] = await tx
    .insert(backgroundJobs)
    .values({
      workspaceId: input.workspaceId,
      type: "generate_ai_draft",
      payloadJson: payload,
      status: "pending",
      runAfter: input.runAfter ?? new Date(),
    })
    .returning();

  if (!job) {
    throw new Error("Failed to enqueue generate_ai_draft job.");
  }

  return job;
}

export async function claimNextBackgroundJob(
  input: ClaimNextBackgroundJobInput,
): Promise<BackgroundJobRow | null> {
  const { db } = getWorkerDbClient();

  return db.transaction(async (tx) => {
    const result = (await tx.execute(sql`
      WITH candidate AS (
        SELECT id
        FROM background_jobs
        WHERE
          (
            status = 'pending'
            AND run_after <= now()
          )
          OR (
            status = 'running'
            AND locked_at < now() - interval '5 minutes'
          )
        ORDER BY run_after ASC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE background_jobs
      SET
        status = 'running',
        locked_at = now(),
        locked_by = ${input.workerId},
        attempts = attempts + 1,
        updated_at = now()
      FROM candidate
      WHERE background_jobs.id = candidate.id
      RETURNING
        background_jobs.id,
        background_jobs.workspace_id,
        background_jobs.type,
        background_jobs.payload_json,
        background_jobs.status,
        background_jobs.attempts,
        background_jobs.max_attempts,
        background_jobs.run_after,
        background_jobs.locked_at,
        background_jobs.locked_by,
        background_jobs.completed_at,
        background_jobs.failed_at,
        background_jobs.last_error_code,
        background_jobs.last_error_message,
        background_jobs.created_at,
        background_jobs.updated_at
    `)) as QueryResultLike<RawBackgroundJobRow>;

    const [job] = result.rows ?? [];
    return job ? mapRawBackgroundJobRow(job) : null;
  });
}

export async function completeBackgroundJob(
  tx: WorkspaceDbTransaction,
  input: CompleteBackgroundJobInput,
): Promise<BackgroundJobRow> {
  const [job] = await tx
    .update(backgroundJobs)
    .set({
      status: "completed",
      completedAt: new Date(),
      failedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    })
    .where(and(eq(backgroundJobs.id, input.jobId), eq(backgroundJobs.workspaceId, input.workspaceId)))
    .returning();

  if (!job) {
    throw new Error("BACKGROUND_JOB_NOT_FOUND");
  }

  return job;
}

export async function failBackgroundJob(
  tx: WorkspaceDbTransaction,
  input: FailBackgroundJobInput,
): Promise<BackgroundJobRow> {
  const [job] = await tx
    .update(backgroundJobs)
    .set({
      status: "failed",
      failedAt: new Date(),
      lastErrorCode: input.errorCode,
      lastErrorMessage: compactErrorMessage(input.errorMessage),
    })
    .where(and(eq(backgroundJobs.id, input.jobId), eq(backgroundJobs.workspaceId, input.workspaceId)))
    .returning();

  if (!job) {
    throw new Error("BACKGROUND_JOB_NOT_FOUND");
  }

  return job;
}
