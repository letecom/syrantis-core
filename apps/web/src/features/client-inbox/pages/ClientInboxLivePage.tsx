import "../../../styles/client-design-tokens.css";

import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";

import type { CurrentUser } from "../../../lib/api-client";
import { AnalysisPanel } from "../components/AnalysisPanel";
import { ClientInboxSidebar } from "../components/ClientInboxSidebar";
import { ClientInboxTopbar } from "../components/ClientInboxTopbar";
import { CompanyPolicyContext } from "../components/CompanyPolicyContext";
import { ContactContext } from "../components/ContactContext";
import { DraftPanel } from "../components/DraftPanel";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { InboxFilterPills } from "../components/InboxFilterPills";
import { LoadingState } from "../components/LoadingState";
import { MessageDetail } from "../components/MessageDetail";
import { MessageList } from "../components/MessageList";
import { useDraftMutation } from "../hooks/useDraftMutation";
import { useExportCancelMutation, useExportRequestMutation } from "../hooks/useExportMutation";
import { useInboxDetail } from "../hooks/useInboxDetail";
import { useInboxList } from "../hooks/useInboxList";
import type { ClientInboxLiveTab } from "../types/api";
import type { ClientInboxActions } from "../types/ui";
import {
  mapCurrentUserToClientInboxUser,
  mapDetailExportStatus,
  mapDetailToUi,
  mapListDataToFilters,
  mapListDataToMessages,
} from "../utils/mapApiToUi";

type ActionFeedback = {
  text: string;
  tone: "success" | "error";
};

const listLimit = 20;
const listSort = "newest";
const accountName = "Syrantis Client";

export function ClientInboxLivePage() {
  const currentUser = useOutletContext<CurrentUser>();
  const [activeTab, setActiveTab] = useState<ClientInboxLiveTab>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);

  const listQuery = useInboxList({
    tab: activeTab,
    sort: listSort,
    limit: listLimit,
  });
  const detailQuery = useInboxDetail(selectedId);
  const draftMutation = useDraftMutation();
  const requestExportMutation = useExportRequestMutation();
  const cancelExportMutation = useExportCancelMutation();

  useEffect(() => {
    if (!listQuery.data) {
      return;
    }

    const firstItem = listQuery.data.items[0];

    if (!firstItem) {
      setSelectedId(null);
      return;
    }

    const selectedStillVisible = listQuery.data.items.some(
      (item) => item.mailItemId === selectedId,
    );

    if (!selectedStillVisible) {
      setSelectedId(firstItem.mailItemId);
    }
  }, [listQuery.data, selectedId]);

  useEffect(() => {
    if (!detailQuery.data) {
      setDraftSubject("");
      setDraftBody("");
      return;
    }

    setDraftSubject(detailQuery.data.draft.subject ?? "");
    setDraftBody(detailQuery.data.draft.bodyText ?? "");
  }, [
    detailQuery.data?.draft.bodyText,
    detailQuery.data?.draft.subject,
    detailQuery.data?.mail.mailItemId,
  ]);

  useEffect(() => {
    setFeedback(null);
  }, [detailQuery.data?.mail.mailItemId]);

  function handleSelectMessage(mailItemId: string) {
    setSelectedId(mailItemId);
    setFeedback(null);
  }

  function handleSelectTab(tab: ClientInboxLiveTab) {
    setActiveTab(tab);
    setFeedback(null);
  }

  async function handleSaveDraft() {
    if (!selectedId) {
      return;
    }

    setFeedback(null);

    try {
      await draftMutation.mutateAsync({
        mailItemId: selectedId,
        subject: draftSubject,
        bodyText: draftBody,
      });
      setFeedback({ text: "Brouillon enregistré.", tone: "success" });
    } catch {
      setFeedback({ text: "Impossible d'enregistrer le brouillon.", tone: "error" });
    }
  }

  async function handleRequestGmailExport() {
    if (!selectedId) {
      return;
    }

    setFeedback(null);

    try {
      await requestExportMutation.mutateAsync(selectedId);
      setFeedback({ text: "Préparation Gmail demandée.", tone: "success" });
    } catch {
      setFeedback({ text: "Impossible de demander la préparation Gmail.", tone: "error" });
    }
  }

  async function handleCancelGmailExport() {
    if (!selectedId) {
      return;
    }

    setFeedback(null);

    try {
      await cancelExportMutation.mutateAsync(selectedId);
      setFeedback({ text: "Préparation Gmail annulée.", tone: "success" });
    } catch {
      setFeedback({ text: "Impossible d'annuler la préparation Gmail.", tone: "error" });
    }
  }

  const selectedItem = useMemo(
    () => listQuery.data?.items.find((item) => item.mailItemId === selectedId),
    [listQuery.data?.items, selectedId],
  );

  const filters = useMemo(
    () =>
      mapListDataToFilters({
        data: listQuery.data,
        activeTab,
        onSelectTab: handleSelectTab,
      }),
    [activeTab, listQuery.data],
  );

  const messages = useMemo(
    () =>
      mapListDataToMessages({
        data: listQuery.data,
        selectedId,
        onSelectMessage: handleSelectMessage,
      }),
    [listQuery.data, selectedId],
  );

  const detailActions: ClientInboxActions | null = detailQuery.data
    ? {
        draftActionText: "Enregistrer le brouillon",
        gmailActionText: "Préparer dans Gmail",
        menuActionText: "Options du brouillon",
        canEditDraft: detailQuery.data.actions.canEditDraft,
        canRequestGmailExport: detailQuery.data.actions.canRequestGmailExport,
        canCancelGmailExport: detailQuery.data.actions.canCancelGmailExport,
        ...(detailQuery.data.actions.canEditDraft
          ? {
              draftEdit: {
                subject: draftSubject,
                bodyText: draftBody,
                onSubjectChange: setDraftSubject,
                onBodyTextChange: setDraftBody,
                onSave: handleSaveDraft,
                isSaving: draftMutation.isPending,
              },
            }
          : {}),
        gmailExport: {
          onRequest: handleRequestGmailExport,
          onCancel: handleCancelGmailExport,
          isRequesting: requestExportMutation.isPending,
          isCancelling: cancelExportMutation.isPending,
        },
        ...(feedback
          ? {
              feedbackText: feedback.text,
              feedbackTone: feedback.tone,
            }
          : {}),
      }
    : null;

  const detail =
    detailQuery.data && detailActions
      ? mapDetailToUi(detailQuery.data, selectedItem, detailActions)
      : null;
  const user = mapCurrentUserToClientInboxUser(currentUser);
  const inboxCount = listQuery.data?.pagination.total ?? messages.length;

  return (
    <div className="client-inbox-preview">
      <div className="client-app-shell">
        <ClientInboxSidebar
          accountName={accountName}
          inboxCount={inboxCount}
          showSecondaryNav={false}
          user={user}
        />
        <main className="client-app-main">
          <ClientInboxTopbar accountName={accountName} />
          <InboxFilterPills filters={filters} />
          <div className="client-inbox-grid">
            {renderListPanel(listQuery.isLoading, listQuery.isError, messages)}
            {renderDetailPanel({
              detail,
              hasSelectedMessage: Boolean(selectedId),
              isListError: listQuery.isError,
              isListLoading: listQuery.isLoading,
              isLoading: detailQuery.isLoading || detailQuery.isFetching,
              isError: detailQuery.isError,
            })}
            {renderContextPanel({
              detail,
              exportStatus: detailQuery.data
                ? mapDetailExportStatus(detailQuery.data)
                : "not_requested",
              isListError: listQuery.isError,
              isListLoading: listQuery.isLoading,
              isDetailLoading: detailQuery.isLoading || detailQuery.isFetching,
              isDetailError: detailQuery.isError,
            })}
          </div>
        </main>
      </div>
    </div>
  );
}

function renderListPanel(
  isLoading: boolean,
  isError: boolean,
  messages: ReturnType<typeof mapListDataToMessages>,
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
  detail: ReturnType<typeof mapDetailToUi> | null;
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
  detail: ReturnType<typeof mapDetailToUi> | null;
  exportStatus: ReturnType<typeof mapDetailExportStatus>;
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
