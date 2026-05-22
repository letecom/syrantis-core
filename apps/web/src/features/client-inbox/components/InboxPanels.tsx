import type {
  ClientInboxDetail,
  ClientInboxExportStatus,
  ClientInboxListItem,
} from "../types/ui";
import { AnalysisPanel } from "./AnalysisPanel";
import { CompanyPolicyContext } from "./CompanyPolicyContext";
import { ContactContext } from "./ContactContext";
import { DraftPanel } from "./DraftPanel";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";
import { MessageDetail } from "./MessageDetail";
import { MessageList } from "./MessageList";

export type InboxPanelsProps = {
  detail: ClientInboxDetail | null;
  exportStatus: ClientInboxExportStatus;
  hasSelectedMessage: boolean;
  isDetailError: boolean;
  isDetailLoading: boolean;
  isListError: boolean;
  isListLoading: boolean;
  messages: ClientInboxListItem[];
};

export function InboxPanels({
  detail,
  exportStatus,
  hasSelectedMessage,
  isDetailError,
  isDetailLoading,
  isListError,
  isListLoading,
  messages,
}: InboxPanelsProps) {
  return (
    <div className="client-inbox-grid">
      {renderListPanel(isListLoading, isListError, messages)}
      {renderDetailPanel({
        detail,
        hasSelectedMessage,
        isListError,
        isListLoading,
        isLoading: isDetailLoading,
        isError: isDetailError,
      })}
      {renderContextPanel({
        detail,
        exportStatus,
        isListError,
        isListLoading,
        isDetailLoading,
        isDetailError,
      })}
    </div>
  );
}

function renderListPanel(
  isLoading: boolean,
  isError: boolean,
  messages: ClientInboxListItem[],
) {
  if (isLoading) {
    return (
      <section className="client-message-list" aria-label="Messages priorisés">
        <LoadingState />
      </section>
    );
  }

  if (isError) {
    return (
      <section className="client-message-list" aria-label="Messages priorisés">
        <ErrorState message="Impossible de charger les messages." />
      </section>
    );
  }

  return <MessageList messages={messages} />;
}

function renderDetailPanel(input: {
  detail: ClientInboxDetail | null;
  hasSelectedMessage: boolean;
  isListError: boolean;
  isListLoading: boolean;
  isLoading: boolean;
  isError: boolean;
}) {
  if (input.isListLoading) {
    return <LoadingState message="Préparation du message..." />;
  }

  if (input.isListError) {
    return <ErrorState message="Sélection indisponible." />;
  }

  if (!input.hasSelectedMessage) {
    return <EmptyState title="Aucun message" message="Aucun message à ouvrir pour ce filtre." />;
  }

  if (input.isLoading) {
    return <LoadingState message="Chargement du message..." />;
  }

  if (input.isError || !input.detail) {
    return <ErrorState message="Impossible de charger le message sélectionné." />;
  }

  return <MessageDetail detail={input.detail} />;
}

function renderContextPanel(input: {
  detail: ClientInboxDetail | null;
  exportStatus: ClientInboxExportStatus;
  isListError: boolean;
  isListLoading: boolean;
  isDetailLoading: boolean;
  isDetailError: boolean;
}) {
  if (input.isListLoading || input.isDetailLoading) {
    return (
      <aside className="client-ai-panel" aria-label="Analyse et brouillon">
        <LoadingState message="Chargement de l'analyse..." />
      </aside>
    );
  }

  if (input.isListError || input.isDetailError || !input.detail) {
    return (
      <aside className="client-ai-panel" aria-label="Analyse et brouillon">
        <ErrorState message="Le contexte du message est indisponible." />
      </aside>
    );
  }

  return (
    <aside className="client-ai-panel" aria-label="Analyse et brouillon">
      <AnalysisPanel analysis={input.detail.analysis} />
      <ContactContext contactContext={input.detail.contactContext} />
      <CompanyPolicyContext companyPolicyContext={input.detail.companyPolicyContext} />
      <DraftPanel
        actions={input.detail.actions}
        draft={input.detail.draft}
        exportStatus={input.exportStatus}
      />
    </aside>
  );
}
