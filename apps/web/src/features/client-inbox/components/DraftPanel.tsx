import type { ClientInboxActions, ClientInboxDraft, ClientInboxExportStatus } from "../types/ui";
import { getDraftStatusText, getDraftStatusTone } from "../utils/formatters";
import { ClientInboxIcon } from "./ClientInboxIcon";
import { ExportControls } from "./ExportControls";
import { StatusBadge } from "./StatusBadge";

type DraftPanelProps = {
  actions: ClientInboxActions;
  draft: ClientInboxDraft;
  exportStatus: ClientInboxExportStatus;
};

export function DraftPanel({ actions, draft, exportStatus }: DraftPanelProps) {
  return (
    <section className="client-ai-card" aria-label="Brouillon IA">
      <div className="client-card-header">
        <h2 className="client-card-title">
          <ClientInboxIcon className="violet" name="spark" />
          Brouillon IA
        </h2>
        <StatusBadge label={getDraftStatusText(draft.status)} tone={getDraftStatusTone(draft.status)} />
      </div>
      <div className="client-card-body">
        <div className="client-draft-box">
          {draft.status === "no_draft" ? (
            <p className="client-draft-text">Aucun brouillon disponible pour ce message.</p>
          ) : (
            <>
              <p className="client-draft-text">
                <strong>{draft.subject}</strong>
              </p>
              {splitParagraphs(draft.bodyText).map((paragraph) => (
                <p className="client-draft-text" key={paragraph}>
                  {paragraph}
                </p>
              ))}
              <p className="client-policy-match">
                <ClientInboxIcon className="xsmall" name="check" />
                {draft.policyMatchText}
              </p>
            </>
          )}
          <ClientInboxIcon className="small muted" name="chevronDown" />
        </div>
      </div>
      <ExportControls actions={actions} draftStatus={draft.status} exportStatus={exportStatus} />
    </section>
  );
}

function splitParagraphs(bodyText: string) {
  return bodyText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
