import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ApiRequestError,
  ApiUnauthorizedError,
  getGoogleSheetsSetupStatus,
  testGoogleSheetsSetup,
  type GoogleSheetsSetupStatus,
  type GoogleSheetsSetupTestResponse,
} from "../lib/api-client";

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

function setupTestErrorMessage(error: unknown) {
  if (error instanceof ApiUnauthorizedError) {
    return "Test failed (401).";
  }

  if (error instanceof ApiRequestError && error.status) {
    return `Test failed (${error.status}).`;
  }

  return "Test failed.";
}

function statusRows(status: GoogleSheetsSetupStatus) {
  return [
    ["Pushback enabled", status.enabled],
    ["Credentials configured", status.credentialsConfigured],
    ["Spreadsheet configured", status.spreadsheetConfigured],
    ["Masked spreadsheet ID", status.spreadsheetIdMasked],
    ["Pushback range configured", status.pushbackRangeConfigured],
    ["Verification range configured", status.verificationRangeConfigured],
    ["Last test", status.lastTest ? status.lastTest.result : null],
    ["Last diagnostic trace ID", status.lastTest?.diagnosticTraceId],
    ["Last error code", status.lastTest?.errorCode],
    ["Last tested at", formatTime(status.lastTest?.testedAt)],
  ] satisfies Array<[string, string | number | boolean | null | undefined]>;
}

function StatusCard({ status }: { status: GoogleSheetsSetupStatus }) {
  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-sm" aria-label="Status">
      <h2 className="text-lg font-semibold text-ink">Status</h2>
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
    </section>
  );
}

function TestResult({ result }: { result: GoogleSheetsSetupTestResponse }) {
  return (
    <div
      className="mt-4 rounded-md border border-line bg-field p-4 text-sm text-slate-800"
      aria-label="Test result"
    >
      <p>
        Result: <span className="font-semibold">{result.result}</span>
      </p>
      <p className="mt-1">
        Diagnostic trace ID: <span className="font-semibold">{result.diagnosticTraceId}</span>
      </p>
      {result.errorCode ? (
        <p className="mt-1">
          Error code: <span className="font-semibold">{result.errorCode}</span>
        </p>
      ) : null}
      {result.errorSummary ? <p className="mt-1">{result.errorSummary}</p> : null}
      {result.verification ? (
        <p className="mt-1">
          Verification: {result.verification.rowsAppended} row appended to{" "}
          <span className="font-semibold">{result.verification.rangeTested}</span>
        </p>
      ) : null}
    </div>
  );
}

function ActionCard() {
  const queryClient = useQueryClient();
  const [testResult, setTestResult] = useState<GoogleSheetsSetupTestResponse | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const testInFlightRef = useRef(false);

  const testMutation = useMutation({
    mutationFn: testGoogleSheetsSetup,
    onSuccess: async (response) => {
      setTestResult(response);
      setTestError(null);
      await queryClient.invalidateQueries({ queryKey: ["google-sheets-setup-status"] });
    },
    onError: (error) => {
      setTestResult(null);
      setTestError(setupTestErrorMessage(error));
    },
    onSettled: () => {
      testInFlightRef.current = false;
    },
  });

  function handleTestConnection() {
    if (testInFlightRef.current || testMutation.isPending) {
      return;
    }

    testInFlightRef.current = true;
    testMutation.mutate();
  }

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-sm" aria-label="Action">
      <h2 className="text-lg font-semibold text-ink">Action</h2>
      <button
        className="mt-4 min-h-11 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={testMutation.isPending}
        onClick={handleTestConnection}
        type="button"
      >
        {testMutation.isPending ? "Testing..." : "Test connection"}
      </button>
      {testMutation.isPending ? (
        <p className="mt-3 text-sm text-slate-600" role="status">
          Testing Google Sheets connection...
        </p>
      ) : null}
      {testResult ? <TestResult result={testResult} /> : null}
      {testError ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {testError}
        </p>
      ) : null}
    </section>
  );
}

function HelpCard() {
  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-sm" aria-label="Help">
      <h2 className="text-lg font-semibold text-ink">Help</h2>
      <div className="mt-3 space-y-2 text-sm text-slate-700">
        <p>Configuration is currently managed by server environment variables.</p>
        <p>This screen verifies the active production configuration.</p>
      </div>
    </section>
  );
}

export function GoogleSheetsPage() {
  const statusQuery = useQuery({
    queryKey: ["google-sheets-setup-status"],
    queryFn: getGoogleSheetsSetupStatus,
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Google Sheets Setup</h1>
      </div>

      {statusQuery.isLoading ? (
        <p className="rounded-lg border border-line bg-white p-5 text-sm text-slate-600 shadow-sm">
          Loading Google Sheets setup status...
        </p>
      ) : null}

      {statusQuery.isError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          Google Sheets setup status unavailable.
        </p>
      ) : null}

      {statusQuery.data ? (
        <div className="grid gap-5">
          <StatusCard status={statusQuery.data} />
          <ActionCard />
          <HelpCard />
        </div>
      ) : null}
    </div>
  );
}
