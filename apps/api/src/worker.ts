import { closeGlobalDbClient } from "@syrantis/db";

import { closeWorkerDbClient } from "./lib/worker-db.js";
import {
  processNextBackgroundJob,
  type ProcessNextBackgroundJobInput,
  type ProcessNextBackgroundJobResult,
} from "./services/background-worker.js";
import {
  checkWorkerEnvironment,
  type WorkerEnvironmentCheckResult,
} from "./services/worker-ops.js";

const defaultWorkerId = `worker:${process.pid}`;
const idleSleepMs = 5000;
const processedSleepMs = 100;
const transientErrorSleepMs = 5000;

type WorkerSignal = "SIGINT" | "SIGTERM";

type WorkerSignalTarget = {
  once(signal: WorkerSignal, listener: () => void): unknown;
  off(signal: WorkerSignal, listener: () => void): unknown;
};

type SleepFn = (ms: number) => Promise<void>;

type ProcessNextJobFn = (
  input: ProcessNextBackgroundJobInput,
) => Promise<ProcessNextBackgroundJobResult>;

type RunLoopOptions = {
  sleep: SleepFn;
  signalTarget: WorkerSignalTarget;
  processNextJob: ProcessNextJobFn;
  onRunStarted?: (() => void) | undefined;
};

export type RunWorkerModeOptions = {
  workerId?: string;
  sleep?: SleepFn;
  signalTarget?: WorkerSignalTarget;
  onRunStarted?: () => void;
  checkEnvironment?: () => Promise<WorkerEnvironmentCheckResult>;
  processNextJob?: ProcessNextJobFn;
};

function resolveWorkerId(): string {
  return process.env.WORKER_ID?.trim() || defaultWorkerId;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function closeClients(): Promise<void> {
  await Promise.all([closeWorkerDbClient(), closeGlobalDbClient()]);
}

function logWorkerEvent(input: {
  level: "info" | "error";
  workerId: string;
  event: string;
  message: string;
}): void {
  const line = {
    timestamp: new Date().toISOString(),
    level: input.level,
    workerId: input.workerId,
    event: input.event,
    message: input.message,
  };
  const output = `${JSON.stringify(line)}\n`;

  if (input.level === "error") {
    process.stderr.write(output);
    return;
  }

  process.stdout.write(output);
}

async function runPreflight(
  workerId: string,
  checkEnvironment: () => Promise<WorkerEnvironmentCheckResult>,
): Promise<boolean> {
  const result = await checkEnvironment();

  if (result.ok) {
    logWorkerEvent({
      level: "info",
      workerId,
      event: "worker.preflight_ok",
      message: "Worker preflight passed.",
    });
    return true;
  }

  logWorkerEvent({
    level: "error",
    workerId,
    event: "worker.preflight_failed",
    message: "Worker preflight failed.",
  });
  return false;
}

function safeTransientErrorCode(error: unknown): string {
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_:-]+$/.test(error.code.trim())
  ) {
    return error.code.trim().slice(0, 120) || "BACKGROUND_WORKER_TRANSIENT_ERROR";
  }

  return "BACKGROUND_WORKER_TRANSIENT_ERROR";
}

async function processOne(
  workerId: string,
  processNextJob: ProcessNextJobFn,
): Promise<ProcessNextBackgroundJobResult> {
  const result = await processNextJob({
    workerId,
  });

  if (result.status === "idle") {
    return result;
  }

  logWorkerEvent({
    level: result.status === "failed" ? "error" : "info",
    workerId,
    event: `worker.job_${result.status}`,
    message: `Background job ${result.status}.`,
  });

  return result;
}

async function runLoop(
  workerId: string,
  options: RunLoopOptions,
): Promise<void> {
  let shouldStop = false;

  const stop = () => {
    shouldStop = true;
  };

  options.signalTarget.once("SIGINT", stop);
  options.signalTarget.once("SIGTERM", stop);

  try {
    options.onRunStarted?.();

    while (!shouldStop) {
      try {
        const result = await processOne(workerId, options.processNextJob);

        if (shouldStop) {
          break;
        }

        await options.sleep(result.status === "idle" ? idleSleepMs : processedSleepMs);
      } catch (error) {
        logWorkerEvent({
          level: "error",
          workerId,
          event: "worker.transient_error",
          message: safeTransientErrorCode(error),
        });

        if (shouldStop) {
          break;
        }

        await options.sleep(transientErrorSleepMs);
      }
    }
  } finally {
    options.signalTarget.off("SIGINT", stop);
    options.signalTarget.off("SIGTERM", stop);
  }
}

export async function runWorkerMode(
  mode = process.argv[2] ?? "once",
  options: RunWorkerModeOptions = {},
): Promise<number> {
  const workerId = options.workerId ?? resolveWorkerId();
  const preflightOk = await runPreflight(
    workerId,
    options.checkEnvironment ?? checkWorkerEnvironment,
  );

  if (!preflightOk) {
    return 1;
  }

  if (mode === "run") {
    await runLoop(workerId, {
      sleep: options.sleep ?? sleep,
      signalTarget: options.signalTarget ?? process,
      processNextJob: options.processNextJob ?? processNextBackgroundJob,
      onRunStarted: options.onRunStarted,
    });
    return 0;
  }

  if (mode !== "once") {
    throw new Error("Worker mode must be once or run.");
  }

  await processOne(workerId, options.processNextJob ?? processNextBackgroundJob);
  return 0;
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runWorkerMode();
  } finally {
    await closeClients();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (error: unknown) => {
    logWorkerEvent({
      level: "error",
      workerId: resolveWorkerId(),
      event: "worker.failed",
      message: safeTransientErrorCode(error),
    });
    await closeClients();
    process.exit(1);
  });
}
