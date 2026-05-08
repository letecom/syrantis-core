import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ApiRequestError,
  ApiUnauthorizedError,
  getOpsHealth,
  getRecentOpsChecks,
  runOpsCheck,
  type OpsCheckId,
  type OpsHealthResponse,
  type OpsRunCheckResponse,
} from "../lib/api-client";

const checks = [
  ["api-health", "API health"],
  ["db-health", "DB health"],
  ["google-sheets-status", "Google Sheets status"],
  ["google-sheets-test", "Google Sheets test"],
  ["worker-queue-summary", "Worker queue summary"],
  ["worker-failed-summary", "Worker Failed Summary"],
] as const satisfies Array<readonly [OpsCheckId, string]>;

function formatValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "None";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "None";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Unavailable";
  }

  return parsed.toLocaleString();
}

function runErrorMessage(error: unknown) {
  if (error instanceof ApiUnauthorizedError) {
    return "Check failed (401).";
  }

  if (error instanceof ApiRequestError && error.status) {
    return `Check failed (${error.status}).`;
  }

  return "Check failed.";
}

function StatusTile({
  title,
  status,
  rows,
}: {
  title: string;
  status: string;
  rows: Array<[string, string | number | boolean | null | undefined]>;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <span className="rounded-full border border-line bg-field px-2 py-1 text-xs font-semibold uppercase text-slate-600">
          {status}
        </span>
      </div>
      <dl className="mt-4 space-y-2">
        {rows.map(([label, value]) => (
          <div className="flex justify-between gap-3 text-sm" key={label}>
            <dt className="text-slate-500">{label}</dt>
            <dd className="break-words text-right font-medium text-slate-800">
              {formatValue(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function HealthCards({ health }: { health: OpsHealthResponse }) {
  return (
    <div className="grid gap-4 xl:grid-cols-4" aria-label="Health cards">
      <StatusTile
        title="API"
        status={health.api.status}
        rows={[
          ["Uptime seconds", health.api.uptimeSeconds],
          ["Checked at", formatTime(health.checkedAt)],
        ]}
      />
      <StatusTile
        title="Database"
        status={health.db.status}
        rows={[["Latency ms", health.db.latencyMs]]}
      />
      <StatusTile
        title="Google Sheets"
        status={health.googleSheets.status}
        rows={[
          ["Configured", health.googleSheets.configured],
          ["Last test", health.googleSheets.lastTestResult],
          ["Last tested at", formatTime(health.googleSheets.lastTestedAt)],
        ]}
      />
      <StatusTile
        title="Worker Queue"
        status={health.workerQueue.status}
        rows={[
          ["Pending", health.workerQueue.pending],
          ["Running", health.workerQueue.running],
          ["Failed", health.workerQueue.failed],
          ["Oldest pending minutes", health.workerQueue.oldestPendingMinutes],
        ]}
      />
    </div>
  );
}

function readNumber(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" ? value : null;
}

function readBoolean(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "boolean" ? value : null;
}

function readRecord(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readWorkerFailedGroups(data: Record<string, unknown>) {
  const value = data.groups;

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "object" && item !== null ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function safeDataRows(result: OpsRunCheckResponse) {
  const data = result.data;

  if (result.checkId === "api-health") {
    return [["Uptime seconds", readNumber(data, "uptimeSeconds")]] as const;
  }

  if (result.checkId === "db-health") {
    return [["Latency ms", readNumber(data, "latencyMs")]] as const;
  }

  if (result.checkId === "google-sheets-status") {
    const lastTest =
      typeof data.lastTest === "object" && data.lastTest !== null
        ? (data.lastTest as Record<string, unknown>)
        : null;

    return [
      ["Enabled", readBoolean(data, "enabled")],
      ["Configured", readBoolean(data, "configured")],
      ["Credentials configured", readBoolean(data, "credentialsConfigured")],
      ["Spreadsheet configured", readBoolean(data, "spreadsheetConfigured")],
      ["Masked spreadsheet ID", readString(data, "spreadsheetIdMasked")],
      ["Pushback range configured", readBoolean(data, "pushbackRangeConfigured")],
      ["Verification range configured", readBoolean(data, "verificationRangeConfigured")],
      ["Last test", lastTest ? readString(lastTest, "result") : null],
      ["Last diagnostic trace ID", lastTest ? readString(lastTest, "diagnosticTraceId") : null],
      ["Last tested at", lastTest ? formatTime(readString(lastTest, "testedAt")) : null],
    ] as const;
  }

  if (result.checkId === "google-sheets-test") {
    return [
      ["Tested at", formatTime(readString(data, "testedAt"))],
      ["Rows appended", readNumber(data, "rowsAppended")],
    ] as const;
  }

  if (result.checkId === "worker-failed-summary") {
    const interpretation = readRecord(data, "interpretation");

    return [
      ["Total failed", readNumber(data, "totalFailed")],
      ["Status", readString(data, "status")],
      [
        "Recommended next action",
        interpretation ? readString(interpretation, "recommendedNextAction") : null,
      ],
      ["Has fresh failures", interpretation ? readBoolean(interpretation, "hasFreshFailures") : null],
      [
        "Only historical failures",
        interpretation ? readBoolean(interpretation, "hasOnlyHistoricalFailures") : null,
      ],
    ] as const;
  }

  return [
    ["Pending", readNumber(data, "pending")],
    ["Running", readNumber(data, "running")],
    ["Failed", readNumber(data, "failed")],
    ["Oldest pending minutes", readNumber(data, "oldestPendingMinutes")],
  ] as const;
}

function WorkerFailedGroups({ result }: { result: OpsRunCheckResponse }) {
  if (result.checkId !== "worker-failed-summary") {
    return null;
  }

  const groups = readWorkerFailedGroups(result.data);

  if (groups.length === 0) {
    return <p className="mt-3 text-sm text-slate-600">No failed worker job groups.</p>;
  }

  return (
    <div className="mt-4 grid gap-3">
      {groups.map((group, index) => {
        const type = readString(group, "type") ?? `group-${index + 1}`;

        return (
          <div className="rounded-md border border-line bg-white p-3" key={`${type}-${index}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-800">{type}</h4>
              <span className="rounded-full border border-line bg-field px-2 py-1 text-xs font-semibold uppercase text-slate-600">
                {formatValue(readString(group, "ageBucket"))}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 text-sm md:grid-cols-3">
              {[
                ["Count", readNumber(group, "count")],
                ["Attempts", `${formatValue(readNumber(group, "minAttempts"))}-${formatValue(readNumber(group, "maxAttempts"))}`],
                ["Oldest", formatTime(readString(group, "oldestCreatedAt"))],
                ["Latest", formatTime(readString(group, "latestUpdatedAt"))],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="mt-1 break-words font-medium text-slate-800">
                    {formatValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}

function LastResult({ result }: { result: OpsRunCheckResponse }) {
  return (
    <section
      className="rounded-lg border border-line bg-white p-5 shadow-sm"
      aria-label="Last result"
    >
      <h2 className="text-lg font-semibold text-ink">Last result</h2>
      <dl className="mt-4 grid gap-3 md:grid-cols-2">
        {[
          ["Result", result.result],
          ["Check", result.checkId],
          ["Diagnostic trace ID", result.diagnosticTraceId],
          ["Duration ms", result.durationMs],
          ["Error code", result.errorCode],
          ["Error summary", result.errorSummary],
        ].map(([label, value]) => (
          <div className="rounded-md border border-line bg-field p-3" key={label}>
            <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
            <dd className="mt-1 break-words text-sm font-medium text-slate-800">
              {formatValue(value)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 rounded-md border border-line bg-field p-3">
        <h3 className="text-xs font-semibold uppercase text-slate-500">Safe data</h3>
        <dl className="mt-3 grid gap-2 md:grid-cols-2">
          {safeDataRows(result).map(([label, value]) => (
            <div className="text-sm" key={label}>
              <dt className="text-slate-500">{label}</dt>
              <dd className="mt-1 break-words font-medium text-slate-800">
                {formatValue(value)}
              </dd>
            </div>
          ))}
        </dl>
        <WorkerFailedGroups result={result} />
      </div>
    </section>
  );
}

function RecentChecks() {
  const recentQuery = useQuery({
    queryKey: ["ops-recent-checks"],
    queryFn: () => getRecentOpsChecks({ limit: 20 }),
  });

  return (
    <section
      className="rounded-lg border border-line bg-white p-5 shadow-sm"
      aria-label="Recent checks"
    >
      <h2 className="text-lg font-semibold text-ink">Recent checks</h2>
      {recentQuery.isLoading ? (
        <p className="mt-4 text-sm text-slate-600">Loading recent checks...</p>
      ) : null}
      {recentQuery.isError ? (
        <p className="mt-4 text-sm text-red-700">Recent checks unavailable.</p>
      ) : null}
      {recentQuery.data ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-semibold">Time</th>
                <th className="py-2 pr-4 font-semibold">Check</th>
                <th className="py-2 pr-4 font-semibold">Result</th>
                <th className="py-2 pr-4 font-semibold">Duration</th>
                <th className="py-2 font-semibold">Diagnostic trace ID</th>
              </tr>
            </thead>
            <tbody>
              {recentQuery.data.checks.map((check) => (
                <tr className="border-b border-line last:border-0" key={check.diagnosticTraceId}>
                  <td className="py-3 pr-4 text-slate-700">{formatTime(check.runAt)}</td>
                  <td className="py-3 pr-4 font-medium text-slate-800">{check.checkId}</td>
                  <td className="py-3 pr-4 text-slate-700">{check.result}</td>
                  <td className="py-3 pr-4 text-slate-700">{check.durationMs} ms</td>
                  <td className="py-3 font-mono text-xs text-slate-700">
                    {check.diagnosticTraceId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentQuery.data.checks.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">No checks recorded yet.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function OpsPage() {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<OpsRunCheckResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const runningRef = useRef<OpsCheckId | null>(null);

  const healthQuery = useQuery({
    queryKey: ["ops-health"],
    queryFn: getOpsHealth,
  });

  const runMutation = useMutation({
    mutationFn: runOpsCheck,
    onSuccess: async (result) => {
      setLastResult(result);
      setRunError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ops-health"] }),
        queryClient.invalidateQueries({ queryKey: ["ops-recent-checks"] }),
      ]);
    },
    onError: (error) => {
      setRunError(runErrorMessage(error));
    },
    onSettled: () => {
      runningRef.current = null;
    },
  });

  function handleRun(checkId: OpsCheckId) {
    if (runningRef.current || runMutation.isPending) {
      return;
    }

    runningRef.current = checkId;
    runMutation.mutate(checkId);
  }

  const runningCheck = runningRef.current;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Ops Health</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          This page runs bounded diagnostic checks only. It cannot restart services, edit env, run
          migrations, or read logs.
        </p>
      </div>

      <div className="grid gap-5">
        {healthQuery.isLoading ? (
          <p className="rounded-lg border border-line bg-white p-5 text-sm text-slate-600 shadow-sm">
            Loading ops health...
          </p>
        ) : null}

        {healthQuery.isError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            Ops health unavailable.
          </p>
        ) : null}

        {healthQuery.data ? <HealthCards health={healthQuery.data} /> : null}

        <section
          className="rounded-lg border border-line bg-white p-5 shadow-sm"
          aria-label="Run checks"
        >
          <h2 className="text-lg font-semibold text-ink">Run check</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {checks.map(([checkId, label]) => (
              <button
                className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={runMutation.isPending}
                key={checkId}
                onClick={() => handleRun(checkId)}
                type="button"
              >
                {runningCheck === checkId && runMutation.isPending ? "Running..." : label}
              </button>
            ))}
          </div>
          {runMutation.isPending ? (
            <p className="mt-3 text-sm text-slate-600" role="status">
              Running bounded diagnostic check...
            </p>
          ) : null}
          {runError ? (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {runError}
            </p>
          ) : null}
        </section>

        {lastResult ? <LastResult result={lastResult} /> : null}
        <RecentChecks />
      </div>
    </div>
  );
}
