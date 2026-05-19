import type { CurrentUser } from "../../../lib/api-client";
import type {
  ClientInboxActions,
  ClientInboxAttachment,
  ClientInboxAvatarTone,
  ClientInboxCompanyPolicyContext,
  ClientInboxContactContext,
  ClientInboxDetail,
  ClientInboxDraft,
  ClientInboxDraftStatus,
  ClientInboxExportStatus,
  ClientInboxFilter,
  ClientInboxListItem,
  ClientInboxScoreBand,
  ClientInboxUser,
} from "../types/ui";
import type {
  ClientInboxLiveDetail,
  ClientInboxLiveListData,
  ClientInboxLiveListItem,
  ClientInboxLiveTab,
} from "../types/api";

const tabText: Record<ClientInboxLiveTab, string> = {
  all: "Tous",
  needs_review: "À revoir",
  hot: "Chaud",
  ready_draft: "Brouillon prêt",
  ignored: "Ignorés",
};

const categoryTextByKey: Record<string, string> = {
  quote_request: "Demande de devis",
  urgent_service: "Urgence",
  follow_up: "Relance",
  newsletter: "Newsletter",
  system: "Système",
  unknown: "À qualifier",
};

const contactStatusTextByKey: Record<string, string> = {
  new_contact: "Nouveau contact",
  existing_contact: "Contact connu",
  returning: "Contact récurrent",
  unknown: "Contact à qualifier",
};

const urgencyTextByKey: Record<string, string> = {
  high: "Urgence élevée",
  medium: "Urgence moyenne",
  low: "Urgence faible",
};

const attentionTextByKey: Record<string, string> = {
  high_score: "Score élevé",
  urgent_action: "Action urgente",
  missing_info: "Infos manquantes",
  needs_review: "À revoir",
};

const filterTabs: ClientInboxLiveTab[] = ["all", "needs_review", "hot", "ready_draft", "ignored"];

export function mapCurrentUserToClientInboxUser(user: CurrentUser): ClientInboxUser {
  const displayName = user.name?.trim() || user.email;

  return {
    initials: initialsFromText(displayName),
    name: displayName,
    roleText: "Espace client interne",
  };
}

export function mapListDataToFilters(input: {
  data: ClientInboxLiveListData | undefined;
  activeTab: ClientInboxLiveTab;
  onSelectTab: (tab: ClientInboxLiveTab) => void;
}): ClientInboxFilter[] {
  const items = input.data?.items ?? [];

  return filterTabs.map((tab) => ({
    label: tabText[tab],
    count: countTab(tab, items, input.data?.pagination.total ?? items.length),
    active: tab === input.activeTab,
    onSelect: () => input.onSelectTab(tab),
  }));
}

export function mapListDataToMessages(input: {
  data: ClientInboxLiveListData | undefined;
  selectedId: string | null;
  onSelectMessage: (mailItemId: string) => void;
}): ClientInboxListItem[] {
  return (input.data?.items ?? []).map((item, index) => mapListItem(item, input, index));
}

export function mapDetailToUi(
  detail: ClientInboxLiveDetail,
  selectedItem: ClientInboxLiveListItem | undefined,
  actions: ClientInboxActions,
): ClientInboxDetail {
  const companyName =
    detail.companyPolicyContext.companyName?.trim() || selectedItem?.companyDisplay;
  const senderDisplay = detail.mail.fromDisplay?.trim() || selectedItem?.senderDisplay?.trim();
  const toDisplay = detail.mail.toDisplay?.trim() || "Destinataire";

  return {
    subject: safeText(detail.mail.subject, "Sujet indisponible"),
    bodyText: safeText(detail.mail.bodyText, "Corps du message indisponible."),
    fromDisplay: senderDisplay || "Contact",
    fromEmail: safeText(detail.mail.fromEmail, "Email indisponible"),
    toDisplay,
    toEmail: safeText(detail.mail.toEmail, "Email indisponible"),
    receivedText: formatReceived(detail.mail.receivedAt),
    quickContext: [
      {
        label: categoryTextByKey[detail.analysis.category] ?? "À qualifier",
        icon: "tag",
      },
      {
        label: contactStatusTextByKey[detail.contactContext.contactStatus] ?? "Contact à qualifier",
        icon: "history",
      },
      {
        label: `${detail.contactContext.previousThreadCount} échange(s) précédent(s)`,
        icon: "clock",
      },
    ],
    attachments: mapAttachments(detail.mail.attachments),
    analysis: {
      intentText: formatIntent(detail.analysis.intent, detail.analysis.category),
      urgencyText: formatUrgency(detail.analysis.urgency),
      recommendedAction: safeText(detail.analysis.recommendedAction, "À vérifier manuellement."),
      confidence: detail.analysis.confidence ?? 0,
      score: detail.analysis.score,
      scoreBand: mapScoreBand(detail.analysis.scoreBand),
    },
    contactContext: mapContactContext(detail, companyName),
    companyPolicyContext: mapCompanyPolicyContext(detail, companyName),
    draft: mapDraft(detail),
    actions,
  };
}

export function mapDetailExportStatus(detail: ClientInboxLiveDetail): ClientInboxExportStatus {
  return mapExportStatus(detail.gmailExport.status, undefined);
}

function mapListItem(
  item: ClientInboxLiveListItem,
  input: {
    selectedId: string | null;
    onSelectMessage: (mailItemId: string) => void;
  },
  index: number,
): ClientInboxListItem {
  const senderDisplay = item.senderDisplay?.trim() || "Contact à qualifier";
  const companyDisplay = item.companyDisplay?.trim() || "Entreprise à qualifier";

  return {
    id: item.mailItemId,
    initials: initialsFromText(senderDisplay),
    avatarTone: avatarTone(index, item),
    contactName: senderDisplay,
    companyName: companyDisplay,
    receivedText: formatReceived(item.receivedAt),
    subjectPreview: safeText(item.subjectPreview, "Sujet indisponible"),
    snippetPreview: safeText(item.snippetPreview, "Aperçu indisponible."),
    score: item.score,
    scoreBand: mapScoreBand(item.scoreBand, item.pipelineState),
    categoryText: categoryTextByKey[item.category] ?? "À qualifier",
    contactStatusText: contactStatusTextByKey[item.contactStatus] ?? "Contact à qualifier",
    draftStatus: mapDraftStatus(item),
    exportStatus: mapExportStatus(item.gmailExportStatus, item.pipelineState),
    attentionTexts: item.attentionFlags.map(formatAttentionFlag),
    selected: item.mailItemId === input.selectedId,
    onSelect: () => input.onSelectMessage(item.mailItemId),
  };
}

function mapDraft(detail: ClientInboxLiveDetail): ClientInboxDraft {
  const hasDraft = Boolean(detail.draft.draftId || detail.draft.subject || detail.draft.bodyText);

  if (!hasDraft) {
    return {
      status: "no_draft",
      subject: "",
      bodyText: "",
      policyMatchText: "Aucun brouillon disponible.",
    };
  }

  return {
    status: detail.actions.canEditDraft ? "draft_ready" : "needs_review",
    subject: safeText(detail.draft.subject, "Objet à compléter"),
    bodyText: safeText(detail.draft.bodyText, "Corps du brouillon à compléter."),
    policyMatchText:
      detail.draft.policyMatchScore === null
        ? "Règles entreprise à vérifier."
        : `Alignement politique ${detail.draft.policyMatchScore} %`,
  };
}

function mapContactContext(
  detail: ClientInboxLiveDetail,
  companyName: string | null | undefined,
): ClientInboxContactContext {
  const previousLeadText =
    detail.contactContext.previousLeadCount === 0
      ? "Aucun lead précédent"
      : `${detail.contactContext.previousLeadCount} lead(s) précédent(s)`;

  return {
    contactName: detail.mail.fromDisplay?.trim() || "Contact à qualifier",
    statusText: detail.contactContext.contactKnown ? "Contact connu" : "Nouveau contact",
    companyLine: companyName?.trim() || "Entreprise à qualifier",
    relationshipSummary: `${previousLeadText}, ${detail.contactContext.previousThreadCount} échange(s) email.`,
    actionText: detail.contactContext.lastOutboundAt
      ? `Dernière réponse: ${formatReceived(detail.contactContext.lastOutboundAt)}`
      : "Aucune réponse sortante récente.",
  };
}

function mapCompanyPolicyContext(
  detail: ClientInboxLiveDetail,
  companyName: string | null | undefined,
): ClientInboxCompanyPolicyContext {
  const rules = [
    ...detail.companyPolicyContext.keyRulesMatched.map((rule) => `Règle: ${rule}`),
    ...detail.companyPolicyContext.missingInfo.map((info) => `À demander: ${info}`),
    ...detail.companyPolicyContext.forbiddenClaims.map((claim) => `À éviter: ${claim}`),
  ];

  return {
    title: companyName?.trim() || "Règles entreprise",
    rules: rules.length ? rules : ["Aucune règle spécifique détectée."],
    matchText: detail.companyPolicyContext.tone
      ? `Ton ${detail.companyPolicyContext.tone}`
      : "Ton à valider",
  };
}

function mapAttachments(
  attachments: ClientInboxLiveDetail["mail"]["attachments"],
): ClientInboxAttachment[] {
  return attachments.map((attachment, index) => ({
    name: attachment.filename?.trim() || `Pièce jointe ${index + 1}`,
    sizeText:
      attachment.sizeBytes === null
        ? "Taille inconnue"
        : `${Math.max(1, Math.round(attachment.sizeBytes / 1024))} Ko`,
  }));
}

function countTab(
  tab: ClientInboxLiveTab,
  items: ClientInboxLiveListItem[],
  total: number,
): number {
  if (tab === "all") {
    return total;
  }

  return items.filter((item) => matchesTab(tab, item)).length;
}

function matchesTab(tab: ClientInboxLiveTab, item: ClientInboxLiveListItem) {
  if (tab === "needs_review") {
    return item.needsReview;
  }

  if (tab === "hot") {
    return item.scoreBand === "hot";
  }

  if (tab === "ready_draft") {
    return item.pipelineState === "draft_ready" || item.draftStatus === "ready";
  }

  if (tab === "ignored") {
    return item.pipelineState === "ignored";
  }

  return true;
}

function mapDraftStatus(item: ClientInboxLiveListItem): ClientInboxDraftStatus {
  if (item.draftStatus === "no_draft") {
    return "no_draft";
  }

  if (item.needsReview || item.draftStatus === "blocked") {
    return "needs_review";
  }

  return "draft_ready";
}

function mapExportStatus(
  status: string,
  pipelineState: string | undefined,
): ClientInboxExportStatus {
  if (status === "exported" || pipelineState === "exported") {
    return "exported";
  }

  if (status === "requested" || status === "leased" || pipelineState === "export_requested") {
    return "export_requested";
  }

  return "not_requested";
}

function mapScoreBand(scoreBand: string, pipelineState?: string): ClientInboxScoreBand {
  if (pipelineState === "ignored") {
    return "ignored";
  }

  if (scoreBand === "hot" || scoreBand === "warm" || scoreBand === "cold") {
    return scoreBand;
  }

  return "cold";
}

function avatarTone(index: number, item: ClientInboxLiveListItem): ClientInboxAvatarTone {
  if (item.pipelineState === "ignored") {
    return "gray";
  }

  if (item.scoreBand === "hot") {
    return "red";
  }

  const tones: ClientInboxAvatarTone[] = ["blue", "mint", "violet", "amber"];
  return tones[index % tones.length] ?? "blue";
}

function formatAttentionFlag(flag: string) {
  return attentionTextByKey[flag] ?? flag.replaceAll("_", " ");
}

function formatIntent(intent: string | null, category: string) {
  if (intent) {
    return intent.replaceAll("_", " ");
  }

  return categoryTextByKey[category] ?? "À qualifier";
}

function formatUrgency(urgency: string | null) {
  if (!urgency) {
    return "Urgence non qualifiée";
  }

  return urgencyTextByKey[urgency] ?? urgency.replaceAll("_", " ");
}

function formatReceived(value: string | null) {
  if (!value) {
    return "Date inconnue";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Date inconnue";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function safeText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function initialsFromText(value: string) {
  const initials = value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "C";
}
