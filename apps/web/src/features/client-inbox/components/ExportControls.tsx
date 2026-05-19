import { useState } from "react";

import type {
  ClientInboxActions,
  ClientInboxDraftStatus,
  ClientInboxExportStatus,
} from "../types/ui";
import { getExportStatusText, getExportStatusTone } from "../utils/formatters";
import { ClientInboxIcon } from "./ClientInboxIcon";
import { StatusBadge } from "./StatusBadge";

type ExportControlsProps = {
  actions: ClientInboxActions;
  draftStatus: ClientInboxDraftStatus;
  exportStatus: ClientInboxExportStatus;
};

export function ExportControls({ actions, draftStatus, exportStatus }: ExportControlsProps) {
  const hasDraft = draftStatus !== "no_draft";
  const [isConfirmingRequest, setIsConfirmingRequest] = useState(false);
  const canEditDraft = actions.canEditDraft ?? hasDraft;
  const canRequestGmailExport = actions.canRequestGmailExport ?? hasDraft;
  const canCancelGmailExport = actions.canCancelGmailExport ?? false;
  const isExportMutationLoading =
    actions.gmailExport?.isRequesting || actions.gmailExport?.isCancelling || false;
  const showDraftAction = hasDraft && canEditDraft && !actions.draftEdit;
  const showRequestAction = hasDraft && canRequestGmailExport;
  const showCancelAction = hasDraft && canCancelGmailExport;

  if (
    !showDraftAction &&
    !showRequestAction &&
    !showCancelAction &&
    !actions.feedbackText &&
    exportStatus === "not_requested"
  ) {
    return null;
  }

  function handleRequestClick() {
    if (!actions.gmailExport) {
      return;
    }

    setIsConfirmingRequest(true);
  }

  function handleConfirmRequest() {
    setIsConfirmingRequest(false);
    actions.gmailExport?.onRequest();
  }

  function handleCancelRequest() {
    setIsConfirmingRequest(false);
  }

  return (
    <div className="client-action-row">
      {showDraftAction ? (
        <button className="client-primary-action" type="button">
          <ClientInboxIcon name="check" />
          {actions.draftActionText}
        </button>
      ) : null}
      {showRequestAction ? (
        <button
          className="client-export-action"
          disabled={isExportMutationLoading}
          onClick={actions.gmailExport ? handleRequestClick : undefined}
          type="button"
        >
          <span aria-hidden="true" className="client-gmail-mark">
            M
          </span>
          {actions.gmailExport?.isRequesting ? "Préparation..." : actions.gmailActionText}
        </button>
      ) : null}
      {showCancelAction ? (
        <button
          className="client-export-action"
          disabled={isExportMutationLoading}
          onClick={actions.gmailExport?.onCancel}
          type="button"
        >
          <ClientInboxIcon name="clock" />
          {actions.gmailExport?.isCancelling ? "Annulation..." : "Annuler la préparation Gmail"}
        </button>
      ) : null}
      {showDraftAction || showRequestAction || showCancelAction ? (
        <button
          aria-label={actions.menuActionText}
          className="client-menu-action"
          disabled={!hasDraft || isExportMutationLoading}
          type="button"
        >
          <ClientInboxIcon name="chevronDown" />
        </button>
      ) : null}
      {exportStatus !== "not_requested" ? (
        <span className="client-action-status">
          <StatusBadge
            label={getExportStatusText(exportStatus)}
            tone={getExportStatusTone(exportStatus)}
          />
        </span>
      ) : null}
      {isConfirmingRequest ? (
        <div className="client-action-confirmation" role="dialog" aria-modal="false">
          <p>
            Le brouillon sera préparé dans Gmail. L’envoi final reste à valider manuellement dans
            Gmail.
          </p>
          <div className="client-action-confirmation-buttons">
            <button
              className="client-export-action"
              disabled={isExportMutationLoading}
              onClick={handleConfirmRequest}
              type="button"
            >
              Confirmer la préparation Gmail
            </button>
            <button
              className="client-menu-action"
              disabled={isExportMutationLoading}
              onClick={handleCancelRequest}
              type="button"
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}
      {actions.feedbackText ? (
        <p
          className={[
            "client-action-feedback",
            actions.feedbackTone === "error" ? "is-error" : "",
          ].join(" ")}
          role={actions.feedbackTone === "error" ? "alert" : "status"}
        >
          {actions.feedbackText}
        </p>
      ) : null}
    </div>
  );
}
