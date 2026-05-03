import type {
  DraftAiAuditWarning,
  DraftApprovalReadinessCheck,
  DraftApprovalReadinessCheckCode,
  DraftApprovalReadinessOutput,
} from "@syrantis/shared";

import {
  findDraftApprovalReadinessRecord,
  type DraftApprovalReadinessRecord,
} from "../repositories/draft-approval-readiness.js";
import {
  createProductionDraftAiAuditService,
  type DraftAiAuditService,
} from "./draft-ai-audit.js";

export type DraftApprovalReadinessServiceResult =
  | { result: "ok"; readiness: DraftApprovalReadinessOutput }
  | { result: "not_found" };

export type DraftApprovalReadinessService = {
  computeDraftApprovalReadiness(
    workspaceId: string,
    draftId: string,
  ): Promise<DraftApprovalReadinessServiceResult>;
};

const aiWarningMessages: Record<DraftAiAuditWarning, string> = {
  AI_RUN_NOT_FOUND: "AI audit run was not found; approval can continue with warning.",
  AI_RUN_INVALID: "AI audit metadata references an invalid AI run; approval can continue with warning.",
  SOURCE_SCORE_NOT_FOUND: "Source score was not found; approval can continue with warning.",
  AI_DRAFT_METADATA_INVALID: "AI draft metadata is invalid; approval can continue with warning.",
  AI_RUN_FINISH_REASON_WARNING:
    "AI run finish reason indicates the draft may need extra review.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasText(value: string | null): boolean {
  return Boolean(value?.trim());
}

function isAiGenerated(record: DraftApprovalReadinessRecord): boolean {
  return (
    isRecord(record.draft.metadataJson) &&
    record.draft.metadataJson.origin === "ai_draft_generation"
  );
}

function blocker(
  code: DraftApprovalReadinessCheckCode,
  source: DraftApprovalReadinessCheck["source"],
  message: string,
  field?: string,
): DraftApprovalReadinessCheck {
  return {
    code,
    severity: "blocker",
    source,
    message,
    ...(field ? { field } : {}),
  };
}

function warning(
  code: DraftApprovalReadinessCheckCode,
  source: DraftApprovalReadinessCheck["source"],
  message: string,
): DraftApprovalReadinessCheck {
  return {
    code,
    severity: "warning",
    source,
    message,
  };
}

async function computeAiAuditChecks(
  workspaceId: string,
  draftId: string,
  aiAuditService: DraftAiAuditService,
): Promise<DraftApprovalReadinessCheck[]> {
  const auditResult = await aiAuditService.getDraftAiAudit(workspaceId, draftId);

  if (auditResult.result !== "ok" || !auditResult.audit) {
    return [];
  }

  return auditResult.audit.warnings.map((code) =>
    warning(code, "ai_audit", aiWarningMessages[code]),
  );
}

export async function computeDraftApprovalReadiness(
  workspaceId: string,
  draftId: string,
  aiAuditService: DraftAiAuditService = createProductionDraftAiAuditService(),
): Promise<DraftApprovalReadinessServiceResult> {
  const record = await findDraftApprovalReadinessRecord({ workspaceId, draftId });

  if (!record) {
    return { result: "not_found" };
  }

  const checks: DraftApprovalReadinessCheck[] = [];
  const hasLead = Boolean(record.lead);
  const hasSubject = hasText(record.draft.subject);
  const hasBody = hasText(record.draft.textBody) || hasText(record.draft.htmlBody);
  const hasContact = Boolean(record.contact);
  const contactHasEmail = record.draft.contactId
    ? record.contact
      ? hasText(record.contact.email)
      : null
    : null;
  const aiGenerated = isAiGenerated(record);

  if (record.draft.status !== "draft") {
    checks.push(
      blocker(
        "DRAFT_NOT_IN_DRAFT_STATE",
        "draft",
        "Draft must be in draft status to request approval.",
      ),
    );
  }

  if (record.draft.channel !== "email") {
    checks.push(
      blocker("UNSUPPORTED_CHANNEL", "draft", "Only email drafts can be submitted for approval."),
    );
  }

  if (!record.draft.leadId || !record.lead) {
    checks.push(
      blocker("MISSING_LEAD", "lead", "Draft must be linked to a lead before approval."),
    );
  }

  if (!hasSubject) {
    checks.push(
      blocker("EMPTY_SUBJECT", "draft", "Subject is required before approval.", "subject"),
    );
  }

  if (!hasBody) {
    checks.push(
      blocker("EMPTY_BODY", "draft", "Email body is required before approval.", "body"),
    );
  }

  if (record.draft.contactId && !record.contact) {
    checks.push(blocker("INVALID_CONTACT", "contact", "Linked contact is invalid."));
  }

  if (record.hasPendingApproval) {
    checks.push(
      blocker(
        "APPROVAL_ALREADY_PENDING",
        "approval",
        "An approval is already pending for this draft.",
      ),
    );
  }

  if (!record.draft.contactId) {
    checks.push(
      warning(
        "NO_CONTACT_RECIPIENT",
        "contact",
        "No contact is linked. Sending will require a recipient later.",
      ),
    );
  } else if (record.contact && !hasText(record.contact.email)) {
    checks.push(warning("CONTACT_NO_EMAIL", "contact", "Linked contact has no email address."));
  }

  if (aiGenerated) {
    checks.push(...(await computeAiAuditChecks(workspaceId, draftId, aiAuditService)));
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
      canRequestApproval: blockerCount === 0,
      blockerCount,
      warningCount,
      checks,
      context: {
        draftStatus: record.draft.status,
        channel: record.draft.channel,
        hasLead,
        hasSubject,
        hasBody,
        hasContact,
        contactHasEmail,
        isAIGenerated: aiGenerated,
      },
    },
  };
}

export function createProductionDraftApprovalReadinessService(): DraftApprovalReadinessService {
  return {
    computeDraftApprovalReadiness,
  };
}
