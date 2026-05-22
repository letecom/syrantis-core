import type {
  ClientInboxDetail,
  ClientInboxExportStatus,
  ClientInboxFilter,
  ClientInboxListItem,
} from "../types/ui";
import { ClientInboxIcon } from "./ClientInboxIcon";
import { InboxFilterPills } from "./InboxFilterPills";
import { InboxPanels } from "./InboxPanels";

type InboxWorkAreaProps = {
  detail: ClientInboxDetail | null;
  exportStatus: ClientInboxExportStatus;
  filters: ClientInboxFilter[];
  hasSelectedMessage: boolean;
  isDetailError: boolean;
  isDetailLoading: boolean;
  isListError: boolean;
  isListLoading: boolean;
  messages: ClientInboxListItem[];
};

export function InboxWorkArea({
  detail,
  exportStatus,
  filters,
  hasSelectedMessage,
  isDetailError,
  isDetailLoading,
  isListError,
  isListLoading,
  messages,
}: InboxWorkAreaProps) {
  return (
    <section className="client-inbox-work-area" data-testid="client-inbox-work-area">
      <header className="client-topbar client-work-area-topbar">
        <div>
          <h1 className="client-page-title">Boîte de réception</h1>
          <p className="client-page-subtitle">Messages et demandes priorisés par l'IA</p>
        </div>

        <label className="client-search">
          <ClientInboxIcon className="muted" name="search" />
          <input
            aria-label="Rechercher des messages"
            placeholder="Rechercher messages, contacts, entreprises..."
            readOnly
            value=""
          />
          <span className="client-keycap">K</span>
        </label>
      </header>

      <InboxFilterPills filters={filters} />
      <InboxPanels
        detail={detail}
        exportStatus={exportStatus}
        hasSelectedMessage={hasSelectedMessage}
        isDetailError={isDetailError}
        isDetailLoading={isDetailLoading}
        isListError={isListError}
        isListLoading={isListLoading}
        messages={messages}
      />
    </section>
  );
}
