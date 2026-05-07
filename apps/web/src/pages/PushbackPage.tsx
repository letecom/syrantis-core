import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PushbackStatusResponse } from "@syrantis/shared";
import { z } from "zod";

import { getDraftPushbackStatus, getEmailSendPushbackStatus } from "../lib/api-client";

type LookupType = "emailSendId" | "draftId";
type SubmittedLookup = {
  type: LookupType;
  id: string;
};

const uuidSchema = z.string().uuid("Enter a valid UUID.");

const lookupOptions: Array<{ value: LookupType; label: string }> = [
  { value: "emailSendId", label: "Email send ID" },
  { value: "draftId", label: "Draft ID" }
];

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

function statusRows(result: PushbackStatusResponse) {
  const targetId =
    result.target.type === "email_send" ? result.target.emailSendId : result.target.draftId;

  return [
    ["Target type", result.target.type],
    ["Target ID", targetId],
    ["Send status", result.send.status],
    ["Delivery status", result.send.deliveryStatus],
    ["Pushback status", result.pushback.status],
    ["Latest source", result.pushback.latestSource],
    ["Latest event type", result.pushback.latestEventType],
    ["Can replay", result.pushback.canReplay],
    ["Replay eligibility", result.pushback.canReplayReason ?? "eligible"],
    ["Diagnostic trace ID", result.pushback.diagnostic?.diagnosticTraceId],
    ["Error code", result.pushback.diagnostic?.errorCode],
    ["Error summary", result.pushback.diagnostic?.errorSummary],
    ["Total pushback events", result.pushback.counts.totalPushbackEvents],
    ["Manual replay count", result.pushback.counts.manualReplayEvents],
    ["Requested at", formatTime(result.send.requestedAt)],
    ["Sent at", formatTime(result.send.sentAt)],
    ["Updated at", formatTime(result.send.updatedAt)],
    ["Latest at", formatTime(result.pushback.latestAt)]
  ] satisfies Array<[string, string | number | boolean | null | undefined]>;
}

function ResultCard({ result }: { result: PushbackStatusResponse }) {
  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-sm" aria-label="Result">
      <h3 className="text-lg font-semibold text-ink">Pushback status</h3>
      <dl className="mt-4 grid gap-3 md:grid-cols-2">
        {statusRows(result).map(([label, value]) => (
          <div className="rounded-md border border-line bg-field p-3" key={label}>
            <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
            <dd className="mt-1 break-words text-sm font-medium text-slate-800">
              {formatValue(value)}
            </dd>
          </div>
        ))}
      </dl>
      {result.pushback.recentHistory.length > 0 ? (
        <div className="mt-5">
          <h4 className="text-sm font-semibold text-slate-700">Recent history</h4>
          <ul className="mt-2 grid gap-2">
            {result.pushback.recentHistory.map((event) => (
              <li
                className="rounded-md border border-line bg-white px-3 py-2 text-sm text-slate-700"
                key={`${event.eventType}-${event.occurredAt}-${event.diagnosticTraceId ?? "none"}`}
              >
                <span className="font-medium">{event.eventType}</span>
                <span className="text-slate-500"> from {event.source}</span>
                <span className="text-slate-500"> at {formatTime(event.occurredAt)}</span>
                {event.errorCode ? <span className="text-slate-500"> ({event.errorCode})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function PushbackPage() {
  const [lookupType, setLookupType] = useState<LookupType>("emailSendId");
  const [id, setId] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedLookup | null>(null);

  const pushbackQuery = useQuery({
    queryKey: ["pushback-status", submitted?.type, submitted?.id],
    queryFn: () => {
      if (!submitted) {
        throw new Error("Missing lookup.");
      }

      return submitted.type === "emailSendId"
        ? getEmailSendPushbackStatus(submitted.id)
        : getDraftPushbackStatus(submitted.id);
    },
    enabled: submitted !== null
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedId = uuidSchema.safeParse(id.trim());

    if (!parsedId.success) {
      setValidationError(parsedId.error.issues[0]?.message ?? "Enter a valid UUID.");
      setSubmitted(null);
      return;
    }

    setValidationError(null);
    setSubmitted({ type: lookupType, id: parsedId.data });
  }

  return (
    <section className="max-w-5xl">
      <p className="text-sm font-semibold uppercase text-accent">Read-only status</p>
      <h2 className="mt-2 text-3xl font-semibold text-ink">Pushback lookup</h2>
      <form className="mt-6 grid gap-4 rounded-lg border border-line bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
        <fieldset>
          <legend className="text-sm font-semibold text-slate-700">Lookup type</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {lookupOptions.map((option) => (
              <label
                className={[
                  "cursor-pointer rounded-md border px-3 py-2 text-sm font-medium",
                  lookupType === option.value
                    ? "border-brand bg-teal-50 text-brand"
                    : "border-line bg-white text-slate-700"
                ].join(" ")}
                key={option.value}
              >
                <input
                  checked={lookupType === option.value}
                  className="sr-only"
                  name="lookupType"
                  onChange={() => setLookupType(option.value)}
                  type="radio"
                  value={option.value}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          UUID
          <input
            className="min-h-11 rounded-md border border-line bg-field px-3 text-base outline-none focus:border-brand focus:bg-white"
            onChange={(event) => setId(event.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            type="text"
            value={id}
          />
          {validationError ? (
            <span className="text-sm font-normal text-red-700">{validationError}</span>
          ) : null}
        </label>
        <button
          className="min-h-11 w-fit rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pushbackQuery.isFetching}
          type="submit"
        >
          {pushbackQuery.isFetching ? "Looking up..." : "Look up status"}
        </button>
      </form>
      <div className="mt-6">
        {!submitted ? (
          <div className="rounded-lg border border-dashed border-line bg-white p-5 text-sm text-slate-600">
            Choose a lookup type and enter a UUID to view pushback status.
          </div>
        ) : null}
        {pushbackQuery.isLoading ? (
          <div className="rounded-lg border border-line bg-white p-5 text-sm text-slate-600">
            Loading pushback status...
          </div>
        ) : null}
        {pushbackQuery.isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            Pushback status is unavailable for that identifier.
          </div>
        ) : null}
        {pushbackQuery.data ? <ResultCard result={pushbackQuery.data} /> : null}
      </div>
    </section>
  );
}
