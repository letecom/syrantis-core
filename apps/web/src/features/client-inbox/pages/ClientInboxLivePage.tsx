import "../../../styles/client-design-tokens.css";

import { useEffect, useMemo, useState } from "react";

import { InboxWorkArea } from "../components/InboxWorkArea";
import { useDraftMutation } from "../hooks/useDraftMutation";
import { useExportCancelMutation, useExportRequestMutation } from "../hooks/useExportMutation";
import { useInboxDetail } from "../hooks/useInboxDetail";
import { useInboxList } from "../hooks/useInboxList";
import type { ClientInboxLiveTab } from "../types/api";
import type { ClientInboxActions } from "../types/ui";
import {
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

export function ClientInboxLivePage() {
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

  return (
    <InboxWorkArea
      detail={detail}
      exportStatus={detailQuery.data ? mapDetailExportStatus(detailQuery.data) : "not_requested"}
      filters={filters}
      hasSelectedMessage={Boolean(selectedId)}
      isDetailError={detailQuery.isError}
      isDetailLoading={detailQuery.isLoading || detailQuery.isFetching}
      isListError={listQuery.isError}
      isListLoading={listQuery.isLoading}
      messages={messages}
    />
  );
}
