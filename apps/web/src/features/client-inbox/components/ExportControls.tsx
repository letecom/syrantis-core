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

  return (
    <div className="client-action-row">
      <button className="client-primary-action" disabled={!hasDraft} type="button">
        <ClientInboxIcon name="check" />
        {actions.draftActionText}
      </button>
      <button className="client-export-action" disabled={!hasDraft} type="button">
        <span aria-hidden="true" className="client-gmail-mark">
          M
        </span>
        {actions.gmailActionText}
      </button>
      <button
        aria-label={actions.menuActionText}
        className="client-menu-action"
        disabled={!hasDraft}
        type="button"
      >
        <ClientInboxIcon name="chevronDown" />
      </button>
      {exportStatus !== "not_requested" ? (
        <span className="client-action-status">
          <StatusBadge label={getExportStatusText(exportStatus)} tone={getExportStatusTone(exportStatus)} />
        </span>
      ) : null}
    </div>
  );
}
