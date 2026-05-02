import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { WorkerJobSummary } from "../services/worker-ops.js";
import type * as WorkerDbModule from "../lib/worker-db.js";

const validWorkerUrl = "postgresql://syrantis_worker:worker-secret@127.0.0.1:5432/syrantis";

type CheckRow = {
  current_user: string;
  role_exists: boolean;
  rolcanlogin: boolean | null;
  rolbypassrls: boolean | null;
  rolsuper: boolean | null;
  background_jobs_select: boolean;
  background_jobs_update: boolean;
  background_jobs_insert: boolean;
  background_jobs_delete: boolean;
  email_sends_select: boolean;
  activity_logs_insert: boolean;
  users_select: boolean;
};

function healthyCheckRow(overrides: Partial<CheckRow> = {}): CheckRow {
  return {
    current_user: "syrantis_worker",
    role_exists: true,
    rolcanlogin: true,
    rolbypassrls: true,
    rolsuper: false,
    background_jobs_select: true,
    background_jobs_update: true,
    background_jobs_insert: false,
    background_jobs_delete: false,
    email_sends_select: false,
    activity_logs_insert: false,
    users_select: false,
    ...overrides,
  };
}

function jobSummary(overrides: Partial<WorkerJobSummary> = {}): WorkerJobSummary {
  return {
    id: "00000000-0000-4000-8000-000000003001",
    type: "send_email",
    status: "pending",
    attempts: 1,
    maxAttempts: 3,
    runAfter: "2026-05-01T12:00:00.000Z",
    lockedAt: null,
    lockedBy: null,
    createdAt: "2026-05-01T11:00:00.000Z",
    updatedAt: "2026-05-01T11:00:00.000Z",
    ...overrides,
  };
}

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000003001",
    workspaceId: "00000000-0000-4000-8000-000000003099",
    type: "send_email",
    status: "running",
    attempts: 2,
    maxAttempts: 3,
    runAfter: new Date("2026-05-01T12:00:00.000Z"),
    lockedAt: new Date("2026-05-01T12:01:00.000Z"),
    lockedBy: "worker-a",
    completedAt: null,
    failedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: new Date("2026-05-01T11:00:00.000Z"),
    updatedAt: new Date("2026-05-01T11:00:00.000Z"),
    ...overrides,
  };
}

function createSelectChain(rows: unknown[], capture: { whereCalls: unknown[]; limits: number[] }) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn((value: unknown) => {
      capture.whereCalls.push(value);
      return chain;
    }),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(async (value: number) => {
      capture.limits.push(value);
      return rows;
    }),
  };

  return chain;
}

function createUpdateChain(rows: unknown[], capture: { updateValues: unknown[] }) {
  const chain = {
    set: vi.fn((values: unknown) => {
      capture.updateValues.push(values);
      return {
        where: vi.fn(() => ({
          returning: vi.fn(async () => rows),
        })),
      };
    }),
  };

  return chain;
}

async function importWorkerOpsWithDb(input: {
  url?: string;
  checkRow?: CheckRow;
  selectRows?: unknown[];
  updateRows?: unknown[];
}) {
  vi.resetModules();
  vi.stubEnv("WORKER_DATABASE_URL", input.url ?? validWorkerUrl);
  const capture = {
    whereCalls: [] as unknown[],
    limits: [] as number[],
    updateValues: [] as unknown[],
  };
  const db = {
    execute: vi.fn(async () => ({ rows: [input.checkRow ?? healthyCheckRow()] })),
    select: vi.fn(() => createSelectChain(input.selectRows ?? [], capture)),
    update: vi.fn(() => createUpdateChain(input.updateRows ?? [], capture)),
  };

  vi.doMock("../lib/worker-db.js", async () => {
    const actual = await vi.importActual<typeof WorkerDbModule>("../lib/worker-db.js");
    return {
      ...actual,
      getWorkerDbClient: vi.fn(() => ({ db })),
    };
  });

  const service = await import("../services/worker-ops.js");

  return {
    ...service,
    db,
    capture,
  };
}

describe("worker environment checks", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("check fails when WORKER_DATABASE_URL is missing", async () => {
    vi.resetModules();
    vi.stubEnv("WORKER_DATABASE_URL", "");
    const { checkWorkerEnvironment } = await import("../services/worker-ops.js");

    const result = await checkWorkerEnvironment();

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("WORKER_DATABASE_URL is required");
  });

  it("check rejects non-syrantis_worker user", async () => {
    const service = await importWorkerOpsWithDb({
      url: "postgresql://wrong_user:worker-secret@127.0.0.1:5432/syrantis",
      checkRow: healthyCheckRow({ current_user: "wrong_user" }),
    });

    const result = await service.checkWorkerEnvironment();

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "worker_url_user", ok: false }),
        expect.objectContaining({ name: "worker_current_user", ok: false }),
      ]),
    );
    expect(result.sanitizedDatabaseUrl).toBe("postgresql://wrong_user:***@127.0.0.1:5432/syrantis");
  });

  it("check rejects role without BYPASSRLS", async () => {
    const service = await importWorkerOpsWithDb({
      checkRow: healthyCheckRow({ rolbypassrls: false }),
    });

    const result = await service.checkWorkerEnvironment();

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "worker_role_bypassrls", ok: false })]),
    );
  });

  it("check rejects extra direct privileges on email_sends", async () => {
    const service = await importWorkerOpsWithDb({
      checkRow: healthyCheckRow({ email_sends_select: true }),
    });

    const result = await service.checkWorkerEnvironment();

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "email_sends_no_select", ok: false })]),
    );
  });

  it("check rejects extra direct privileges on activity_logs", async () => {
    const service = await importWorkerOpsWithDb({
      checkRow: healthyCheckRow({ activity_logs_insert: true }),
    });

    const result = await service.checkWorkerEnvironment();

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "activity_logs_no_insert", ok: false })]),
    );
  });

  it("check rejects SELECT on users", async () => {
    const service = await importWorkerOpsWithDb({
      checkRow: healthyCheckRow({ users_select: true }),
    });

    const result = await service.checkWorkerEnvironment();

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "users_no_select", ok: false })]),
    );
  });
});

describe("worker jobs inspection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("jobs output does not include payload_json", async () => {
    const { formatWorkerJobsTable } = await import("../worker-ops.js");

    const output = formatWorkerJobsTable([jobSummary()]);

    expect(output).not.toContain("payload_json");
    expect(output).not.toContain("payload");
  });

  it("jobs output does not include emailSendId", async () => {
    const { formatWorkerJobsTable } = await import("../worker-ops.js");

    const output = formatWorkerJobsTable([jobSummary()]);

    expect(output).not.toContain("emailSendId");
    expect(output).not.toContain("00000000-0000-4000-8000-000000003777");
  });

  it("jobs filters by status and limit", async () => {
    const service = await importWorkerOpsWithDb({
      selectRows: [dbRow({ status: "running" })],
    });

    const jobs = await service.inspectWorkerJobs({ status: "running", limit: 500 });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: "running" });
    expect(service.capture.whereCalls).toHaveLength(1);
    expect(service.capture.limits).toEqual([100]);
  });
});

describe("worker stale repair", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("repair-stale dry-run does not mutate jobs", async () => {
    const service = await importWorkerOpsWithDb({
      selectRows: [dbRow({ status: "running" })],
    });

    const result = await service.repairStaleJobs({ thresholdMinutes: 5 });

    expect(result).toMatchObject({ dryRun: true, matchedCount: 1, updatedCount: 0 });
    expect(service.db.update).not.toHaveBeenCalled();
  });

  it("repair-stale apply resets only stale running jobs to pending", async () => {
    const service = await importWorkerOpsWithDb({
      updateRows: [
        dbRow({
          status: "pending",
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: "STALE_LOCK_RESET",
        }),
      ],
    });

    const result = await service.repairStaleJobs({ apply: true, thresholdMinutes: 10 });

    expect(result).toMatchObject({ dryRun: false, matchedCount: 1, updatedCount: 1 });
    expect(result.jobs[0]).toMatchObject({ status: "pending", lockedAt: null, lockedBy: null });
    expect(service.capture.updateValues[0]).toMatchObject({
      status: "pending",
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: "STALE_LOCK_RESET",
      lastErrorMessage: "Reset by worker repair-stale.",
    });
  });

  it("repair-stale does not touch completed jobs", async () => {
    const service = await importWorkerOpsWithDb({
      updateRows: [],
    });

    const result = await service.repairStaleJobs({ apply: true });

    expect(result.jobs.some((job) => job.status === "completed")).toBe(false);
    expect(result.updatedCount).toBe(0);
  });

  it("repair-stale does not touch cancelled jobs", async () => {
    const service = await importWorkerOpsWithDb({
      updateRows: [],
    });

    const result = await service.repairStaleJobs({ apply: true });

    expect(result.jobs.some((job) => job.status === "cancelled")).toBe(false);
    expect(result.updatedCount).toBe(0);
  });
});

describe("worker preflight", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("worker once preflight failure prevents claim", async () => {
    const processNextBackgroundJob = vi.fn(async () => ({ status: "idle" as const }));
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    vi.doMock("../services/worker-ops.js", () => ({
      checkWorkerEnvironment: vi.fn(async () => ({
        ok: false,
        checks: [{ name: "worker_url_user", ok: false, message: "Worker database user must be syrantis_worker." }],
        errors: ["Worker database user must be syrantis_worker."],
        sanitizedDatabaseUrl: "postgresql://wrong_user:***@127.0.0.1:5432/syrantis",
      })),
    }));
    vi.doMock("../services/background-worker.js", () => ({
      processNextBackgroundJob,
    }));

    const { runWorkerMode } = await import("../worker.js");

    await expect(runWorkerMode("once")).resolves.toBe(1);
    expect(processNextBackgroundJob).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalled();
  });
});
