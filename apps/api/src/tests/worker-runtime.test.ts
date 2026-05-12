import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProcessNextBackgroundJobResult } from "../services/background-worker.js";

const workerId = "test-worker-runtime";

type WorkerSignal = "SIGINT" | "SIGTERM";

class SignalHarness {
  private readonly listeners = new Map<WorkerSignal, () => void>();

  once(signal: WorkerSignal, listener: () => void): void {
    this.listeners.set(signal, listener);
  }

  off(signal: WorkerSignal, listener: () => void): void {
    if (this.listeners.get(signal) === listener) {
      this.listeners.delete(signal);
    }
  }

  emit(signal: WorkerSignal): void {
    this.listeners.get(signal)?.();
  }
}

function successfulPreflight() {
  return {
    ok: true,
    checks: [],
    errors: [],
    sanitizedDatabaseUrl: "postgresql://syrantis_worker:***@127.0.0.1:5432/syrantis",
  };
}

function failedPreflight() {
  return {
    ok: false,
    checks: [{ name: "worker_url_user", ok: false, message: "Worker preflight failed." }],
    errors: ["Worker preflight failed."],
    sanitizedDatabaseUrl: "postgresql://wrong_user:***@127.0.0.1:5432/syrantis",
  };
}

function completedResult(): ProcessNextBackgroundJobResult {
  return {
    status: "completed",
    job: {
      id: "00000000-0000-4000-8000-000000004001",
      workspaceId: "00000000-0000-4000-8000-000000004099",
      type: "score_lead",
      payloadJson: { leadId: "00000000-0000-4000-8000-000000004101" },
      status: "completed",
      attempts: 1,
      maxAttempts: 3,
      runAfter: new Date("2026-05-01T12:00:00.000Z"),
      scheduledAt: null,
      lockedAt: new Date("2026-05-01T12:00:01.000Z"),
      lockedBy: workerId,
      completedAt: new Date("2026-05-01T12:00:02.000Z"),
      failedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date("2026-05-01T12:00:00.000Z"),
      updatedAt: new Date("2026-05-01T12:00:02.000Z"),
    },
  };
}

describe("worker runtime", () => {
  let stdout: { mock: { calls: unknown[][] } };
  let stderr: { mock: { calls: unknown[][] } };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true) as unknown as {
      mock: { calls: unknown[][] };
    };
    stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true) as unknown as {
      mock: { calls: unknown[][] };
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps worker once functional through the shared processor", async () => {
    const { runWorkerMode } = await import("../worker.js");
    const processNextJob = vi.fn(async () => ({ status: "idle" as const }));
    const sleep = vi.fn(async () => undefined);

    await expect(
      runWorkerMode("once", {
        workerId,
        checkEnvironment: vi.fn(async () => successfulPreflight()),
        processNextJob,
        sleep,
      }),
    ).resolves.toBe(0);

    expect(processNextJob).toHaveBeenCalledTimes(1);
    expect(processNextJob).toHaveBeenCalledWith({ workerId });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("defaults to the CLI mode argument", async () => {
    const { runWorkerMode } = await import("../worker.js");
    const originalArgv = process.argv;
    const processNextJob = vi.fn(async () => ({ status: "idle" as const }));

    process.argv = [originalArgv[0] ?? "node", "src/worker.ts", "once"];

    try {
      await expect(
        runWorkerMode(undefined, {
          workerId,
          checkEnvironment: vi.fn(async () => successfulPreflight()),
          processNextJob,
        }),
      ).resolves.toBe(0);
    } finally {
      process.argv = originalArgv;
    }

    expect(processNextJob).toHaveBeenCalledTimes(1);
  });


  it("exits 1 on fatal startup preflight failure without claiming a job", async () => {
    const { runWorkerMode } = await import("../worker.js");
    const processNextJob = vi.fn(async () => ({ status: "idle" as const }));

    await expect(
      runWorkerMode("run", {
        workerId,
        checkEnvironment: vi.fn(async () => failedPreflight()),
        processNextJob,
        sleep: vi.fn(async () => undefined),
        signalTarget: new SignalHarness(),
      }),
    ).resolves.toBe(1);

    expect(processNextJob).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalled();
  });

  it("sleeps 5000ms when the run loop is idle", async () => {
    const { runWorkerMode } = await import("../worker.js");
    const signals = new SignalHarness();
    const sleep = vi.fn(async () => {
      signals.emit("SIGTERM");
    });

    await expect(
      runWorkerMode("run", {
        workerId,
        checkEnvironment: vi.fn(async () => successfulPreflight()),
        processNextJob: vi.fn(async () => ({ status: "idle" as const })),
        sleep,
        signalTarget: signals,
      }),
    ).resolves.toBe(0);

    expect(sleep).toHaveBeenCalledWith(5000);
  });

  it("sleeps only 100ms after a processed job before continuing", async () => {
    const { runWorkerMode } = await import("../worker.js");
    const signals = new SignalHarness();
    const processNextJob = vi
      .fn()
      .mockResolvedValueOnce(completedResult())
      .mockResolvedValueOnce({ status: "idle" as const });
    const sleep = vi.fn(async (ms: number) => {
      if (ms === 5000) {
        signals.emit("SIGTERM");
      }
    });

    await expect(
      runWorkerMode("run", {
        workerId,
        checkEnvironment: vi.fn(async () => successfulPreflight()),
        processNextJob,
        sleep,
        signalTarget: signals,
      }),
    ).resolves.toBe(0);

    expect(processNextJob).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 5000);
  });

  it("handles SIGTERM before claim without processing a job", async () => {
    const { runWorkerMode } = await import("../worker.js");
    const signals = new SignalHarness();
    const processNextJob = vi.fn(async () => ({ status: "idle" as const }));

    await expect(
      runWorkerMode("run", {
        workerId,
        checkEnvironment: vi.fn(async () => successfulPreflight()),
        processNextJob,
        sleep: vi.fn(async () => undefined),
        signalTarget: signals,
        onRunStarted: () => signals.emit("SIGTERM"),
      }),
    ).resolves.toBe(0);

    expect(processNextJob).not.toHaveBeenCalled();
  });

  it("handles SIGTERM during a job by finishing it and exiting without a new claim", async () => {
    const { runWorkerMode } = await import("../worker.js");
    const signals = new SignalHarness();
    const processNextJob = vi.fn(async () => {
      signals.emit("SIGTERM");
      return completedResult();
    });
    const sleep = vi.fn(async () => undefined);

    await expect(
      runWorkerMode("run", {
        workerId,
        checkEnvironment: vi.fn(async () => successfulPreflight()),
        processNextJob,
        sleep,
        signalTarget: signals,
      }),
    ).resolves.toBe(0);

    expect(processNextJob).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("logs safe transient errors, backs off, and continues", async () => {
    const { runWorkerMode } = await import("../worker.js");
    const signals = new SignalHarness();
    const processNextJob = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("DATABASE_URL=postgresql://secret RESEND_API_KEY=secret"), {
          code: "ECONNRESET",
        }),
      )
      .mockResolvedValueOnce({ status: "idle" as const });
    const sleep = vi.fn(async () => {
      if (sleep.mock.calls.length === 2) {
        signals.emit("SIGTERM");
      }
    });

    await expect(
      runWorkerMode("run", {
        workerId,
        checkEnvironment: vi.fn(async () => successfulPreflight()),
        processNextJob,
        sleep,
        signalTarget: signals,
      }),
    ).resolves.toBe(0);

    expect(processNextJob).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 5000);
    expect(sleep).toHaveBeenNthCalledWith(2, 5000);
    const stderrOutput = stderr.mock.calls.join("\n");
    expect(stderrOutput).toContain("ECONNRESET");
    expect(stderrOutput).not.toContain("DATABASE_URL");
    expect(stderrOutput).not.toContain("RESEND_API_KEY");
    expect(stderrOutput).not.toContain("secret");
  });

  it("rejects unsupported CLI modes", async () => {
    const { runWorkerMode } = await import("../worker.js");

    await expect(
      runWorkerMode("forever", {
        workerId,
        checkEnvironment: vi.fn(async () => successfulPreflight()),
        processNextJob: vi.fn(async () => ({ status: "idle" as const })),
      }),
    ).rejects.toThrow("Worker mode must be once or run.");

    expect(stdout).toHaveBeenCalled();
  });
});
