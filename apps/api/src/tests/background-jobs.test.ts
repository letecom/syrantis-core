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
  const draft = {
    id: emailSend.draftId,
    workspaceId: testUser.workspaceId,
    status: "approved",
  };
  const updates: Record<string, unknown>[] = [];
  const selectResponses = [[emailSend], [draft]];

  const tx = {
    select: vi.fn(() => createSelectBuilder(selectResponses.shift() ?? [])),
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
    draft,
    updates,
  };
}

function resendResponse(input: { status?: number; body?: Record<string, unknown> } = {}) {
  return new Response(JSON.stringify(input.body ?? { id: "resend-message-1" }), {
    status: input.status ?? 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

async function importSendEmailHandlerWithTx(harness: ReturnType<typeof createEmailSendTx>) {
  const activityLogs: Array<Record<string, unknown>> = [];

  vi.doMock("../lib/db.js", () => ({
    withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn(harness.tx),
    ),
  }));
  vi.doMock("../repositories/activity-logs.js", () => ({
    createActivityLog: vi.fn(async (_tx: unknown, input: Record<string, unknown>) => {
      activityLogs.push(input);
      return { id: "00000000-0000-4000-8000-000000002999" };
    }),
  }));

  const handler = await import("../services/send-email-job-handler.js");

  return {
    ...handler,
    activityLogs,
  };
}

describe("Resend email provider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("resend.provider.success returns messageId", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resendResponse()));
    const { ResendProvider } = await import("../services/email/resend-provider.js");

    await expect(
      new ResendProvider({ apiKey: "test-key", retryDelayMs: { rateLimit: 0, server: 0 } }).send({
        emailSendId,
        to: "client@example.com",
        from: "Syrantis <noreply@send.syrantis.fr>",
        subject: "Subject",
        text: "Body",
      }),
    ).resolves.toEqual({
      provider: "resend",
      messageId: "resend-message-1",
    });
  });

  it("resend.provider.idempotency sets Idempotency-Key", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return resendResponse();
    });
    vi.stubGlobal("fetch", fetchMock);
    const { ResendProvider } = await import("../services/email/resend-provider.js");

    await new ResendProvider({ apiKey: "test-key", retryDelayMs: { rateLimit: 0, server: 0 } }).send({
      emailSendId,
      to: "client@example.com",
      from: "Syrantis <noreply@send.syrantis.fr>",
      subject: "Subject",
      text: "Body",
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(requestInit?.headers).toMatchObject({
      "Idempotency-Key": emailSendId,
    });
  });

  it("resend.provider.user_agent sets User-Agent", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return resendResponse();
    });
    vi.stubGlobal("fetch", fetchMock);
    const { ResendProvider } = await import("../services/email/resend-provider.js");

    await new ResendProvider({ apiKey: "test-key", retryDelayMs: { rateLimit: 0, server: 0 } }).send({
      emailSendId,
      to: "client@example.com",
      from: "Syrantis <noreply@send.syrantis.fr>",
      subject: "Subject",
      text: "Body",
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(requestInit?.headers).toMatchObject({
      "User-Agent": "Syrantis-Core/1.0",
    });
  });

  it("resend.provider.timeout retries once then throws timeout", async () => {
    const timeout = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchMock = vi.fn().mockRejectedValue(timeout);
    vi.stubGlobal("fetch", fetchMock);
    const { EmailProviderTimeoutError, ResendProvider } = await import("../services/email/resend-provider.js");

    await expect(
      new ResendProvider({ apiKey: "test-key", retryDelayMs: { rateLimit: 0, server: 0 } }).send({
        emailSendId,
        to: "client@example.com",
        from: "Syrantis <noreply@send.syrantis.fr>",
        subject: "Subject",
        text: "Body",
      }),
    ).rejects.toThrow(EmailProviderTimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resend.provider.429 retries once then throws", async () => {
    const fetchMock = vi.fn(async () => resendResponse({ status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const { EmailProviderHttpError, ResendProvider } = await import("../services/email/resend-provider.js");

    await expect(
      new ResendProvider({ apiKey: "test-key", retryDelayMs: { rateLimit: 0, server: 0 } }).send({
        emailSendId,
        to: "client@example.com",
        from: "Syrantis <noreply@send.syrantis.fr>",
        subject: "Subject",
        text: "Body",
      }),
    ).rejects.toThrow(EmailProviderHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resend.provider.500 retries once then throws", async () => {
    const fetchMock = vi.fn(async () => resendResponse({ status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { EmailProviderHttpError, ResendProvider } = await import("../services/email/resend-provider.js");

    await expect(
      new ResendProvider({ apiKey: "test-key", retryDelayMs: { rateLimit: 0, server: 0 } }).send({
        emailSendId,
        to: "client@example.com",
        from: "Syrantis <noreply@send.syrantis.fr>",
        subject: "Subject",
        text: "Body",
      }),
    ).rejects.toThrow(EmailProviderHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resend.provider.400 throws immediately without retry", async () => {
    const fetchMock = vi.fn(async () => resendResponse({ status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const { EmailProviderHttpError, ResendProvider } = await import("../services/email/resend-provider.js");

    await expect(
      new ResendProvider({ apiKey: "test-key", retryDelayMs: { rateLimit: 0, server: 0 } }).send({
        emailSendId,
        to: "client@example.com",
        from: "Syrantis <noreply@send.syrantis.fr>",
        subject: "Subject",
        text: "Body",
      }),
    ).rejects.toThrow(EmailProviderHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resend.allowlist.reject throws before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { EmailRecipientNotAllowedError, ResendProvider } = await import("../services/email/resend-provider.js");

    await expect(
      new ResendProvider({
        apiKey: "test-key",
        allowlist: "allowed@example.com",
        retryDelayMs: { rateLimit: 0, server: 0 },
      }).send({
        emailSendId,
        to: "client@example.com",
        from: "Syrantis <noreply@send.syrantis.fr>",
        subject: "Subject",
        text: "Body",
      }),
    ).rejects.toThrow(EmailRecipientNotAllowedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

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
    vi.unstubAllGlobals();
  });

  it("handler.send_email.internal_regression moves pending email_send to queued without fetch", async () => {
    process.env.SEND_EMAIL_PROVIDER = "internal";
    const harness = createEmailSendTx("pending");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { handleSendEmailJob } = await importSendEmailHandlerWithTx(harness);

    await handleSendEmailJob({
      workspaceId: testUser.workspaceId,
      jobId,
      payload: { emailSendId },
    });

    expect(harness.emailSend.status).toBe("queued");
    expect(harness.emailSend.sentAt).toBeNull();
    expect(harness.emailSend.providerMessageId).toBeNull();
    expect(harness.updates).toEqual([{ status: "queued" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handler.send_email.resend_success marks email_send sent and writes compact activity log", async () => {
    const harness = createEmailSendTx("pending");
    const provider = {
      mode: "resend" as const,
      send: vi.fn(async () => ({
        provider: "resend" as const,
        messageId: "resend-message-1",
      })),
    };
    const { activityLogs, handleSendEmailJob } = await importSendEmailHandlerWithTx(harness);

    await handleSendEmailJob({
      workspaceId: testUser.workspaceId,
      jobId,
      payload: { emailSendId },
      provider,
    });

    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        emailSendId,
        to: "client@example.com",
        subject: "Stored snapshot",
      }),
    );
    expect(harness.emailSend.status).toBe("sent");
    expect(harness.emailSend.provider).toBe("resend");
    expect(harness.emailSend.providerMessageId).toBe("resend-message-1");
    expect(harness.emailSend.sentAt).toBeInstanceOf(Date);
    expect(activityLogs).toEqual([
      expect.objectContaining({
        action: "email_send.sent",
        entityType: "email_send",
        entityId: emailSendId,
        metadataJson: {
          emailSendId,
          provider: "resend",
          messageId: "resend-message-1",
        },
      }),
    ]);
    expect(JSON.stringify(activityLogs)).not.toContain("Stored snapshot");
    expect(JSON.stringify(activityLogs)).not.toContain("Stored body");
  });

  it("handler.send_email.already_sent completes without calling provider", async () => {
    const harness = createEmailSendTx("sent");
    const provider = {
      mode: "resend" as const,
      send: vi.fn(),
    };
    const { handleSendEmailJob } = await importSendEmailHandlerWithTx(harness);

    await handleSendEmailJob({
      workspaceId: testUser.workspaceId,
      jobId,
      payload: { emailSendId },
      provider,
    });

    expect(provider.send).not.toHaveBeenCalled();
    expect(harness.updates).toEqual([]);
  });

  it("handler.send_email.draft_unapproved fails before provider call", async () => {
    const harness = createEmailSendTx("pending");
    harness.draft.status = "draft";
    const provider = {
      mode: "resend" as const,
      send: vi.fn(),
    };
    const { handleSendEmailJob } = await importSendEmailHandlerWithTx(harness);

    await expect(
      handleSendEmailJob({
        workspaceId: testUser.workspaceId,
        jobId,
        payload: { emailSendId },
        provider,
      }),
    ).rejects.toThrow("DRAFT_NOT_APPROVED");
    expect(provider.send).not.toHaveBeenCalled();
    expect(harness.emailSend.status).toBe("failed");
  });

  it("handler.send_email.resend_failure marks email_send failed and writes compact activity log", async () => {
    const harness = createEmailSendTx("pending");
    const error = Object.assign(new Error("EMAIL_PROVIDER_HTTP_ERROR"), {
      code: "EMAIL_PROVIDER_HTTP_ERROR",
      statusCode: 500,
    });
    const provider = {
      mode: "resend" as const,
      send: vi.fn(async () => {
        throw error;
      }),
    };
    const { activityLogs, handleSendEmailJob } = await importSendEmailHandlerWithTx(harness);

    await expect(
      handleSendEmailJob({
        workspaceId: testUser.workspaceId,
        jobId,
        payload: { emailSendId },
        provider,
      }),
    ).rejects.toThrow("EMAIL_PROVIDER_HTTP_ERROR");

    expect(harness.emailSend.status).toBe("failed");
    expect(harness.emailSend.provider).toBe("resend");
    expect(harness.emailSend.failedAt).toBeInstanceOf(Date);
    expect(activityLogs).toEqual([
      expect.objectContaining({
        action: "email_send.failed",
        metadataJson: {
          emailSendId,
          provider: "resend",
          errorType: "EMAIL_PROVIDER_HTTP_ERROR",
          statusCode: 500,
        },
      }),
    ]);
    expect(JSON.stringify(activityLogs)).not.toContain("Stored snapshot");
    expect(JSON.stringify(activityLogs)).not.toContain("Stored body");
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
