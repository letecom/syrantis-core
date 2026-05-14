import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, type QueryObserverResult } from "@tanstack/react-query";
import { z } from "zod";

import {
  ApiRequestError,
  ApiUnauthorizedError,
  cancelDraftGmailExport,
  getDraftGmailExportStatus,
  requestDraftGmailExport,
  type GmailExportStatusResponse,
} from "../lib/api-client";

const uuidSchema = z.string().uuid("Enter a valid draft UUID.");

const requestBlockingReasons = new Set([
  "draft_not_ready",
  "missing_subject",
  "missing_body",
  "missing_lead",
  "missing_contact",
  "missing_email",
  "invalid_email",
  "active_lease",
  "already_exported",
  "has_email_sends",
  "export_in_progress",
]);

function formatValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "None";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
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

function statusBadgeClass(value: string) {
  if (value === "requested" || value === "not_exported" || value === "present") {
    return "bg-teal-50 text-brand";
  }

  if (value === "exported") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (value === "active" || value === "leased") {
    return "bg-amber-50 text-amber-800";
  }

  if (value === "cancelled" || value.includes("missing") || value === "invalid_email") {
    return "bg-red-50 text-red-700";
  }

  return "bg-slate-100 text-slate-700";
}

function actionErrorMessage(action: "Request" | "Cancel", error: unknown) {
  if (error instanceof ApiUnauthorizedError) {
    return `${action} failed (401).`;
  }

  if (error instanceof ApiRequestError && error.status) {
    return `${action} failed (${error.status}).`;
  }

  return `${action} failed.`;
}

function statusRows(status: GmailExportStatusResponse) {
  return [
    ["Draft ID", status.draftId],
    ["Lead ID", status.leadId],
    ["Draft status", status.draftStatus],
    ["Has subject", status.hasSubject],
    ["Has body text", status.hasBodyText],
    ["Recipient status", status.recipientStatus],
    ["Request status", status.requestStatus],
    ["Requested at", formatTime(status.requestedAt)],
    ["Request expires at", formatTime(status.requestExpiresAt)],
    ["Request source", status.requestSource],
    ["Export status", status.exportStatus],
    ["Export source", status.exportSource],
    ["Exported at", formatTime(status.exportedAt)],
    ["Lease status", status.leaseStatus],
    ["Lease expires at", formatTime(status.leaseExpiresAt)],
    ["Can export", status.canExport],
    [
      "Blocking reasons",
      status.blockingReasons.length ? status.blockingReasons.join(", ") : "None",
    ],
    ["Email sends count", status.sideEffects.emailSendsCount],
    ["Approvals count", status.sideEffects.approvalsCount],
  ] satisfies Array<[string, string | number | boolean | null | undefined]>;
}

function canRequestExport(status: GmailExportStatusResponse) {
  if (
    status.exportStatus === "exported" ||
    status.leaseStatus === "active" ||
    status.requestStatus === "requested" ||
    status.requestStatus === "leased" ||
    status.requestStatus === "exported"
  ) {
    return false;
  }

  return !status.blockingReasons.some((reason) => requestBlockingReasons.has(reason));
}

function canCancelExport(status: GmailExportStatusResponse) {
  return (
    status.requestStatus === "requested" &&
    status.leaseStatus === "none" &&
    status.exportStatus !== "exported"
  );
}

function GmailExportActions({
  status,
  onSettled,
}: {
  status: GmailExportStatusResponse;
  onSettled: () => Promise<QueryObserverResult<GmailExportStatusResponse, Error>>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const actionInFlightRef = useRef(false);
  const requestEnabled = canRequestExport(status);
  const cancelVisible = status.requestStatus === "requested" || status.requestStatus === "leased";
  const cancelEnabled = canCancelExport(status);

  const requestMutation = useMutation({
    mutationFn: () => requestDraftGmailExport(status.draftId),
    onSuccess: async (response) => {
      setErrorMessage(null);
      setMessage(`Export request ${response.requestStatus}.`);
      await onSettled();
    },
    onError: async (error) => {
      setMessage(null);
      setErrorMessage(actionErrorMessage("Request", error));
      await onSettled();
    },
    onSettled: () => {
      actionInFlightRef.current = false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelDraftGmailExport(status.draftId),
    onSuccess: async () => {
      setErrorMessage(null);
      setMessage("Export request cancelled.");
      await onSettled();
    },
    onError: async (error) => {
      setMessage(null);
      setErrorMessage(actionErrorMessage("Cancel", error));
      await onSettled();
    },
    onSettled: () => {
      actionInFlightRef.current = false;
    },
  });

  function handleRequest() {
    if (actionInFlightRef.current || requestMutation.isPending || !requestEnabled) {
      return;
    }

    actionInFlightRef.current = true;
    requestMutation.mutate();
  }

  function handleCancel() {
    if (actionInFlightRef.current || cancelMutation.isPending || !cancelEnabled) {
      return;
    }

    actionInFlightRef.current = true;
    cancelMutation.mutate();
  }

  const anyPending = requestMutation.isPending || cancelMutation.isPending;

  return (
    <div className="mt-5 border-t border-line pt-5" aria-label="Gmail export actions">
      <h3 className="text-sm font-semibold text-slate-700">Admin action</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {status.exportStatus !== "exported" &&
        status.requestStatus !== "requested" &&
        status.requestStatus !== "leased" ? (
          <button
            className="min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!requestEnabled || anyPending}
            onClick={handleRequest}
            type="button"
          >
            {requestMutation.isPending ? "Requesting..." : "Request Export"}
          </button>
        ) : null}
        {cancelVisible ? (
          <button
            className="min-h-11 rounded-md border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!cancelEnabled || anyPending}
            onClick={handleCancel}
            type="button"
          >
            {cancelMutation.isPending ? "Cancelling..." : "Cancel Export"}
          </button>
        ) : null}
      </div>

      {!requestEnabled &&
      status.exportStatus !== "exported" &&
      status.requestStatus !== "requested" &&
      status.requestStatus !== "leased" ? (
        <p className="mt-2 text-sm text-slate-600">Export request unavailable for this status.</p>
      ) : null}
      {cancelVisible && !cancelEnabled ? (
        <p className="mt-2 text-sm text-slate-600">Cancel unavailable after the draft is leased.</p>
      ) : null}
      {message ? (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function GmailExportStatusPanel({
  status,
  onSettled,
}: {
  status: GmailExportStatusResponse;
  onSettled: () => Promise<QueryObserverResult<GmailExportStatusResponse, Error>>;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-sm" aria-label="Status">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-ink">Gmail export status</h2>
        <span
          className={[
            "inline-flex rounded-md px-2 py-1 text-xs font-semibold",
            statusBadgeClass(status.requestStatus),
          ].join(" ")}
        >
          {status.requestStatus}
        </span>
        <span
          className={[
            "inline-flex rounded-md px-2 py-1 text-xs font-semibold",
            statusBadgeClass(status.exportStatus),
          ].join(" ")}
        >
          {status.exportStatus}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 md:grid-cols-2">
        {statusRows(status).map(([label, value]) => (
          <div className="rounded-md border border-line bg-field p-3" key={label}>
            <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
            <dd className="mt-1 break-words text-sm font-medium text-slate-800">
              {formatValue(value)}
            </dd>
          </div>
        ))}
      </dl>
      <GmailExportActions status={status} onSettled={onSettled} />
    </section>
  );
}

export function GmailExportOpsPage() {
  const [draftId, setDraftId] = useState("");
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["gmail-export-status", submittedId],
    queryFn: () => {
      if (!submittedId) {
        throw new Error("Missing draft ID.");
      }

      return getDraftGmailExportStatus(submittedId);
    },
    enabled: submittedId !== null,
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedId = uuidSchema.safeParse(draftId.trim());

    if (!parsedId.success) {
      setValidationError(parsedId.error.issues[0]?.message ?? "Enter a valid draft UUID.");
      setSubmittedId(null);
      return;
    }

    setValidationError(null);
    setSubmittedId(parsedId.data);
  }

  return (
    <section className="max-w-5xl">
      <p className="text-sm font-semibold uppercase text-accent">Draft bridge ops</p>
      <h1 className="mt-2 text-3xl font-semibold text-ink">Gmail Export</h1>
      <form
        className="mt-6 grid gap-4 rounded-lg border border-line bg-white p-5 shadow-sm"
        onSubmit={handleSubmit}
      >
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Draft ID
          <input
            className="min-h-11 rounded-md border border-line bg-field px-3 text-base outline-none focus:border-brand focus:bg-white"
            onChange={(event) => setDraftId(event.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            type="text"
            value={draftId}
          />
          {validationError ? (
            <span className="text-sm font-normal text-red-700">{validationError}</span>
          ) : null}
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className="min-h-11 w-fit rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={statusQuery.isFetching}
            type="submit"
          >
            {statusQuery.isFetching && !statusQuery.data ? "Loading..." : "Load Status"}
          </button>
          <button
            className="min-h-11 w-fit rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-field disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!submittedId || statusQuery.isFetching}
            onClick={() => statusQuery.refetch()}
            type="button"
          >
            {statusQuery.isFetching && statusQuery.data ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </form>

      <div className="mt-6">
        {!submittedId ? (
          <div className="rounded-lg border border-dashed border-line bg-white p-5 text-sm text-slate-600">
            Enter a draft ID to view export status.
          </div>
        ) : null}
        {statusQuery.isLoading ? (
          <div className="rounded-lg border border-line bg-white p-5 text-sm text-slate-600">
            Loading Gmail export status...
          </div>
        ) : null}
        {statusQuery.isError && !statusQuery.data ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            Gmail export status is unavailable for that draft.
          </div>
        ) : null}
        {statusQuery.data ? (
          <GmailExportStatusPanel
            status={statusQuery.data}
            onSettled={() => statusQuery.refetch()}
          />
        ) : null}
      </div>
    </section>
  );
}
