import { closeGlobalDbClient } from "@syrantis/db";

import { closeWorkerDbClient } from "./lib/worker-db.js";
import { processNextBackgroundJob } from "./services/background-worker.js";

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

async function runOnce(): Promise<void> {
  const result = await processNextBackgroundJob({
    workerId: resolveWorkerId(),
  });

  if (result.status === "idle") {
    console.log("BACKGROUND_WORKER_IDLE");
    return;
  }

  console.log(`BACKGROUND_WORKER_${result.status.toUpperCase()}`);
}

async function runLoop(): Promise<void> {
  let shouldStop = false;
  const pollIntervalMs = resolvePollIntervalMs();

  const stop = () => {
    shouldStop = true;
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  while (!shouldStop) {
    await runOnce();
    await sleep(pollIntervalMs);
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "once";

  try {
    if (mode === "run") {
      await runLoop();
      return;
    }

    if (mode !== "once") {
      throw new Error("Worker mode must be once or run.");
    }

    await runOnce();
  } finally {
    await closeClients();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : "BACKGROUND_WORKER_FAILED");
    await closeClients();
    process.exit(1);
  });
}
