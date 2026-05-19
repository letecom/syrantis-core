import type { ClientInboxViewModel } from "../types/ui";
import { AnalysisPanel } from "./AnalysisPanel";
import { ClientInboxSidebar } from "./ClientInboxSidebar";
import { ClientInboxTopbar } from "./ClientInboxTopbar";
import { CompanyPolicyContext } from "./CompanyPolicyContext";
import { ContactContext } from "./ContactContext";
import { DraftPanel } from "./DraftPanel";
import { InboxFilterPills } from "./InboxFilterPills";
import { MessageDetail } from "./MessageDetail";
import { MessageList } from "./MessageList";

type InboxLayoutProps = {
  inbox: ClientInboxViewModel;
};

export function InboxLayout({ inbox }: InboxLayoutProps) {
  return (
    <div className="client-inbox-preview">
      <div className="client-app-shell">
        <ClientInboxSidebar
          accountName={inbox.accountName}
          inboxCount={inbox.inboxCount}
          user={inbox.user}
        />
        <main className="client-app-main">
          <ClientInboxTopbar accountName={inbox.accountName} />
          <InboxFilterPills filters={inbox.filters} />
          <div className="client-inbox-grid">
            <MessageList messages={inbox.messages} />
            <MessageDetail detail={inbox.selectedDetail} />
            <aside className="client-ai-panel" aria-label="Analyse et brouillon">
              <AnalysisPanel analysis={inbox.selectedDetail.analysis} />
              <ContactContext contactContext={inbox.selectedDetail.contactContext} />
              <CompanyPolicyContext
                companyPolicyContext={inbox.selectedDetail.companyPolicyContext}
              />
              <DraftPanel
                actions={inbox.selectedDetail.actions}
                draft={inbox.selectedDetail.draft}
                exportStatus={getSelectedExportStatus(inbox)}
              />
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

function getSelectedExportStatus(inbox: ClientInboxViewModel) {
  return inbox.messages.find((message) => message.selected)?.exportStatus ?? "not_requested";
}
