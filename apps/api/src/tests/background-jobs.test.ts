import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BackgroundJobRow } from "../repositories/background-jobs.js";
import { testUser } from "./mocks/auth.js";

const jobId = "00000000-0000-4000-8000-000000002001";
const staleJobId = "00000000-0000-4000-8000-000000002002";
const emailSendId = "00000000-0000-4000-8000-000000002101";
const leadId = "00000000-0000-4000-8000-000000002102";
const workerId = "test-worker-1";

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

function rawJob(overrides: Partial<RawBackgroundJobRow> = {}): RawBackgroundJobRow {
  return {
    id: jobId,
    workspace_id: testUser.workspaceId,
    type: "send_email",
    payload_json: { emailSendId },
    status: "pending",
    attempts: 0,
    max_attempts: 3,
    run_after: new Date("2026-05-01T12:00:00.000Z"),
    locked_at: null,
    locked_by: null,
    completed_at: null,
    failed_at: null,
    last_error_code: null,
    last_error_message: null,
    created_at: new Date("2026-05-01T12:00:00.000Z"),
    updated_at: new Date("2026-05-01T12:00:00.000Z"),
    ...overrides,
  };
}

function jobRow(overrides: Partial<BackgroundJobRow> = {}): BackgroundJobRow {
  return {
    id: jobId,
    workspaceId: testUser.workspaceId,
    type: "send_email",
    payloadJson: { emailSendId },
    status: "running",
    attempts: 1,
    maxAttempts: 3,
    runAfter: new Date("2026-05-01T12:00:00.000Z"),
    lockedAt: new Date("2026-05-01T12:01:00.000Z"),
    lockedBy: workerId,
    completedAt: null,
    failedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: new Date("2026-05-01T12:00:00.000Z"),
    updatedAt: new Date("2026-05-01T12:01:00.000Z"),
    ...overrides,
  };
}

function createClaimHarness(initialJobs: RawBackgroundJobRow[]) {
  const jobs = initialJobs.map((job) => ({ ...job }));
  const now = new Date("2026-05-01T12:10:00.000Z");
  const staleBefore = new Date(now.getTime() - 5 * 60 * 1000);

  const tx = {
    execute: vi.fn(async () => {
      const candidate = jobs
        .filter((job) => {
          const isDuePending = job.status === "pending" && job.run_after <= now;
          const isStaleRunning =
            job.status === "running" && job.locked_at !== null && job.locked_at < staleBefore;
          return isDuePending || isStaleRunning;
        })
        .sort((a, b) => {
          const byRunAfter = a.run_after.getTime() - b.run_after.getTime();
          return byRunAfter !== 0 ? byRunAfter : a.created_at.getTime() - b.created_at.getTime();
        })[0];

      if (!candidate) {
        return { rows: [] };
      }

      candidate.status = "running";
      candidate.locked_at = now;
      candidate.locked_by = workerId;
      candidate.attempts += 1;
      candidate.updated_at = now;

      return { rows: [candidate] };
    }),
  };

  type ClaimTx = typeof tx;

  const db = {
    transaction: vi.fn(async (fn: (transaction: ClaimTx) => Promise<unknown>) => fn(tx)),
  };

  return {
    db,
    tx,
    jobs,
  };
}

async function importBackgroundJobsRepositoryWithClaimHarness(harness: ReturnType<typeof createClaimHarness>) {
  vi.resetModules();
  vi.doMock("../lib/worker-db.js", () => ({
    getWorkerDbClient: vi.fn(() => ({
      db: harness.db,
    })),
  }));

  return import("../repositories/background-jobs.js");
}

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(async () => response),
  };

  return builder;
}

function createUpdateBuilder(onSet: (values: Record<string, unknown>) => unknown) {
  const builder = {
    set: vi.fn((values: Record<string, unknown>) => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => {
          const response = onSet(values);
          return response ? [response] : [];
        }),
      })),
    })),
  };

  return builder;
}

function createEmailSendTx(initialStatus: string) {
  const emailSend = {
    id: emailSendId,
    workspaceId: testUser.workspaceId,
    approvalId: "00000000-0000-4000-8000-000000002201",
    draftId: "00000000-0000-4000-8000-000000002202",
    leadId: null,
    contactId: null,
    fromEmail: "no-reply@syrantis.local",
    toEmail: "client@example.com",
    replyToEmail: null,
    subject: "Stored snapshot",
    textBody: "Stored body",
    htmlBody: "<p>Stored body</p>",
    provider: "internal",
    providerMessageId: null,
    idempotencyKey: "request_send:test",
    approvalCheckedAt: null,
    suppressionCheckedAt: null,
    attemptCount: 0,
    lastErrorCode: null,
    lastErrorMessage: null,
    status: initialStatus,
    sentAt: null,
    failedAt: null,
    metadataJson: {},
    createdAt: new Date("2026-05-01T12:00:00.000Z"),
    updatedAt: new Date("2026-05-01T12:00:00.000Z"),
  };
  const updates: Record<string, unknown>[] = [];

  const tx = {
    select: vi.fn(() => createSelectBuilder([emailSend])),
    update: vi.fn(() =>
      createUpdateBuilder((values) => {
        updates.push(values);
        Object.assign(emailSend, values);
        return emailSend;
      }),
    ),
  };

  return {
    tx,
    emailSend,
    updates,
  };
}

describe("background job claim repository", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("claimNext returns null when no job is due", async () => {
    const harness = createClaimHarness([]);
    const { claimNextBackgroundJob } = await importBackgroundJobsRepositoryWithClaimHarness(harness);

    await expect(claimNextBackgroundJob({ workerId })).resolves.toBeNull();
  });

  it("claimNext moves a pending job to running with lock metadata and attempts incremented", async () => {
    const harness = createClaimHarness([rawJob()]);
    const { claimNextBackgroundJob } = await importBackgroundJobsRepositoryWithClaimHarness(harness);

    const job = await claimNextBackgroundJob({ workerId });

    expect(job).toMatchObject({
      id: jobId,
      workspaceId: testUser.workspaceId,
      status: "running",
      lockedBy: workerId,
      attempts: 1,
      payloadJson: { emailSendId },
    });
    expect(job?.lockedAt).toBeInstanceOf(Date);
  });

  it("claimNext ignores a fresh running job", async () => {
    const harness = createClaimHarness([
      rawJob({
        status: "running",
        locked_at: new Date("2026-05-01T12:09:00.000Z"),
      }),
    ]);
    const { claimNextBackgroundJob } = await importBackgroundJobsRepositoryWithClaimHarness(harness);

    await expect(claimNextBackgroundJob({ workerId })).resolves.toBeNull();
  });

  it("claimNext can reclaim a stale running job", async () => {
    const harness = createClaimHarness([
      rawJob({
        id: staleJobId,
        status: "running",
        attempts: 2,
        locked_at: new Date("2026-05-01T12:04:00.000Z"),
      }),
    ]);
    const { claimNextBackgroundJob } = await importBackgroundJobsRepositoryWithClaimHarness(harness);

    const job = await claimNextBackgroundJob({ workerId });

    expect(job).toMatchObject({
      id: staleJobId,
      status: "running",
      lockedBy: workerId,
      attempts: 3,
    });
  });
});

describe("send_email job handler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("moves a pending email_send to queued without sent provider fields", async () => {
    const { tx, emailSend, updates } = createEmailSendTx("pending");
    const { handleSendEmailJob } = await import("../services/send-email-job-handler.js");

    await handleSendEmailJob({
      tx: tx as never,
      workspaceId: testUser.workspaceId,
      jobId,
      payload: { emailSendId },
    });

    expect(emailSend.status).toBe("queued");
    expect(emailSend.sentAt).toBeNull();
    expect(emailSend.providerMessageId).toBeNull();
    expect(updates).toEqual([{ status: "queued" }]);
  });

  it("is idempotent when email_send is already queued", async () => {
    const { tx, updates } = createEmailSendTx("queued");
    const { handleSendEmailJob } = await import("../services/send-email-job-handler.js");

    await handleSendEmailJob({
      tx: tx as never,
      workspaceId: testUser.workspaceId,
      jobId,
      payload: { emailSendId },
    });

    expect(updates).toEqual([]);
  });
});

describe("background worker service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function importWorkerWithMocks(input: {
    claimedJob: BackgroundJobRow | null;
    emailSendStatus?: string;
    scoreHandlerError?: string;
  }) {
    const emailTx = input.emailSendStatus
      ? createEmailSendTx(input.emailSendStatus)
      : createEmailSendTx("pending");
    const activityLogs: Array<Record<string, unknown>> = [];
    const completedJob = jobRow({ status: "completed", completedAt: new Date("2026-05-01T12:02:00.000Z") });
    const failedJob = jobRow({ status: "failed", failedAt: new Date("2026-05-01T12:02:00.000Z") });
    const claimNextBackgroundJob = vi.fn(async () => input.claimedJob);
    const completeBackgroundJob = vi.fn(async () => completedJob);
    const failBackgroundJob = vi.fn(async (_tx: unknown, failInput: { errorCode: string; errorMessage: string }) => ({
      ...failedJob,
      lastErrorCode: failInput.errorCode,
      lastErrorMessage: failInput.errorMessage,
    }));
    const handleScoreLeadJob = vi.fn(async () => {
      if (input.scoreHandlerError) {
        throw new Error(input.scoreHandlerError);
      }
    });

    vi.doMock("../repositories/background-jobs.js", () => ({
      claimNextBackgroundJob,
      completeBackgroundJob,
      failBackgroundJob,
    }));
    vi.doMock("../repositories/activity-logs.js", () => ({
      createActivityLog: vi.fn(async (_tx: unknown, input: Record<string, unknown>) => {
        activityLogs.push(input);
        return { id: "00000000-0000-4000-8000-000000002999" };
      }),
    }));
    vi.doMock("../services/score-lead-job-handler.js", () => ({
      handleScoreLeadJob,
    }));
    vi.doMock("../lib/db.js", () => ({
      withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn(emailTx.tx),
      ),
    }));

    const worker = await import("../services/background-worker.js");

    return {
      ...worker,
      emailTx,
      activityLogs,
      claimNextBackgroundJob,
      completeBackgroundJob,
      failBackgroundJob,
      handleScoreLeadJob,
    };
  }

  it("returns idle when no job is claimed", async () => {
    const worker = await importWorkerWithMocks({ claimedJob: null });

    await expect(worker.processNextBackgroundJob({ workerId })).resolves.toEqual({ status: "idle" });
  });

  it("processNext completes valid send_email job and queues email_send", async () => {
    const worker = await importWorkerWithMocks({
      claimedJob: jobRow({ payloadJson: { emailSendId } }),
      emailSendStatus: "pending",
    });

    const result = await worker.processNextBackgroundJob({ workerId });

    expect(result).toMatchObject({ status: "completed", job: { status: "completed" } });
    expect(worker.emailTx.emailSend.status).toBe("queued");
    expect(worker.emailTx.emailSend.sentAt).toBeNull();
    expect(worker.completeBackgroundJob).toHaveBeenCalledWith(
      worker.emailTx.tx,
      expect.objectContaining({ workspaceId: testUser.workspaceId, jobId }),
    );
    expect(worker.activityLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "background_job.claimed" }),
        expect.objectContaining({ action: "background_job.completed" }),
      ]),
    );
  });

  it("processNext fails a job with invalid payload", async () => {
    const worker = await importWorkerWithMocks({
      claimedJob: jobRow({ payloadJson: { nope: emailSendId } }),
    });

    const result = await worker.processNextBackgroundJob({ workerId });

    expect(result).toMatchObject({ status: "failed", errorCode: "INVALID_JOB_PAYLOAD" });
    expect(worker.failBackgroundJob).toHaveBeenCalledWith(
      worker.emailTx.tx,
      expect.objectContaining({
        errorCode: "INVALID_JOB_PAYLOAD",
        errorMessage: expect.any(String),
      }),
    );
  });

  it("processNext fails when email_send is not found", async () => {
    const worker = await importWorkerWithMocks({
      claimedJob: jobRow({ payloadJson: { emailSendId } }),
    });
    worker.emailTx.tx.select = vi.fn(() => createSelectBuilder([]));

    const result = await worker.processNextBackgroundJob({ workerId });

    expect(result).toMatchObject({ status: "failed", errorCode: "EMAIL_SEND_NOT_FOUND" });
    expect(worker.failBackgroundJob).toHaveBeenCalledWith(
      worker.emailTx.tx,
      expect.objectContaining({
        errorCode: "EMAIL_SEND_NOT_FOUND",
      }),
    );
  });

  it("processNext marks score_lead job failed when scoring output is invalid", async () => {
    const worker = await importWorkerWithMocks({
      claimedJob: jobRow({
        type: "score_lead",
        payloadJson: { leadId },
      }),
      scoreHandlerError: "AI_OUTPUT_INVALID_JSON",
    });

    const result = await worker.processNextBackgroundJob({ workerId });

    expect(result).toMatchObject({ status: "failed", errorCode: "AI_OUTPUT_INVALID_JSON" });
    expect(worker.handleScoreLeadJob).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: testUser.workspaceId,
        jobId,
        payload: { leadId },
      }),
    );
    expect(worker.failBackgroundJob).toHaveBeenCalledWith(
      worker.emailTx.tx,
      expect.objectContaining({
        errorCode: "AI_OUTPUT_INVALID_JSON",
      }),
    );
  });

  it("processNext completes idempotently when email_send is already queued", async () => {
    const worker = await importWorkerWithMocks({
      claimedJob: jobRow({ payloadJson: { emailSendId } }),
      emailSendStatus: "queued",
    });

    const result = await worker.processNextBackgroundJob({ workerId });

    expect(result).toMatchObject({ status: "completed" });
    expect(worker.emailTx.updates).toEqual([]);
  });

  it("keeps activity log metadata compact", async () => {
    const worker = await importWorkerWithMocks({
      claimedJob: jobRow({ payloadJson: { emailSendId } }),
      emailSendStatus: "pending",
    });

    await worker.processNextBackgroundJob({ workerId });

    for (const log of worker.activityLogs) {
      const metadata = (log.metadataJson ?? {}) as Record<string, unknown>;
      expect(metadata).not.toHaveProperty("subject");
      expect(metadata).not.toHaveProperty("textBody");
      expect(metadata).not.toHaveProperty("htmlBody");
      expect(metadata).not.toHaveProperty("Authorization");
      expect(metadata).not.toHaveProperty("token");
    }
  });
});

describe("background worker governance checks", () => {
  it("documents SKIP LOCKED validation and background_jobs RLS behavior", () => {
    const repository = readFileSync("src/repositories/background-jobs.ts", "utf8");
    const implementation = readFileSync(
      "../../docs/implementation/019B-worker-execution-foundation.md",
      "utf8",
    );

    expect(repository).toContain("FOR UPDATE SKIP LOCKED");
    expect(implementation).toContain("real concurrency behavior of `FOR UPDATE SKIP LOCKED`");
    expect(implementation).toContain("without `app.current_workspace_id`, `background_jobs` returns zero rows");
  });

  it("does not add Resend, external HTTP calls, DELETE, jobs routes, or tenantGuard to 019B code", () => {
    const files = [
      "src/lib/worker-db.ts",
      "src/repositories/background-jobs.ts",
      "src/services/background-worker.ts",
      "src/services/send-email-job-handler.ts",
      "src/worker.ts",
    ];
    const combined = files.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(combined).not.toMatch(/\bfetch\s*\(/);
    expect(combined).not.toMatch(/\baxios\b/);
    expect(combined).not.toMatch(/\bundici\b/);
    expect(combined).not.toMatch(/\bhttp\.request\b/);
    expect(combined).not.toMatch(/\bhttps\.request\b/);
    expect(combined).not.toMatch(/\bResend\b/);
    expect(combined).not.toMatch(/from ["']resend["']/);
    expect(combined).not.toMatch(/\bdelete\b/i);
    expect(combined).not.toContain("tenantGuard");
  });
});
