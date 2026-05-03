import type {
  DraftSendReadinessCheck,
  DraftSendReadinessCheckCode,
  DraftSendReadinessOutput,
} from "@syrantis/shared";

import {
  findDraftSendReadinessRecord,
  type DraftSendReadinessRecord,
} from "../repositories/draft-send-readiness.js";

export type DraftSendReadinessServiceResult =
  | { result: "ok"; readiness: DraftSendReadinessOutput }
  | { result: "not_found" };

export type DraftSendReadinessService = {
  computeDraftSendReadiness(
    workspaceId: string,
    draftId: string,
  ): Promise<DraftSendReadinessServiceResult>;
};

function hasText(value: string | null): boolean {
  return Boolean(value?.trim());
}

function blocker(
  code: DraftSendReadinessCheckCode,
  source: DraftSendReadinessCheck["source"],
  message: string,
  field?: string,
): DraftSendReadinessCheck {
  return {
    code,
    severity: "blocker",
    source,
    message,
    ...(field ? { field } : {}),
  };
}

function warning(
  code: DraftSendReadinessCheckCode,
  source: DraftSendReadinessCheck["source"],
  message: string,
  field?: string,
): DraftSendReadinessCheck {
  return {
    code,
    severity: "warning",
    source,
    message,
    ...(field ? { field } : {}),
  };
}

function addLatestEmailSendCheck(
  checks: DraftSendReadinessCheck[],
  record: DraftSendReadinessRecord,
) {
  switch (record.latestEmailSendStatus) {
    case "pending":
      checks.push(
        blocker(
          "EMAIL_SEND_ALREADY_PENDING",
          "email_send",
          "An email send is already pending for this draft.",
        ),
      );
      break;
    case "queued":
      checks.push(
        blocker(
          "EMAIL_SEND_ALREADY_QUEUED",
          "email_send",
          "An email send is already queued for this draft.",
        ),
      );
      break;
    case "sent":
      checks.push(
        blocker("EMAIL_ALREADY_SENT", "email_send", "An email has already been sent for this draft."),
      );
      break;
    case "failed":
      checks.push(
        warning(
          "PREVIOUS_SEND_FAILED",
          "email_send",
          "The previous email send failed; retry is allowed.",
        ),
      );
      break;
    case "cancelled":
      checks.push(
        warning(
          "PREVIOUS_SEND_CANCELLED",
          "email_send",
          "The previous email send was cancelled; retry is allowed.",
        ),
      );
      break;
    case null:
      break;
  }
}

export async function computeDraftSendReadiness(
  workspaceId: string,
  draftId: string,
): Promise<DraftSendReadinessServiceResult> {
  const record = await findDraftSendReadinessRecord({ workspaceId, draftId });

  if (!record) {
    return { result: "not_found" };
  }

  const checks: DraftSendReadinessCheck[] = [];
  const hasSubject = hasText(record.draft.subject);
  const hasTextBody = hasText(record.draft.textBody);
  const hasHtmlBody = hasText(record.draft.htmlBody);
  const hasBody = hasTextBody || hasHtmlBody;
  const hasContact = Boolean(record.contact);
  const contactHasEmail = record.draft.contactId
    ? record.contact
      ? hasText(record.contact.email)
      : null
    : null;
  const contactOptOut = record.draft.contactId
    ? record.contact
      ? record.contact.optOut
      : null
    : null;

  if (record.draft.status !== "approved") {
    checks.push(
      blocker("DRAFT_NOT_APPROVED", "draft", "Draft must be approved before send can be requested."),
    );
  }

  if (record.draft.channel !== "email") {
    checks.push(blocker("UNSUPPORTED_CHANNEL", "draft", "Only email drafts can be sent."));
  }

  if (!hasSubject) {
    checks.push(blocker("EMPTY_SUBJECT", "draft", "Subject is required before send.", "subject"));
  }

  if (!hasBody) {
    checks.push(blocker("EMPTY_BODY", "draft", "Email body is required before send.", "body"));
  }

  if (!record.draft.contactId) {
    checks.push(blocker("NO_CONTACT", "contact", "Draft must be linked to a contact before send."));
  } else if (!record.contact) {
    checks.push(blocker("INVALID_CONTACT", "contact", "Linked contact is invalid."));
  } else {
    if (!hasText(record.contact.email)) {
      checks.push(
        blocker(
          "CONTACT_NO_EMAIL",
          "contact",
          "Linked contact must have an email address before send.",
        ),
      );
    }

    if (record.contact.optOut) {
      checks.push(
        blocker("CONTACT_OPTED_OUT", "contact", "Linked contact has opted out of email send."),
      );
    }
  }

  if (!record.hasApprovedApproval) {
    checks.push(
      blocker(
        "APPROVAL_NOT_CONFIRMED",
        "approval",
        "An approved approval is required before send.",
      ),
    );
  }

  addLatestEmailSendCheck(checks, record);

  if (hasTextBody && !hasHtmlBody) {
    checks.push(warning("NO_HTML_BODY", "draft", "HTML body is missing.", "htmlBody"));
  }

  if (hasHtmlBody && !hasTextBody) {
    checks.push(warning("NO_TEXT_BODY", "draft", "Text body is missing.", "textBody"));
  }

  const blockerCount = checks.filter((check) => check.severity === "blocker").length;
  const warningCount = checks.filter((check) => check.severity === "warning").length;
  const status =
    blockerCount > 0 ? "blocked" : warningCount > 0 ? "ready_with_warnings" : "ready";

  return {
    result: "ok",
    readiness: {
      draftId: record.draft.id,
      status,
      canRequestSend: blockerCount === 0,
      blockerCount,
      warningCount,
      checks,
      context: {
        draftStatus: record.draft.status,
        channel: record.draft.channel,
        hasSubject,
        hasBody,
        hasContact,
        contactHasEmail,
        contactOptOut,
        hasApprovedApproval: record.hasApprovedApproval,
        latestEmailSendStatus: record.latestEmailSendStatus,
      },
    },
  };
}

export function createProductionDraftSendReadinessService(): DraftSendReadinessService {
  return {
    computeDraftSendReadiness,
  };
}
