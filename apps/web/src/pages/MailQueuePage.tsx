import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import {
  getMailQueue,
  getMailQueueDetail,
  type MailQueueDetail,
  type MailQueueItem,
} from "../lib/api-client";

const categories = ["service", "quote", "newsletter", "machine_noise", "unknown"] as const;
const actions = ["create_lead", "review", "ignore"] as const;
const scoreBands = ["cold", "warm", "hot", "unknown"] as const;
const pipelineStates = [
  "classified",
  "scored",
  "draft_ready",
  "export_requested",
  "exported",
  "blocked",
  "processing",
  "ignored",
  "unknown",
] as const;
const contactStatuses = ["new", "known", "returning", "unknown"] as const;
const exportStatuses = [
  "none",
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
    value === "urgent_action"
  ) {
    return "bg-red-50 text-red-700";
  }

  if (value === "warm" || value === "requested" || value === "leased" || value === "review") {
    return "bg-amber-50 text-amber-800";
  }

  if (value === "exported" || value === "draft_ready" || value === "create_lead") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (value === "cold" || value === "known" || value === "returning") {
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

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
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
      aria-pressed={active}
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
    <section className="rounded-md border border-line bg-field p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <div className="mt-1 break-words text-sm font-medium text-slate-800">{children}</div>
    </section>
  );
}

function FilterGroup({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: readonly string[];
  values: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <FilterChip active={values.length === 0} label="All" onClick={() => onChange([])} />
        {options.map((value) => (
          <FilterChip
            active={values.includes(value)}
            key={value}
            label={value}
            onClick={() => onChange(toggleValue(values, value))}
          />
        ))}
      </div>
    </div>
  );
}

function MailCard({ item, onView }: { item: MailQueueItem; onView: (id: string) => void }) {
  return (
    <article className="rounded-lg border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge value={item.classification.category} />
            <Badge value={item.classification.action} />
            <Badge value={item.derived.pipelineState} />
          </div>
          <p className="mt-3 break-words text-sm leading-6 text-slate-700">
            {item.classification.reasonCode}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge value={item.score.scoreBand} />
          <Badge value={item.contact.status} />
        </div>
      </div>

      <dl className="mt-4 grid gap-3 md:grid-cols-2">
        <DetailTile label="Score">
          {[item.score.scoreBand, item.score.score].filter((value) => value !== null).join(" / ")}
        </DetailTile>
        <DetailTile label="Contact status">
          {item.contact.status} / previous leads {item.contact.previousLeadCount}
        </DetailTile>
        <DetailTile label="Draft">
          {item.draft.draftId ? `${item.draft.status ?? "draft"} preview available` : "No draft"}
        </DetailTile>
        <DetailTile label="Gmail export">
          <div className="flex flex-wrap gap-2">
            <Badge value={item.gmailExport.exportStatus} />
            {item.gmailExport.canExport ? <Badge value="ready" /> : null}
          </div>
        </DetailTile>
        <DetailTile label="Attention flags">
          {item.derived.attentionFlags.length ? (
            <div className="flex flex-wrap gap-2">
              {item.derived.attentionFlags.map((flag) => (
                <Badge key={flag} value={flag} />
              ))}
            </div>
          ) : (
            "None"
          )}
        </DetailTile>
        <DetailTile label="Next best action">{item.derived.nextBestAction}</DetailTile>
      </dl>

      <div className="mt-4">
        <button
          className="min-h-11 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-field"
          onClick={() => onView(item.classificationId)}
          type="button"
        >
          View details
        </button>
      </div>
    </article>
  );
}

function DraftLinks({ detail }: { detail: MailQueueDetail }) {
  if (!detail.draft.draftId && !detail.lead.leadId) {
    return null;
  }

  const draftQueueHref = detail.draft.draftId
    ? `/app/draft-queue?draftId=${encodeURIComponent(detail.draft.draftId)}`
    : `/app/draft-queue?leadId=${encodeURIComponent(detail.lead.leadId ?? "")}`;

  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">Related screens</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-field"
          to={draftQueueHref}
        >
          View Draft Queue
        </Link>
        {detail.draft.draftId ? (
          <Link
            className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-field"
            to={`/app/gmail-export?draftId=${encodeURIComponent(detail.draft.draftId)}`}
          >
            View Gmail Export
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function MailDetailDrawer({
  detail,
  isLoading,
  onClose,
}: {
  detail: MailQueueDetail | undefined;
  isLoading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-20 bg-slate-900/30" role="presentation">
      <aside
        aria-label="Mail queue detail"
        className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="text-sm font-semibold uppercase text-accent">Classified mail</p>
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

        {isLoading ? <p className="mt-5 text-sm text-slate-600">Loading mail detail...</p> : null}

        {detail ? (
          <div className="mt-5 grid gap-4">
            <section className="grid gap-3 md:grid-cols-2" aria-label="Mail detail cards">
              <DetailTile label="Classification">
                <div className="flex flex-wrap gap-2">
                  <Badge value={detail.classification.category} />
                  <Badge value={detail.classification.action} />
                  <Badge value={detail.classification.confidence} />
                </div>
                <p className="mt-2">{detail.classification.reasonCode}</p>
              </DetailTile>
              <DetailTile label="Score">
                <div className="flex flex-wrap gap-2">
                  <Badge value={detail.score.scoreBand} />
                  <span>{formatValue(detail.score.score)}</span>
                </div>
                <p className="mt-2">{formatValue(detail.score.recommendedAction)}</p>
              </DetailTile>
              <DetailTile label="Contact status">
                {detail.contact.status} / known {formatValue(detail.contact.known)} / previous{" "}
                {detail.contact.previousLeadCount}
              </DetailTile>
              <DetailTile label="Draft preview">
                <p>{detail.draft.subjectPreview ?? "No subject preview"}</p>
                <p className="mt-2 font-normal leading-6 text-slate-700">
                  {detail.draft.bodyPreview ?? "No draft preview available."}
                </p>
              </DetailTile>
              <DetailTile label="Export status">
                <div className="flex flex-wrap gap-2">
                  <Badge value={detail.gmailExport.exportStatus} />
                  {detail.gmailExport.canExport ? <Badge value="ready" /> : null}
                </div>
                <p className="mt-2">Exported at {formatValue(detail.gmailExport.exportedAt)}</p>
              </DetailTile>
              <DetailTile label="Company context">
                {[
                  detail.companyContext.companyName,
                  detail.companyContext.sector,
                  detail.companyContext.language,
                ]
                  .filter(Boolean)
                  .join(" / ") || "None"}
              </DetailTile>
            </section>
            <DraftLinks detail={detail} />
          </div>
        ) : null}
      </aside>
    </div>
  );
}

export function MailQueuePage() {
  const [includeIgnored, setIncludeIgnored] = useState(false);
  const [category, setCategory] = useState<string[]>([]);
  const [action, setAction] = useState<string[]>([]);
  const [scoreBand, setScoreBand] = useState<string[]>([]);
  const [pipelineState, setPipelineState] = useState<string[]>([]);
  const [contactStatus, setContactStatus] = useState<string[]>([]);
  const [hasDraft, setHasDraft] = useState<boolean | undefined>();
  const [exportStatus, setExportStatus] = useState<string[]>([]);
  const [attentionRequired, setAttentionRequired] = useState(false);
  const [selectedClassificationId, setSelectedClassificationId] = useState<string | null>(null);

  const queueQuery = useQuery({
    queryKey: [
      "mail-queue",
      includeIgnored,
      category,
      action,
      scoreBand,
      pipelineState,
      contactStatus,
      hasDraft,
      exportStatus,
      attentionRequired,
    ],
    queryFn: () => {
      const params: Parameters<typeof getMailQueue>[0] = {
        limit: 20,
        includeIgnored,
        category,
        action,
        scoreBand,
        pipelineState,
        contactStatus,
        exportStatus,
      };

      if (hasDraft !== undefined) {
        params.hasDraft = hasDraft;
      }

      if (attentionRequired) {
        params.attentionRequired = true;
      }

      return getMailQueue(params);
    },
  });

  const detailQuery = useQuery({
    queryKey: ["mail-queue-detail", selectedClassificationId],
    queryFn: () => {
      if (!selectedClassificationId) {
        throw new Error("Missing classification ID.");
      }

      return getMailQueueDetail(selectedClassificationId);
    },
    enabled: selectedClassificationId !== null,
  });

  const summary = queueQuery.data?.summary;

  return (
    <section className="max-w-6xl">
      <p className="text-sm font-semibold uppercase text-accent">Client control surface</p>
      <h1 className="mt-2 text-3xl font-semibold text-ink">Mail Review Queue</h1>
      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
        This is a mail review queue for AI-classified inbound messages. It is not an inbox.
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        <SummaryCard label="Classified" value={summary?.totalClassified ?? 0} />
        <SummaryCard label="Ignored" value={summary?.totalIgnored ?? 0} />
        <SummaryCard label="Leads created" value={summary?.totalLeadsCreated ?? 0} />
        <SummaryCard label="Scored" value={summary?.totalScored ?? 0} />
        <SummaryCard label="With draft" value={summary?.totalWithDraft ?? 0} />
        <SummaryCard label="Exported" value={summary?.totalExported ?? 0} />
        <SummaryCard label="Attention required" value={summary?.totalAttentionRequired ?? 0} />
      </div>

      <div className="mt-5 grid gap-4 rounded-lg border border-line bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            aria-pressed={includeIgnored}
            className={[
              "min-h-11 rounded-md border px-4 text-sm font-semibold",
              includeIgnored
                ? "border-brand bg-teal-50 text-brand"
                : "border-line bg-white text-slate-700 hover:bg-field",
            ].join(" ")}
            onClick={() => setIncludeIgnored((value) => !value)}
            type="button"
          >
            Include ignored
          </button>
          <button
            aria-pressed={hasDraft === true}
            className={[
              "min-h-11 rounded-md border px-4 text-sm font-semibold",
              hasDraft === true
                ? "border-brand bg-teal-50 text-brand"
                : "border-line bg-white text-slate-700 hover:bg-field",
            ].join(" ")}
            onClick={() => setHasDraft(hasDraft === true ? undefined : true)}
            type="button"
          >
            Has draft
          </button>
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

        <FilterGroup
          label="Category"
          onChange={setCategory}
          options={categories}
          values={category}
        />
        <FilterGroup label="Action" onChange={setAction} options={actions} values={action} />
        <FilterGroup
          label="Score band"
          onChange={setScoreBand}
          options={scoreBands}
          values={scoreBand}
        />
        <FilterGroup
          label="Pipeline state"
          onChange={setPipelineState}
          options={pipelineStates}
          values={pipelineState}
        />
        <FilterGroup
          label="Contact status"
          onChange={setContactStatus}
          options={contactStatuses}
          values={contactStatus}
        />
        <FilterGroup
          label="Gmail export"
          onChange={setExportStatus}
          options={exportStatuses}
          values={exportStatus}
        />
      </div>

      <div className="mt-5 grid gap-4">
        {queueQuery.isLoading ? (
          <div className="rounded-lg border border-line bg-white p-5 text-sm text-slate-600">
            Loading mail queue...
          </div>
        ) : null}
        {queueQuery.isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            Mail queue is unavailable.
          </div>
        ) : null}
        {queueQuery.data && queueQuery.data.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-white p-5 text-sm text-slate-600">
            No classified inbound mail is visible in this queue.
          </div>
        ) : null}
        {queueQuery.data?.items.map((item) => (
          <MailCard item={item} key={item.classificationId} onView={setSelectedClassificationId} />
        ))}
      </div>

      {selectedClassificationId ? (
        <MailDetailDrawer
          detail={detailQuery.data}
          isLoading={detailQuery.isLoading}
          onClose={() => setSelectedClassificationId(null)}
        />
      ) : null}
    </section>
  );
}
