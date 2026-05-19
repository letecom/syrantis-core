import type {
  ClientInboxBadgeTone,
  ClientInboxDraftStatus,
  ClientInboxExportStatus,
  ClientInboxScoreBand,
} from "../types/ui";

const scoreBandText: Record<ClientInboxScoreBand, string> = {
  hot: "Chaud",
  warm: "Tiède",
  cold: "Froid",
  ignored: "Ignoré",
};

const draftStatusText: Record<ClientInboxDraftStatus, string> = {
  draft_ready: "Brouillon prêt",
  needs_review: "À vérifier",
  no_draft: "Aucun brouillon",
};

const draftStatusTones: Record<ClientInboxDraftStatus, ClientInboxBadgeTone> = {
  draft_ready: "ready",
  needs_review: "approval",
  no_draft: "neutral",
};

const exportStatusText: Record<ClientInboxExportStatus, string> = {
  not_requested: "À préparer",
  export_requested: "Préparation Gmail demandée",
  exported: "Préparé dans Gmail",
};

const exportStatusTones: Record<ClientInboxExportStatus, ClientInboxBadgeTone> = {
  not_requested: "neutral",
  export_requested: "ready",
  exported: "contact",
};

export function formatScoreText(score: number | null, scoreBand: ClientInboxScoreBand) {
  if (scoreBand === "ignored" || score === null) {
    return scoreBandText.ignored;
  }

  return `${scoreBandText[scoreBand]} ${score}`;
}

export function getDraftStatusText(status: ClientInboxDraftStatus) {
  return draftStatusText[status];
}

export function getDraftStatusTone(status: ClientInboxDraftStatus) {
  return draftStatusTones[status];
}

export function getExportStatusText(status: ClientInboxExportStatus) {
  return exportStatusText[status];
}

export function getExportStatusTone(status: ClientInboxExportStatus) {
  return exportStatusTones[status];
}
