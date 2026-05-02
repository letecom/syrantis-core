import { closeWorkerDbClient } from "./lib/worker-db.js";
import {
  checkWorkerEnvironment,
  inspectWorkerJobs,
  repairStaleJobs,
  type WorkerEnvironmentCheckResult,
  type WorkerJobSummary,
  type WorkerRepairStaleResult,
} from "./services/worker-ops.js";

const jobStatuses = new Set(["pending", "running", "completed", "failed", "cancelled"]);

function writeLine(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function parseOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseLimit(args: string[]): number {
  const value = Number(parseOption(args, "--limit") ?? 20);
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 1), 100) : 20;
}

function parseThresholdMinutes(args: string[]): number {
  const value = Number(parseOption(args, "--threshold-minutes") ?? 5);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 5;
}

function parseStatus(args: string[]): "pending" | "running" | "completed" | "failed" | "cancelled" {
  const status = parseOption(args, "--status") ?? "pending";

  if (!jobStatuses.has(status)) {
    throw new Error("Invalid status. Use pending, running, completed, failed, or cancelled.");
  }

  return status as "pending" | "running" | "completed" | "failed" | "cancelled";
}

function formatCell(value: string | number | null | undefined): string {
  return String(value ?? "-");
}

export function formatWorkerCheck(result: WorkerEnvironmentCheckResult): string {
  const lines = result.checks.map((check) => {
    const prefix = check.ok ? "[OK]" : "[FAIL]";
    return `${prefix} ${check.name} - ${check.message}`;
  });

  if (result.sanitizedDatabaseUrl) {
    lines.unshift(`[OK] worker_database_url - ${result.sanitizedDatabaseUrl}`);
  }

  return lines.join("\n");
}

export function formatWorkerJobsTable(jobs: WorkerJobSummary[]): string {
  const headers = ["ID", "TYPE", "STATUS", "ATTEMPTS", "RUN_AFTER", "LOCKED_AT", "LOCKED_BY", "CREATED_AT"];
  const rows = jobs.map((job) => [
    job.id,
    job.type,
    job.status,
    `${job.attempts}/${job.maxAttempts}`,
    job.runAfter,
    job.lockedAt,
    job.lockedBy,
    job.createdAt,
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => formatCell(row[index]).length)),
  );
  const formatRow = (row: Array<string | number | null>) =>
    row.map((cell, index) => formatCell(cell).padEnd(widths[index] ?? 0)).join("  ");

  return [formatRow(headers), ...rows.map(formatRow)].join("\n");
}

export function formatRepairStaleResult(result: WorkerRepairStaleResult): string {
  if (result.matchedCount === 0) {
    return "[OK] No stale jobs found.";
  }

  const prefix = result.dryRun
    ? `[DRY-RUN] Found ${result.matchedCount} stale jobs. No jobs were modified.`
    : `[APPLY] Reset ${result.updatedCount} stale jobs to pending.`;
  const lines = result.jobs.map(
    (job) =>
      `${job.id} ${job.type} ${job.status} attempts=${job.attempts} locked_at=${job.lockedAt ?? "-"} locked_by=${job.lockedBy ?? "-"}`,
  );

  return [prefix, ...lines].join("\n");
}

async function runCheck(): Promise<number> {
  const result = await checkWorkerEnvironment();
  writeLine(formatWorkerCheck(result));
  return result.ok ? 0 : 1;
}

async function runJobs(args: string[]): Promise<number> {
  const jobs = await inspectWorkerJobs({
    status: parseStatus(args),
    limit: parseLimit(args),
  });
  writeLine(formatWorkerJobsTable(jobs));
  return 0;
}

async function runRepairStale(args: string[]): Promise<number> {
  const result = await repairStaleJobs({
    apply: args.includes("--apply"),
    thresholdMinutes: parseThresholdMinutes(args),
  });
  writeLine(formatRepairStaleResult(result));
  return 0;
}

export async function runWorkerOpsCli(args = process.argv.slice(2)): Promise<number> {
  const command = args[0] ?? "check";
  const commandArgs = args.slice(1);

  try {
    if (command === "check") {
      return await runCheck();
    }

    if (command === "jobs") {
      return await runJobs(commandArgs);
    }

    if (command === "repair-stale") {
      return await runRepairStale(commandArgs);
    }

    throw new Error("Unknown worker ops command.");
  } finally {
    await closeWorkerDbClient();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWorkerOpsCli().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    async (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : "Worker ops command failed."}\n`);
      await closeWorkerDbClient();
      process.exitCode = 1;
    },
  );
}
