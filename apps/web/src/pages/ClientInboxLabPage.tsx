import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ApiRequestError,
  ApiUnauthorizedError,
  cancelClientInboxGmailExport,
  getClientInboxMessage,
  listClientInboxMessages,
  requestClientInboxGmailExport,
  updateClientInboxDraft,
  type ClientInboxMessageDetail,
  type ClientInboxMessagesData,
} from "../lib/api-client";

type LabTab = "all" | "needs_review" | "ignored" | "ready_draft" | "hot";
type LabSort = "newest" | "score" | "urgency";

type DetailRowValue = string | number | boolean | null | undefined | ReactNode;

const tabOptions: Array<{ value: LabTab; label: string }> = [
  { value: "all", label: "All" },
  { value: "needs_review", label: "Needs review" },
  { value: "ignored", label: "Ignored" },
  { value: "ready_draft", label: "Ready draft" },
  { value: "hot", label: "Hot" },
];

const sortOptions: Array<{ value: LabSort; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "score", label: "Score" },
  { value: "urgency", label: "Urgency" },
];

const limitOptions = [5, 10, 20, 50];

function formatValue(value: DetailRowValue) {
  if (value === null || value === undefined || value === "") {
    return "None";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return value;
}

function formatNullableText(value: string | null) {
  return value === null ? "null" : value;
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

function formatList(values: string[]) {
  return values.length ? values.join(", ") : "None";
}

function previewText(value: string | null, maxLength = 700) {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function badgeClass(value: string) {
  if (value === "hot" || value === "needs_review" || value === "blocked") {
    return "bg-red-50 text-red-700";
  }

  if (value === "requested" || value === "leased" || value === "processing") {
    return "bg-amber-50 text-amber-800";
  }

  if (value === "ready" || value === "draft_ready" || value === "exported") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (value === "ignored") {
    return "bg-slate-100 text-slate-700";
  }

  return "bg-teal-50 text-brand";
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={[
        "inline-flex rounded-md px-2 py-1 text-xs font-semibold capitalize",
        badgeClass(value),
      ].join(" ")}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}

function DetailRows({
  rows,
  columns = "sm:grid-cols-2",
}: {
  rows: Array<[string, DetailRowValue]>;
  columns?: string;
}) {
  return (
    <dl className={["mt-4 grid gap-3", columns].join(" ")}>
      {rows.map(([label, value]) => (
        <div className="rounded-md border border-line bg-field p-3" key={label}>
          <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
          <dd className="mt-1 break-words text-sm font-medium text-slate-800">
            {formatValue(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function actionErrorMessage(action: string, error: unknown) {
  if (error instanceof ApiUnauthorizedError) {
    return `${action} failed (401).`;
  }

  if (error instanceof ApiRequestError && error.status) {
    return `${action} failed (${error.status}).`;
  }

  return `${action} failed.`;
}

function completenessRows(
  detail: ClientInboxMessageDetail | undefined,
  selectedItem: ClientInboxMessagesData["items"][number] | undefined,
) {
  if (!detail) {
    return [];
  }

  const missingForFinalUI = [
    selectedItem?.subjectPreview ? null : "listSubjectPreview",
    selectedItem?.snippetPreview ? null : "listSnippetPreview",
    selectedItem?.senderDisplay === null ? "senderDisplay" : null,
    selectedItem?.companyDisplay === null ? "companyDisplay" : null,
    detail.mail.attachments.length === 0 ? "attachments" : null,
    "thread context",
  ].filter((value): value is string => Boolean(value));

  return [
    ["hasBodyText", Boolean(detail.mail.bodyText)],
    ["hasFromEmail", Boolean(detail.mail.fromEmail)],
    ["hasToEmail", Boolean(detail.mail.toEmail)],
    ["hasSubject", Boolean(detail.mail.subject)],
    ["hasDraft", Boolean(detail.draft.draftId)],
    ["canEditDraft", detail.actions.canEditDraft],
    ["canRequestGmailExport", detail.actions.canRequestGmailExport],
    ["canCancelGmailExport", detail.actions.canCancelGmailExport],
    ["hasThreadId", "not exposed"],
    ["hasAttachments", detail.mail.attachments.length > 0],
    ["missingForFinalUI", formatList(missingForFinalUI)],
  ] satisfies Array<[string, DetailRowValue]>;
}

function ListItemButton({
  item,
  selected,
  onSelect,
}: {
  item: ClientInboxMessagesData["items"][number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={[
        "w-full rounded-md border p-4 text-left transition",
        selected
          ? "border-brand bg-teal-50 shadow-sm"
          : "border-line bg-white hover:border-brand hover:bg-field",
      ].join(" ")}
      onClick={onSelect}
      type="button"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-full break-all font-mono text-xs text-slate-600">{item.mailItemId}</p>
        <div className="flex flex-wrap gap-1">
          <StatusBadge value={item.category} />
          <StatusBadge value={item.pipelineState} />
        </div>
      </div>
      <DetailRows
        columns="sm:grid-cols-2 lg:grid-cols-3"
        rows={[
          ["Received", formatTime(item.receivedAt)],
          ["Score", item.score === null ? "None" : `${item.score} / ${item.scoreBand}`],
          ["Contact", item.contactStatus],
          ["Draft", item.draftStatus],
          ["Gmail export", item.gmailExportStatus],
          ["Flags", formatList(item.attentionFlags)],
          ["Subject preview", item.subjectPreview],
          ["Snippet preview", item.snippetPreview],
          ["Subject value", formatNullableText(item.subject)],
          ["Snippet value", formatNullableText(item.snippet)],
        ]}
      />
    </button>
  );
}

function DetailPanel({
  detail,
  isLoading,
  isError,
}: {
  detail: ClientInboxMessageDetail | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-line bg-white p-5 text-sm text-slate-600">
        Loading Inbox detail...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
        Inbox detail is unavailable for that message.
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-white p-5 text-sm text-slate-600">
        Select a message to inspect the approved detail DTO.
      </div>
    );
  }

  const bodyPreview = previewText(detail.mail.bodyText);

  return (
    <section
      className="rounded-lg border border-line bg-white p-5 shadow-sm"
      aria-label="Inbox detail"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Detail panel</h2>
        <StatusBadge value={detail.analysis.scoreBand} />
      </div>

      <DetailRows
        rows={[
          ["Mail item ID", detail.mail.mailItemId],
          ["Received", formatTime(detail.mail.receivedAt)],
          ["Subject", detail.mail.subject],
          ["bodyText present", Boolean(detail.mail.bodyText)],
          ["fromEmail present", Boolean(detail.mail.fromEmail)],
          ["toEmail present", Boolean(detail.mail.toEmail)],
          ["From display", detail.mail.fromDisplay],
          ["From email", detail.mail.fromEmail],
          ["To display", detail.mail.toDisplay],
          ["To email", detail.mail.toEmail],
          ["Attachments", detail.mail.attachments.length],
        ]}
      />

      {bodyPreview ? (
        <div className="mt-4 rounded-md border border-line bg-field p-4" aria-label="Body preview">
          <p className="text-xs font-semibold uppercase text-slate-500">Body preview</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">
            {bodyPreview}
          </p>
        </div>
      ) : null}

      <section className="mt-5 border-t border-line pt-5" aria-label="Analysis">
        <h3 className="text-base font-semibold text-ink">Analysis</h3>
        <DetailRows
          rows={[
            ["Category", detail.analysis.category],
            ["Action", detail.analysis.action],
            ["Reason code", detail.analysis.reasonCode],
            ["Intent", detail.analysis.intent],
            ["Urgency", detail.analysis.urgency],
            ["Score", detail.analysis.score],
            ["Confidence", detail.analysis.confidence],
            ["Recommended action", detail.analysis.recommendedAction],
            ["Attention flags", formatList(detail.analysis.attentionFlags)],
          ]}
        />
      </section>

      <section className="mt-5 border-t border-line pt-5" aria-label="Contact context">
        <h3 className="text-base font-semibold text-ink">Contact context</h3>
        <DetailRows
          rows={[
            ["Known", detail.contactContext.contactKnown],
            ["Status", detail.contactContext.contactStatus],
            ["Previous leads", detail.contactContext.previousLeadCount],
            ["Previous threads", detail.contactContext.previousThreadCount],
            ["Last inbound", formatTime(detail.contactContext.lastInboundAt)],
            ["Last outbound", formatTime(detail.contactContext.lastOutboundAt)],
            ["Last outbound status", detail.contactContext.lastOutboundStatus],
          ]}
        />
      </section>

      <section className="mt-5 border-t border-line pt-5" aria-label="Company and policy context">
        <h3 className="text-base font-semibold text-ink">Company / policy context</h3>
        <DetailRows
          rows={[
            ["Company", detail.companyPolicyContext.companyName],
            ["Sector", detail.companyPolicyContext.sector],
            ["Language", detail.companyPolicyContext.language],
            ["Tone", detail.companyPolicyContext.tone],
            ["Rules matched", formatList(detail.companyPolicyContext.keyRulesMatched)],
            ["Missing info", formatList(detail.companyPolicyContext.missingInfo)],
            ["Forbidden claims", formatList(detail.companyPolicyContext.forbiddenClaims)],
          ]}
        />
      </section>

      <section className="mt-5 border-t border-line pt-5" aria-label="Draft state">
        <h3 className="text-base font-semibold text-ink">Draft state</h3>
        <DetailRows
          rows={[
            ["Draft ID", detail.draft.draftId],
            ["Draft subject", detail.draft.subject],
            ["Draft body present", Boolean(detail.draft.bodyText)],
            ["Status", detail.draft.status],
            ["Generated", formatTime(detail.draft.generatedAt)],
            ["Edited", formatTime(detail.draft.editedAt)],
            ["Source", detail.draft.source],
            ["Policy match score", detail.draft.policyMatchScore],
            ["Can edit", detail.draft.canEdit],
            ["Can rewrite", detail.draft.canRewrite],
            ["Can export to Gmail", detail.draft.canExportToGmail],
          ]}
        />
      </section>

      <section className="mt-5 border-t border-line pt-5" aria-label="Gmail export state">
        <h3 className="text-base font-semibold text-ink">Gmail export state</h3>
        <DetailRows
          rows={[
            ["Status", detail.gmailExport.status],
            ["Requested", formatTime(detail.gmailExport.requestedAt)],
            ["Exported", formatTime(detail.gmailExport.exportedAt)],
            ["Blocking reasons", formatList(detail.gmailExport.blockingReasons)],
            ["Can edit draft", detail.actions.canEditDraft],
            ["Can request Gmail export", detail.actions.canRequestGmailExport],
            ["Can cancel Gmail export", detail.actions.canCancelGmailExport],
            ["Rewrite later", detail.actions.canRewriteLater],
            ["Direct send later", detail.actions.canSendDirectLater],
          ]}
        />
      </section>
    </section>
  );
}

export function ClientInboxLabPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<LabTab>("all");
  const [sort, setSort] = useState<LabSort>("newest");
  const [limit, setLimit] = useState(20);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["client-inbox-lab", "messages", tab, sort, limit],
    queryFn: () => listClientInboxMessages({ tab, sort, limit }),
  });

  const selectedItem = useMemo(
    () => listQuery.data?.items.find((item) => item.mailItemId === selectedId),
    [listQuery.data?.items, selectedId],
  );

  const detailQuery = useQuery({
    queryKey: ["client-inbox-lab", "message-detail", selectedId],
    queryFn: () => {
      if (!selectedId) {
        throw new Error("Missing selected message.");
      }

      return getClientInboxMessage(selectedId);
    },
    enabled: selectedId !== null,
  });

  useEffect(() => {
    setSelectedId(null);
  }, [tab, sort, limit]);

  useEffect(() => {
    setDraftSubject("");
    setDraftBody("");
    setDraftMessage(null);
    setDraftError(null);
    setExportMessage(null);
    setExportError(null);
  }, [selectedId]);

  const selectedDetail = detailQuery.data;
  const canEditDraft = Boolean(selectedDetail?.actions.canEditDraft);
  const canRequestExport = Boolean(selectedDetail?.actions.canRequestGmailExport);
  const canCancelExport = Boolean(selectedDetail?.actions.canCancelGmailExport);

  const draftMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) {
        throw new Error("Missing selected message.");
      }

      return updateClientInboxDraft(selectedId, {
        subject: draftSubject,
        bodyText: draftBody,
      });
    },
    onSuccess: async (response) => {
      setDraftError(null);
      setDraftMessage(
        `Draft ${response.status} updated. Can export: ${response.canExportToGmail ? "Yes" : "No"}.`,
      );
      setDraftSubject("");
      setDraftBody("");
      await Promise.all([
        detailQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["client-inbox-lab", "messages"] }),
      ]);
    },
    onError: (error) => {
      setDraftMessage(null);
      setDraftError(actionErrorMessage("Draft edit", error));
    },
  });

  const requestExportMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) {
        throw new Error("Missing selected message.");
      }

      return requestClientInboxGmailExport(selectedId);
    },
    onSuccess: async (response) => {
      setExportError(null);
      setExportMessage(
        `Export request ${response.requestStatus}. Can export: ${response.canExport ? "Yes" : "No"}.`,
      );
      await Promise.all([
        detailQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["client-inbox-lab", "messages"] }),
      ]);
    },
    onError: (error) => {
      setExportMessage(null);
      setExportError(actionErrorMessage("Export request", error));
    },
  });

  const cancelExportMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) {
        throw new Error("Missing selected message.");
      }

      return cancelClientInboxGmailExport(selectedId);
    },
    onSuccess: async (response) => {
      setExportError(null);
      setExportMessage(
        `Export request ${response.requestStatus} at ${formatTime(response.cancelledAt)}.`,
      );
      await Promise.all([
        detailQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["client-inbox-lab", "messages"] }),
      ]);
    },
    onError: (error) => {
      setExportMessage(null);
      setExportError(actionErrorMessage("Export cancel", error));
    },
  });

  function handleDraftSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEditDraft || draftMutation.isPending || draftBody.trim().length === 0) {
      return;
    }

    draftMutation.mutate();
  }

  const completeness = completenessRows(selectedDetail, selectedItem);
  const exportActionPending = requestExportMutation.isPending || cancelExportMutation.isPending;

  return (
    <section className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase text-accent">Client Inbox domain</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">Client Inbox Lab</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Validation interne du domaine Inbox client
          </p>
        </div>
        <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
          Internal validation only · Not final client UI
        </span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.25fr)]">
        <section
          className="rounded-lg border border-line bg-white p-5 shadow-sm"
          aria-label="Filter and list"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Tab
              <select
                aria-label="Inbox tab"
                className="min-h-11 rounded-md border border-line bg-field px-3 text-base outline-none focus:border-brand focus:bg-white"
                onChange={(event) => setTab(event.target.value as LabTab)}
                value={tab}
              >
                {tabOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Sort
              <select
                aria-label="Inbox sort"
                className="min-h-11 rounded-md border border-line bg-field px-3 text-base outline-none focus:border-brand focus:bg-white"
                onChange={(event) => setSort(event.target.value as LabSort)}
                value={sort}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Limit
              <select
                aria-label="Inbox limit"
                className="min-h-11 rounded-md border border-line bg-field px-3 text-base outline-none focus:border-brand focus:bg-white"
                onChange={(event) => setLimit(Number(event.target.value))}
                value={limit}
              >
                {limitOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="min-h-11 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-field disabled:cursor-not-allowed disabled:opacity-60"
              disabled={listQuery.isFetching}
              onClick={() => listQuery.refetch()}
              type="button"
            >
              {listQuery.isFetching && listQuery.data ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            List v1 keeps subject and snippet null while exposing bounded safe preview fields for
            final Inbox validation.
          </div>

          {listQuery.data ? (
            <p className="mt-4 text-xs text-slate-500">
              Generated {formatTime(listQuery.data.generatedAt)} · total{" "}
              {listQuery.data.pagination.total}
            </p>
          ) : null}

          <div className="mt-4 grid gap-3">
            {listQuery.isLoading ? (
              <div className="rounded-md border border-line bg-field p-4 text-sm text-slate-600">
                Loading Inbox messages...
              </div>
            ) : null}
            {listQuery.isError && !listQuery.data ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                Inbox messages are unavailable.
              </div>
            ) : null}
            {listQuery.data?.items.length === 0 ? (
              <div className="rounded-md border border-dashed border-line bg-field p-4 text-sm text-slate-600">
                No messages matched this filter.
              </div>
            ) : null}
            {listQuery.data?.items.map((item) => (
              <ListItemButton
                item={item}
                key={item.mailItemId}
                onSelect={() => setSelectedId(item.mailItemId)}
                selected={selectedId === item.mailItemId}
              />
            ))}
          </div>
        </section>

        <div className="grid content-start gap-5">
          <DetailPanel
            detail={selectedDetail}
            isError={detailQuery.isError}
            isLoading={detailQuery.isLoading}
          />

          <section
            className="rounded-lg border border-line bg-white p-5 shadow-sm"
            aria-label="Data completeness"
          >
            <h2 className="text-lg font-semibold text-ink">Data completeness</h2>
            {completeness.length ? (
              <DetailRows columns="sm:grid-cols-2 lg:grid-cols-3" rows={completeness} />
            ) : (
              <p className="mt-3 text-sm text-slate-600">
                Select a message to compute clean Gmail pilot completeness.
              </p>
            )}
          </section>

          <section
            className="rounded-lg border border-line bg-white p-5 shadow-sm"
            aria-label="Draft edit smoke form"
          >
            <h2 className="text-lg font-semibold text-ink">Draft edit smoke form</h2>
            <form className="mt-4 grid gap-4" onSubmit={handleDraftSubmit}>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Draft subject
                <input
                  className="min-h-11 rounded-md border border-line bg-field px-3 text-base outline-none focus:border-brand focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canEditDraft || draftMutation.isPending}
                  onChange={(event) => setDraftSubject(event.target.value)}
                  type="text"
                  value={draftSubject}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Draft body
                <textarea
                  className="min-h-36 rounded-md border border-line bg-field px-3 py-2 text-base outline-none focus:border-brand focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canEditDraft || draftMutation.isPending}
                  onChange={(event) => setDraftBody(event.target.value)}
                  value={draftBody}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={
                    !canEditDraft || draftMutation.isPending || draftBody.trim().length === 0
                  }
                  type="submit"
                >
                  {draftMutation.isPending ? "Saving..." : "Save draft edit"}
                </button>
                {!canEditDraft ? (
                  <span className="text-sm text-slate-600">
                    Draft edit unavailable for this message.
                  </span>
                ) : null}
              </div>
            </form>
            {draftMessage ? (
              <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                {draftMessage}
              </p>
            ) : null}
            {draftError ? (
              <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {draftError}
              </p>
            ) : null}
          </section>

          <section
            className="rounded-lg border border-line bg-white p-5 shadow-sm"
            aria-label="Gmail export smoke controls"
          >
            <h2 className="text-lg font-semibold text-ink">Gmail export smoke controls</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {canRequestExport ? (
                <button
                  className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={exportActionPending}
                  onClick={() => requestExportMutation.mutate()}
                  type="button"
                >
                  {requestExportMutation.isPending ? "Requesting..." : "Request export"}
                </button>
              ) : null}
              {canCancelExport ? (
                <button
                  className="min-h-11 rounded-md border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={exportActionPending}
                  onClick={() => cancelExportMutation.mutate()}
                  type="button"
                >
                  {cancelExportMutation.isPending ? "Cancelling..." : "Cancel export"}
                </button>
              ) : null}
              {!canRequestExport && !canCancelExport ? (
                <p className="text-sm text-slate-600">
                  No Gmail export action currently available.
                </p>
              ) : null}
            </div>
            {exportMessage ? (
              <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                {exportMessage}
              </p>
            ) : null}
            {exportError ? (
              <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {exportError}
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </section>
  );
}
