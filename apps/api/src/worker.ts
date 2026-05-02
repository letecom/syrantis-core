import { closeGlobalDbClient } from "@syrantis/db";

import { closeWorkerDbClient } from "./lib/worker-db.js";
import { processNextBackgroundJob } from "./services/background-worker.js";
import { checkWorkerEnvironment } from "./services/worker-ops.js";

const defaultWorkerId = `worker:${process.pid}`;
const defaultPollIntervalMs = 1000;

function resolveWorkerId(): string {
  return process.env.WORKER_ID?.trim() || defaultWorkerId;
}

function resolvePollIntervalMs(): number {
  const rawValue = process.env.WORKER_POLL_INTERVAL_MS?.trim();

  if (!rawValue) {
    return defaultPollIntervalMs;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 100 ? parsed : defaultPollIntervalMs;
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

async function runPreflight(workerId: string): Promise<boolean> {
  const result = await checkWorkerEnvironment();

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

async function processOne(workerId: string): Promise<void> {
  const result = await processNextBackgroundJob({
    workerId,
  });

  if (result.status === "idle") {
    logWorkerEvent({
      level: "info",
      workerId,
      event: "worker.idle",
      message: "No background job available.",
    });
    return;
  }

  logWorkerEvent({
    level: result.status === "failed" ? "error" : "info",
    workerId,
    event: `worker.job_${result.status}`,
    message: `Background job ${result.status}.`,
  });
}

async function runLoop(workerId: string): Promise<void> {
  let shouldStop = false;
  const pollIntervalMs = resolvePollIntervalMs();

  const stop = () => {
    shouldStop = true;
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  while (!shouldStop) {
    await processOne(workerId);
    await sleep(pollIntervalMs);
  }
}

export async function runWorkerMode(mode = process.argv[2] ?? "once"): Promise<number> {
  const workerId = resolveWorkerId();
  const preflightOk = await runPreflight(workerId);

  if (!preflightOk) {
    return 1;
  }

  if (mode === "run") {
    await runLoop(workerId);
    return 0;
  }

  if (mode !== "once") {
    throw new Error("Worker mode must be once or run.");
  }

  await processOne(workerId);
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
      message: error instanceof Error ? error.message : "Background worker failed.",
    });
    await closeClients();
    process.exit(1);
  });
}
