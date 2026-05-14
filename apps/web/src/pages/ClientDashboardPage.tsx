import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import {
  getClientCockpitSummary,
  type ClientCockpitSummary,
} from "../lib/api-client";

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatTime(value: string | null) {
  if (!value) {
    return "None";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Unavailable";
  }

  return parsed.toLocaleString();
}

function prettyStatus(value: string) {
  return value.replaceAll("_", " ");
}

function statusBadgeClass(value: string) {
  if (value === "attention_required" || value === "stale") {
    return "bg-red-50 text-red-700";
  }

  if (value === "busy" || value === "requested" || value === "leased") {
    return "bg-amber-50 text-amber-800";
  }

  if (
    value === "clear" ||
    value === "activity_seen" ||
    value === "configured" ||
    value === "exported_recently"
  ) {
    return "bg-emerald-50 text-emerald-700";
  }

  return "bg-slate-100 text-slate-700";
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={[
        "inline-flex rounded-md px-2 py-1 text-xs font-semibold capitalize",
        statusBadgeClass(value),
      ].join(" ")}
    >
      {prettyStatus(value)}
    </span>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-ink">{formatCount(value)}</p>
    </section>
  );
}

function DetailRows({ rows }: { rows: Array<[string, string | number | null]> }) {
  return (
    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div className="rounded-md border border-line bg-field p-3" key={label}>
          <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
          <dd className="mt-1 break-words text-sm font-medium text-slate-800">
            {value === null ? "None" : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SummaryPanel({ summary }: { summary: ClientCockpitSummary }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Leads 24h" value={summary.pipeline.leads24h} />
        <MetricCard label="Scored leads 24h" value={summary.pipeline.scoredLeads24h} />
        <MetricCard label="Drafts generated 24h" value={summary.pipeline.draftsGenerated24h} />
        <MetricCard label="Pending drafts" value={summary.pipeline.pendingDrafts} />
      </div>

      <section className="rounded-lg border border-line bg-white p-5 shadow-sm" aria-label="Gmail intake">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Gmail Intake</h2>
          <StatusBadge value={summary.gmailIntake.status} />
        </div>
        <DetailRows
          rows={[
            ["Last intake at", formatTime(summary.gmailIntake.lastIntakeAt)],
            ["Leads received 24h", formatCount(summary.gmailIntake.leadsReceived24h)],
          ]}
        />
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-sm" aria-label="Gmail export">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Gmail Export</h2>
          <StatusBadge value={summary.gmailExport.status} />
        </div>
        <DetailRows
          rows={[
            ["Pending requests", formatCount(summary.gmailExport.pendingRequestCount)],
            ["Active leases", formatCount(summary.gmailExport.activeLeaseCount)],
            ["Stale leases", formatCount(summary.gmailExport.staleLeaseCount)],
            ["Exported 24h", formatCount(summary.gmailExport.exported24h)],
            ["Last exported at", formatTime(summary.gmailExport.lastExportedAt)],
          ]}
        />
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-sm" aria-label="Google Sheets">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Google Sheets</h2>
          <StatusBadge value={summary.googleSheets.status} />
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-sm" aria-label="System">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">System</h2>
          <StatusBadge value={summary.system.queueStatus} />
        </div>
        <DetailRows
          rows={[
            ["Pending ready jobs", formatCount(summary.system.pendingReadyJobs)],
            ["Running jobs", formatCount(summary.system.runningJobs)],
            ["Failed jobs 24h", formatCount(summary.system.failedJobs24h)],
            [
              "Oldest pending job minutes",
              summary.system.oldestPendingJobMinutes === null
                ? null
                : formatCount(summary.system.oldestPendingJobMinutes),
            ],
          ]}
        />
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-sm" aria-label="Actions">
        <h2 className="text-lg font-semibold text-ink">Actions</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {summary.actions.map((action) =>
            action.kind === "disabled" ? (
              <span
                className="inline-flex min-h-11 items-center rounded-md border border-line bg-slate-100 px-4 text-sm font-semibold text-slate-500"
                key={action.label}
                title={action.reason ?? undefined}
              >
                {action.label}
              </span>
            ) : (
              <Link
                className={[
                  "inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold",
                  action.kind === "primary"
                    ? "bg-brand text-white hover:bg-brand-dark"
                    : "border border-line bg-white text-slate-700 hover:bg-field",
                ].join(" ")}
                key={action.label}
                to={action.href}
              >
                {action.label}
              </Link>
            ),
          )}
        </div>
      </section>
    </div>
  );
}

export function ClientDashboardPage() {
  const summaryQuery = useQuery({
    queryKey: ["client-cockpit-summary"],
    queryFn: getClientCockpitSummary,
  });

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase text-accent">Client cockpit</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">Client Dashboard</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Read-only aggregate status for the current Syrantis pipeline.
          </p>
          {summaryQuery.data ? (
            <p className="mt-2 text-xs text-slate-500">
              Generated {formatTime(summaryQuery.data.generatedAt)}. Window since{" "}
              {formatTime(summaryQuery.data.window.since)} ({summaryQuery.data.window.hours}h).
            </p>
          ) : null}
        </div>
        <button
          className="min-h-11 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-field disabled:cursor-not-allowed disabled:opacity-60"
          disabled={summaryQuery.isFetching}
          onClick={() => summaryQuery.refetch()}
          type="button"
        >
          {summaryQuery.isFetching && summaryQuery.data ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {summaryQuery.isLoading ? (
        <div className="rounded-lg border border-line bg-white p-5 text-sm text-slate-600" role="status">
          Loading client dashboard...
        </div>
      ) : null}

      {summaryQuery.isError && !summaryQuery.data ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          Client dashboard is unavailable.
        </div>
      ) : null}

      {summaryQuery.data ? <SummaryPanel summary={summaryQuery.data} /> : null}
    </section>
  );
}
