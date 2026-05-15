import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  cancelDraftGmailExportRequest,
  getDraftQueue,
  getDraftQueueDetail,
  requestDraftGmailExport,
  type DraftQueueDetail,
  type DraftQueueItem,
} from "../lib/api-client";

const scoreBands = ["cold", "warm", "hot", "unknown"] as const;
const exportStatuses = [
  "not_exported",
  "requested",
  "leased",
  "exported",
  "blocked",
  "unknown",
] as const;

function badgeClass(value: string) {
  if (
    value === "hot" ||
    value === "blocked" ||
    value === "high_score" ||
    value === "export_blocked"
  ) {
    return "bg-red-50 text-red-700";
  }

  if (
    value === "warm" ||
    value === "requested" ||
    value === "leased" ||
    value === "urgent_action"
  ) {
    return "bg-amber-50 text-amber-800";
  }

  if (value === "exported" || value === "ready") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (value === "cold" || value === "not_exported") {
    return "bg-teal-50 text-brand";
  }

  return "bg-slate-100 text-slate-700";
}

function Badge({ value }: { value: string }) {
  return (
    <span
      className={["inline-flex rounded-md px-2 py-1 text-xs font-semibold", badgeClass(value)].join(
        " ",
      )}
    >
      {value}
    </span>
  );
}

function formatValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "None";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={[
        "min-h-9 rounded-md border px-3 text-sm font-semibold transition",
        active
          ? "border-brand bg-teal-50 text-brand"
          : "border-line bg-white text-slate-700 hover:bg-field",
      ].join(" ")}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function DetailTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-field p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <div className="mt-1 break-words text-sm font-medium text-slate-800">{children}</div>
    </div>
  );
}

function DraftQueueActions({
  actions,
  disabled,
  onCancel,
  onRequest,
}: {
  actions: DraftQueueItem["actions"];
  disabled: boolean;
  onCancel: () => void;
  onRequest: () => void;
}) {
  if (!actions.canRequestGmailExport && !actions.canCancelGmailExportRequest) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {actions.canRequestGmailExport ? (
        <button
          className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          onClick={onRequest}
          type="button"
        >
          Request Gmail export
        </button>
      ) : null}
      {actions.canCancelGmailExportRequest ? (
        <button
          className="min-h-11 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-field disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          onClick={onCancel}
          type="button"
        >
          Cancel request
        </button>
      ) : null}
    </div>
  );
}

function DraftCard({
  actionInFlight,
  item,
  onCancelRequest,
  onRequestExport,
  onView,
}: {
  actionInFlight: boolean;
  item: DraftQueueItem;
  onCancelRequest: (draftId: string) => void;
  onRequestExport: (draftId: string) => void;
  onView: (draftId: string) => void;
}) {
  return (
    <article className="rounded-lg border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold text-ink">
            {item.draftPreview.subjectPreview ?? "No subject"}
          </h2>
          <p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-slate-700">
            {item.draftPreview.bodyPreview ?? "No body preview available."}
          </p>
        </div>
        <Badge value={item.score.scoreBand} />
      </div>

      <dl className="mt-4 grid gap-3 md:grid-cols-2">
        <DetailTile label="Recommended action">
          {formatValue(item.score.recommendedAction)}
        </DetailTile>
        <DetailTile label="Urgency / intent">
          {[item.score.urgency, item.score.intent].filter(Boolean).join(" / ") || "None"}
        </DetailTile>
        <DetailTile label="Company context">
          {[item.contextSummary.companyName, item.contextSummary.sector]
            .filter(Boolean)
            .join(" / ") || "None"}
        </DetailTile>
        <DetailTile label="Contact known">
          {formatValue(item.contextSummary.contactKnown)}
        </DetailTile>
        <DetailTile label="Gmail export">
          <div className="flex flex-wrap gap-2">
            <Badge value={item.gmailExport.exportStatus} />
            {item.gmailExport.canExport ? <Badge value="ready" /> : null}
          </div>
        </DetailTile>
        <DetailTile label="Attention flags">
          {item.attentionFlags.length ? (
            <div className="flex flex-wrap gap-2">
              {item.attentionFlags.map((flag) => (
                <Badge key={flag} value={flag} />
              ))}
            </div>
          ) : (
            "None"
          )}
        </DetailTile>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="min-h-11 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-field"
          onClick={() => onView(item.draftId)}
          type="button"
        >
          View details
        </button>
        <DraftQueueActions
          actions={item.actions}
          disabled={actionInFlight}
          onCancel={() => onCancelRequest(item.draftId)}
          onRequest={() => onRequestExport(item.draftId)}
        />
      </div>
    </article>
  );
}

function DraftDetailDrawer({
  actionInFlight,
  detail,
  isLoading,
  onCancelRequest,
  onClose,
  onRequestExport,
}: {
  actionInFlight: boolean;
  detail: DraftQueueDetail | undefined;
  isLoading: boolean;
  onCancelRequest: (draftId: string) => void;
  onClose: () => void;
  onRequestExport: (draftId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-20 bg-slate-900/30" role="presentation">
      <aside
        aria-label="Draft detail"
        className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="text-sm font-semibold uppercase text-accent">Generated draft</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">Review detail</h2>
          </div>
          <button
            className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-field"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        {isLoading ? <p className="mt-5 text-sm text-slate-600">Loading draft detail...</p> : null}

        {detail ? (
          <div className="mt-5 grid gap-5">
            <DraftQueueActions
              actions={detail.actions}
              disabled={actionInFlight}
              onCancel={() => onCancelRequest(detail.draftId)}
              onRequest={() => onRequestExport(detail.draftId)}
            />

            <section className="rounded-lg border border-line bg-field p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Subject</p>
              <h3 className="mt-2 break-words text-xl font-semibold text-ink">
                {detail.proposedDraft.subject || "No subject"}
              </h3>
              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                {detail.proposedDraft.bodyText}
              </p>
            </section>

            <section className="grid gap-3 md:grid-cols-2" aria-label="Draft context">
              <DetailTile label="Score">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge value={detail.score.scoreBand} />
                  <span>{formatValue(detail.score.score)}</span>
                </div>
              </DetailTile>
              <DetailTile label="Confidence">{formatValue(detail.score.confidence)}</DetailTile>
              <DetailTile label="Company">
                {formatValue(detail.contextSummary.companyName)}
              </DetailTile>
              <DetailTile label="Sector">{formatValue(detail.contextSummary.sector)}</DetailTile>
              <DetailTile label="Contact known">
                {formatValue(detail.contextSummary.contactKnown)}
              </DetailTile>
              <DetailTile label="Previous leads">
                {formatValue(detail.contextSummary.previousLeadCount)}
              </DetailTile>
              <DetailTile label="Gmail export">
                <div className="flex flex-wrap gap-2">
                  <Badge value={detail.gmailExport.exportStatus} />
                  {detail.gmailExport.canExport ? <Badge value="ready" /> : null}
                </div>
              </DetailTile>
              <DetailTile label="Blocking reasons">
                {detail.gmailExport.blockingReasons.length
                  ? detail.gmailExport.blockingReasons.join(", ")
                  : "None"}
              </DetailTile>
            </section>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

export function DraftQueuePage() {
  const [scoreBand, setScoreBand] = useState<string | undefined>();
  const [exportStatus, setExportStatus] = useState<string | undefined>();
  const [attentionRequired, setAttentionRequired] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const queueQuery = useQuery({
    queryKey: ["draft-queue", scoreBand, exportStatus, attentionRequired],
    queryFn: () => {
      const params: Parameters<typeof getDraftQueue>[0] = { limit: 20 };

      if (scoreBand) {
        params.scoreBand = scoreBand;
      }

      if (exportStatus) {
        params.exportStatus = exportStatus;
      }

      if (attentionRequired) {
        params.attentionRequired = true;
      }

      return getDraftQueue(params);
    },
  });

  const detailQuery = useQuery({
    queryKey: ["draft-queue-detail", selectedDraftId],
    queryFn: () => {
      if (!selectedDraftId) {
        throw new Error("Missing draft ID.");
      }

      return getDraftQueueDetail(selectedDraftId);
    },
    enabled: selectedDraftId !== null,
  });

  const summary = queueQuery.data?.summary;

  async function refreshQueueAndDetail() {
    await queueQuery.refetch();

    if (selectedDraftId) {
      await detailQuery.refetch();
    }
  }

  async function handleRequestExport(draftId: string) {
    if (!window.confirm("Request Gmail export for this draft?")) {
      return;
    }

    setActionInFlight(true);
    setActionMessage(null);

    try {
      await requestDraftGmailExport(draftId);
      await refreshQueueAndDetail();
      setActionMessage({
        kind: "success",
        text: "Gmail export requested. Refresh complete.",
      });
    } catch {
      setActionMessage({
        kind: "error",
        text: "Could not request Gmail export.",
      });
    } finally {
      setActionInFlight(false);
    }
  }

  async function handleCancelRequest(draftId: string) {
    if (!window.confirm("Cancel this Gmail export request?")) {
      return;
    }

    setActionInFlight(true);
    setActionMessage(null);

    try {
      await cancelDraftGmailExportRequest(draftId);
      await refreshQueueAndDetail();
      setActionMessage({
        kind: "success",
        text: "Gmail export request cancelled. Refresh complete.",
      });
    } catch {
      setActionMessage({
        kind: "error",
        text: "Could not cancel Gmail export request.",
      });
    } finally {
      setActionInFlight(false);
    }
  }

  return (
    <section className="max-w-6xl">
      <p className="text-sm font-semibold uppercase text-accent">Client control surface</p>
      <h1 className="mt-2 text-3xl font-semibold text-ink">Draft Queue</h1>
      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
        Request export creates a Gmail draft through the existing bridge. Sending still happens in
        Gmail.
      </div>

      {actionMessage ? (
        <div
          className={[
            "mt-5 rounded-lg border p-4 text-sm font-medium",
            actionMessage.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800",
          ].join(" ")}
          role="status"
        >
          {actionMessage.text}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-5">
        <SummaryCard label="Pending review" value={summary?.pendingReview ?? 0} />
        <SummaryCard label="Ready for Gmail export" value={summary?.readyForGmailExport ?? 0} />
        <SummaryCard label="Exported" value={summary?.exported ?? 0} />
        <SummaryCard label="Blocked" value={summary?.blocked ?? 0} />
        <SummaryCard label="Attention required" value={summary?.attentionRequired ?? 0} />
      </div>

      <div className="mt-5 grid gap-4 rounded-lg border border-line bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Score band</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <FilterChip active={!scoreBand} label="All" onClick={() => setScoreBand(undefined)} />
            {scoreBands.map((band) => (
              <FilterChip
                active={scoreBand === band}
                key={band}
                label={band}
                onClick={() => setScoreBand(scoreBand === band ? undefined : band)}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Gmail export</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <FilterChip
              active={!exportStatus}
              label="All"
              onClick={() => setExportStatus(undefined)}
            />
            {exportStatuses.map((status) => (
              <FilterChip
                active={exportStatus === status}
                key={status}
                label={status}
                onClick={() => setExportStatus(exportStatus === status ? undefined : status)}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            aria-pressed={attentionRequired}
            className={[
              "min-h-11 rounded-md border px-4 text-sm font-semibold",
              attentionRequired
                ? "border-brand bg-teal-50 text-brand"
                : "border-line bg-white text-slate-700 hover:bg-field",
            ].join(" ")}
            onClick={() => setAttentionRequired((value) => !value)}
            type="button"
          >
            Attention required
          </button>
          <button
            className="min-h-11 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-field disabled:cursor-not-allowed disabled:opacity-60"
            disabled={queueQuery.isFetching}
            onClick={() => queueQuery.refetch()}
            type="button"
          >
            {queueQuery.isFetching ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        {queueQuery.isLoading ? (
          <div className="rounded-lg border border-line bg-white p-5 text-sm text-slate-600">
            Loading draft queue...
          </div>
        ) : null}
        {queueQuery.isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            Draft queue is unavailable.
          </div>
        ) : null}
        {queueQuery.data && queueQuery.data.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-white p-5 text-sm text-slate-600">
            No generated drafts are waiting in this queue.
          </div>
        ) : null}
        {queueQuery.data?.items.map((item) => (
          <DraftCard
            actionInFlight={actionInFlight}
            item={item}
            key={item.draftId}
            onCancelRequest={handleCancelRequest}
            onRequestExport={handleRequestExport}
            onView={setSelectedDraftId}
          />
        ))}
      </div>

      {selectedDraftId ? (
        <DraftDetailDrawer
          actionInFlight={actionInFlight}
          detail={detailQuery.data}
          isLoading={detailQuery.isLoading}
          onCancelRequest={handleCancelRequest}
          onClose={() => setSelectedDraftId(null)}
          onRequestExport={handleRequestExport}
        />
      ) : null}
    </section>
  );
}
