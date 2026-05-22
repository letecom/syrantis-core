import type { ClientInboxViewModel } from "../types/ui";
import { ClientInboxSidebar } from "./ClientInboxSidebar";
import { ClientInboxTopbar } from "./ClientInboxTopbar";
import { InboxFilterPills } from "./InboxFilterPills";
import { InboxPanels } from "./InboxPanels";

type InboxLayoutProps = {
  inbox: ClientInboxViewModel;
};

export function InboxLayout({ inbox }: InboxLayoutProps) {
  return (
    <div className="client-inbox-preview" data-testid="client-inbox-preview-shell">
      <div className="client-app-shell">
        <ClientInboxSidebar
          accountName={inbox.accountName}
          inboxCount={inbox.inboxCount}
          user={inbox.user}
        />
        <main className="client-app-main">
          <ClientInboxTopbar accountName={inbox.accountName} />
          <InboxFilterPills filters={inbox.filters} />
          <InboxPanels
            detail={inbox.selectedDetail}
            exportStatus={getSelectedExportStatus(inbox)}
            hasSelectedMessage={true}
            isDetailError={false}
            isDetailLoading={false}
            isListError={false}
            isListLoading={false}
            messages={inbox.messages}
          />
        </main>
      </div>
    </div>
  );
}

function getSelectedExportStatus(inbox: ClientInboxViewModel) {
  return inbox.messages.find((message) => message.selected)?.exportStatus ?? "not_requested";
}
