import type { FormEvent } from "react";

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
  const draftEdit = actions.canEditDraft ? actions.draftEdit : undefined;

  function handleDraftSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    draftEdit?.onSave();
  }

  return (
    <section className="client-ai-card" aria-label="Brouillon IA">
      <div className="client-card-header">
        <h2 className="client-card-title">
          <ClientInboxIcon className="violet" name="spark" />
          Brouillon IA
        </h2>
        <StatusBadge
          label={getDraftStatusText(draft.status)}
          tone={getDraftStatusTone(draft.status)}
        />
      </div>
      <div className="client-card-body">
        <div className="client-draft-box">
          {draft.status === "no_draft" ? (
            <p className="client-draft-text">Aucun brouillon disponible pour ce message.</p>
          ) : draftEdit ? (
            <form className="client-draft-edit-form" onSubmit={handleDraftSubmit}>
              <label className="client-draft-field">
                <span>Objet du brouillon</span>
                <input
                  aria-label="Objet du brouillon"
                  disabled={draftEdit.isSaving || draftEdit.disabled}
                  onChange={(event) => draftEdit.onSubjectChange(event.target.value)}
                  value={draftEdit.subject}
                />
              </label>
              <label className="client-draft-field">
                <span>Corps du brouillon</span>
                <textarea
                  aria-label="Corps du brouillon"
                  disabled={draftEdit.isSaving || draftEdit.disabled}
                  onChange={(event) => draftEdit.onBodyTextChange(event.target.value)}
                  rows={8}
                  value={draftEdit.bodyText}
                />
              </label>
              <p className="client-policy-match">
                <ClientInboxIcon className="xsmall" name="check" />
                {draft.policyMatchText}
              </p>
              <button
                className="client-primary-action"
                disabled={
                  draftEdit.isSaving || draftEdit.disabled || draftEdit.bodyText.trim().length === 0
                }
                type="submit"
              >
                <ClientInboxIcon name="check" />
                {draftEdit.isSaving ? "Enregistrement..." : actions.draftActionText}
              </button>
            </form>
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
          {draftEdit ? null : <ClientInboxIcon className="small muted" name="chevronDown" />}
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
