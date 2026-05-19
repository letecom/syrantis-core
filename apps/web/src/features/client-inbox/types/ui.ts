export type ClientInboxScoreBand = "hot" | "warm" | "cold" | "ignored";

export type ClientInboxDraftStatus = "draft_ready" | "needs_review" | "no_draft";

export type ClientInboxExportStatus = "not_requested" | "export_requested" | "exported";

export type ClientInboxBadgeTone =
  | "approval"
  | "category"
  | "cold"
  | "contact"
  | "hot"
  | "ignored"
  | "neutral"
  | "ready"
  | "warm";

export type ClientInboxAvatarTone = "amber" | "blue" | "gray" | "mint" | "red" | "violet";

export type ClientInboxContextIcon = "clock" | "draft" | "history" | "paperclip" | "shield" | "tag";

export type ClientInboxFilter = {
  label: string;
  count: number;
  active: boolean;
  onSelect?: () => void;
};

export type ClientInboxListItem = {
  id: string;
  initials: string;
  avatarTone?: ClientInboxAvatarTone;
  contactName: string;
  companyName: string;
  receivedText: string;
  subjectPreview: string;
  snippetPreview: string;
  score: number | null;
  scoreBand: ClientInboxScoreBand;
  categoryText: string;
  contactStatusText: string;
  draftStatus: ClientInboxDraftStatus;
  exportStatus: ClientInboxExportStatus;
  attentionTexts: string[];
  selected: boolean;
  onSelect?: () => void;
};

export type ClientInboxQuickContextItem = {
  label: string;
  icon: ClientInboxContextIcon;
};

export type ClientInboxAttachment = {
  name: string;
  sizeText: string;
};

export type ClientInboxAnalysis = {
  intentText: string;
  urgencyText: string;
  recommendedAction: string;
  confidence: number;
  score: number | null;
  scoreBand: ClientInboxScoreBand;
};

export type ClientInboxContactContext = {
  contactName: string;
  statusText: string;
  companyLine: string;
  relationshipSummary: string;
  actionText: string;
};

export type ClientInboxCompanyPolicyContext = {
  title: string;
  rules: string[];
  matchText: string;
};

export type ClientInboxDraft = {
  status: ClientInboxDraftStatus;
  subject: string;
  bodyText: string;
  policyMatchText: string;
};

export type ClientInboxDraftEditControls = {
  subject: string;
  bodyText: string;
  onSubjectChange: (value: string) => void;
  onBodyTextChange: (value: string) => void;
  onSave: () => void;
  isSaving: boolean;
  disabled?: boolean;
};

export type ClientInboxGmailExportControls = {
  onRequest: () => void;
  onCancel: () => void;
  isRequesting: boolean;
  isCancelling: boolean;
};

export type ClientInboxActions = {
  draftActionText: string;
  gmailActionText: string;
  menuActionText: string;
  canEditDraft?: boolean;
  canRequestGmailExport?: boolean;
  canCancelGmailExport?: boolean;
  draftEdit?: ClientInboxDraftEditControls;
  gmailExport?: ClientInboxGmailExportControls;
  feedbackText?: string | null;
  feedbackTone?: "success" | "error" | "neutral";
};

export type ClientInboxDetail = {
  subject: string;
  bodyText: string;
  fromDisplay: string;
  fromEmail: string;
  toDisplay: string;
  toEmail: string;
  receivedText: string;
  quickContext: ClientInboxQuickContextItem[];
  attachments: ClientInboxAttachment[];
  analysis: ClientInboxAnalysis;
  contactContext: ClientInboxContactContext;
  companyPolicyContext: ClientInboxCompanyPolicyContext;
  draft: ClientInboxDraft;
  actions: ClientInboxActions;
};

export type ClientInboxUser = {
  initials: string;
  name: string;
  roleText: string;
};

export type ClientInboxViewModel = {
  accountName: string;
  inboxCount: number;
  user: ClientInboxUser;
  filters: ClientInboxFilter[];
  messages: ClientInboxListItem[];
  selectedDetail: ClientInboxDetail;
};
