import { useState } from "react";
import { Link } from "react-router-dom";

import appsScriptTemplate from "../../../../docs/templates/syrantis-gmail-bridge.gs?raw";

const scriptProperties = [
  ["SYRANTIS_API_BASE", "https://api.syrantis.fr"],
  ["SYRANTIS_API_KEY", "<created from admin UI>"],
  ["INTAKE_ENABLED", "true|false"],
  ["EXPORT_ENABLED", "true|false"],
  ["SYRANTIS_SOURCE", "gmail_apps_script_client"],
  [
    "SYRANTIS_GMAIL_QUERY",
    'subject:"[SYRANTIS-E2E]" newer_than:1d -label:"Syrantis/Processed" -label:"Syrantis/Failed"',
  ],
  ["INTAKE_BATCH_LIMIT", "10"],
  ["EXPORT_BATCH_LIMIT", "5"],
] satisfies Array<[string, string]>;

export function ClientInstallPage() {
  const [copied, setCopied] = useState(false);

  async function handleCopyTemplate() {
    await navigator.clipboard.writeText(appsScriptTemplate);
    setCopied(true);
  }

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase text-accent">Client bridge</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">Client Install Pack</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Install a client-owned Google Apps Script that can intake selected Gmail messages and
          export requested Syrantis drafts as Gmail drafts.
        </p>
      </div>

      <div className="grid gap-5">
        <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Installation Guide</h2>
          <ol className="mt-4 grid gap-3 text-sm text-slate-700">
            <li>
              1. Open{" "}
              <Link className="font-semibold text-brand underline" to="/app/api-keys">
                API Keys
              </Link>{" "}
              and create a dedicated workspace API key for the client bridge.
            </li>
            <li>
              2. Create a Google Sheet with the Intake Log template if intake validation is needed.
            </li>
            <li>3. In Google Apps Script, paste the template below and save the project.</li>
            <li>
              4. Add the Script Properties exactly as shown, storing the API key only in Script
              Properties.
            </li>
            <li>
              5. Run <span className="font-mono">setupSyrantisLabels</span> once, then run{" "}
              <span className="font-mono">runSyrantisGmailBridge</span> manually or from a time
              trigger.
            </li>
          </ol>
        </section>

        <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink">Required Script Properties</h2>
          <div className="mt-4 overflow-x-auto rounded-md border border-line">
            <table className="min-w-full divide-y divide-line text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-3">Key</th>
                  <th className="px-4 py-3">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {scriptProperties.map(([key, value]) => (
                  <tr key={key}>
                    <td className="px-4 py-3 font-mono text-slate-800">{key}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Apps Script Template</h2>
            <button
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              onClick={handleCopyTemplate}
              type="button"
            >
              {copied ? "Copied" : "Copy template"}
            </button>
          </div>
          <pre className="mt-4 max-h-[38rem] overflow-auto rounded-md border border-line bg-slate-950 p-4 text-xs leading-5 text-slate-100">
            <code>{appsScriptTemplate}</code>
          </pre>
        </section>
      </div>
    </section>
  );
}
