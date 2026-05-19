import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "./test-utils";

const currentUser = {
  success: true,
  data: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin@example.com",
    name: "Admin User",
    role: "admin",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    workspaceName: "Hidden tenant",
  },
};

const pushbackStatus = {
  success: true,
  data: {
    target: {
      type: "email_send",
      draftId: null,
      emailSendId: "33333333-3333-4333-8333-333333333333",
      resolvedFromDraft: false,
    },
    send: {
      exists: true,
      status: "sent",
      deliveryStatus: "delivered",
      deliveryProofAvailable: true,
      requestedAt: "2026-05-06T10:00:00.000Z",
      sentAt: "2026-05-06T10:01:00.000Z",
      updatedAt: "2026-05-06T10:02:00.000Z",
    },
    pushback: {
      status: "succeeded",
      latestEventType: "crm_pushback.succeeded",
      latestSource: "manual_replay",
      latestAt: "2026-05-06T10:03:00.000Z",
      canReplay: true,
      canReplayReason: null,
      replay: {
        emailSendId: "33333333-3333-4333-8333-333333333333",
        endpoint: "/api/email-sends/33333333-3333-4333-8333-333333333333/pushback-replay",
      },
      diagnostic: {
        diagnosticTraceId: "55555555-5555-4555-8555-555555555555",
        errorCode: "PUSHBACK_RATE_LIMITED",
        errorSummary: "Pushback was rate limited.",
        durationMs: 42,
        maskedSpreadsheetId: "sheet...1234",
        range: "Hidden!A:Q",
      },
      counts: {
        totalPushbackEvents: 2,
        manualReplayEvents: 1,
      },
      recentHistory: [
        {
          eventType: "crm_pushback.succeeded",
          source: "manual_replay",
          occurredAt: "2026-05-06T10:03:00.000Z",
          diagnosticTraceId: "55555555-5555-4555-8555-555555555555",
          errorCode: null,
        },
      ],
      provider_message_id: "forbidden-provider",
      providerMessageId: "forbidden-provider-camel",
      metadata_json: { hidden: true },
      payload_json: { hidden: true },
      rawGoogle: "forbidden-google",
      rawProvider: "forbidden-provider-payload",
      rawError: "forbidden-provider-error",
      subject: "forbidden-subject",
      htmlBody: "forbidden-html",
      textBody: "forbidden-text",
      contactEmail: "hidden@example.com",
      leadLabel: "forbidden-lead-label",
      recipient: "hidden-recipient@example.com",
    },
    workspaceId: "hidden-workspace-id",
    workspace_id: "hidden_workspace_id",
  },
};

const emailSendId = "33333333-3333-4333-8333-333333333333";
const replayUrl = `/api/email-sends/${emailSendId}/pushback-replay`;
const statusUrl = `/api/email-sends/${emailSendId}/pushback-status`;
const googleSheetsStatusUrl = "/api/integrations/google-sheets/setup-status";
const googleSheetsTestUrl = "/api/integrations/google-sheets/setup-test";
const workspaceApiKeysUrl = "/api/workspace-api-keys";
const workspaceApiKeyRevokeUrl =
  "/api/workspace-api-keys/12121212-1212-4121-8121-121212121212/revoke";
const opsHealthUrl = "/api/admin/ops/health";
const opsRecentUrl = "/api/admin/ops/checks/recent?limit=20";
const opsDbHealthUrl = "/api/admin/ops/checks/db-health";
const opsGoogleSheetsTestUrl = "/api/admin/ops/checks/google-sheets-test";
const opsWorkerFailedUrl = "/api/admin/ops/checks/worker-failed-summary";
const gmailExportDraftId = "44444444-4444-4444-8444-444444444444";
const gmailExportStatusUrl = `/api/drafts/${gmailExportDraftId}/gmail-export-status`;
const gmailExportRequestUrl = `/api/drafts/${gmailExportDraftId}/gmail-export-request`;
const gmailExportCancelUrl = `/api/drafts/${gmailExportDraftId}/gmail-export-cancel`;
const clientCockpitSummaryUrl = "/api/client/cockpit-summary";
const draftQueueUrl = "/api/client/draft-queue?limit=20";
const draftQueueHotUrl = "/api/client/draft-queue?limit=20&scoreBand=hot";
const draftQueueAttentionUrl = "/api/client/draft-queue?limit=20&attentionRequired=true";
const draftQueueDraftId = "abababab-abab-4aba-8aba-abababababab";
const draftQueueDetailUrl = `/api/client/draft-queue/${draftQueueDraftId}`;
const mailQueueUrl = "/api/client/mail-queue?limit=20&includeIgnored=false";
const mailQueueIncludeIgnoredUrl = "/api/client/mail-queue?limit=20&includeIgnored=true";
const mailQueueCategoryUrl =
  "/api/client/mail-queue?limit=20&includeIgnored=false&category=service";
const mailQueueClassificationId = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
const mailQueueDetailUrl = `/api/client/mail-queue/${mailQueueClassificationId}`;
const responsePolicyUrl = "/api/client/response-policy";
const clientInboxMailItemId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const clientInboxDraftId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const clientInboxLeadId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const clientInboxMessagesUrl = "/api/client/inbox/messages?tab=all&sort=newest&limit=20";
const clientInboxDetailUrl = `/api/client/inbox/messages/${clientInboxMailItemId}`;
const clientInboxDraftUrl = `/api/client/inbox/messages/${clientInboxMailItemId}/draft`;
const clientInboxExportRequestUrl = `/api/client/inbox/messages/${clientInboxMailItemId}/gmail-export-request`;
const clientInboxExportCancelUrl = `/api/client/inbox/messages/${clientInboxMailItemId}/gmail-export-cancel`;

const replayResponse = {
  success: true,
  data: {
    emailSendId,
    result: "succeeded",
    diagnosticTraceId: "66666666-6666-4666-8666-666666666666",
    providerMessageId: "forbidden-replay-provider",
    workspaceId: "forbidden-replay-workspace",
  },
};

function gmailExportStatusFixture(
  overrides: Partial<{
    requestStatus: string;
    exportStatus: string;
    leaseStatus: string;
    canExport: boolean;
    blockingReasons: string[];
    requestedAt: string | null;
    requestExpiresAt: string | null;
    leaseExpiresAt: string | null;
    exportedAt: string | null;
  }> = {},
) {
  return {
    success: true,
    data: {
      draftId: gmailExportDraftId,
      leadId: "55555555-5555-4555-8555-555555555555",
      draftStatus: "draft",
      hasSubject: true,
      hasBodyText: true,
      recipientStatus: "present",
      requestStatus: overrides.requestStatus ?? "not_requested",
      requestedAt: overrides.requestedAt ?? null,
      requestExpiresAt: overrides.requestExpiresAt ?? null,
      requestSource: overrides.requestedAt ? "admin_api" : null,
      exportStatus: overrides.exportStatus ?? "not_exported",
      exportSource: overrides.exportedAt ? "apps_script" : null,
      exportedAt: overrides.exportedAt ?? null,
      leaseStatus: overrides.leaseStatus ?? "none",
      leaseExpiresAt: overrides.leaseExpiresAt ?? null,
      canExport: overrides.canExport ?? false,
      blockingReasons: overrides.blockingReasons ?? ["export_not_requested"],
      sideEffects: {
        emailSendsCount: 0,
        approvalsCount: 0,
      },
      toEmail: "forbidden-to-email@example.com",
      bodyText: "forbidden-body-text",
      htmlBody: "forbidden-html-body",
      contactName: "forbidden-contact-name",
      contactId: "forbidden-contact-id",
      workspaceId: "forbidden-workspace-id",
      metadata_json: { hidden: true },
      gmailExport: { hidden: true },
      leaseToken: "forbidden-lease-token",
      providerMessageId: "forbidden-provider-message-id",
      prompt: "forbidden-prompt",
      output: "forbidden-output",
    },
  };
}

const gmailExportRequestResponse = {
  success: true,
  data: {
    draftId: gmailExportDraftId,
    leadId: "55555555-5555-4555-8555-555555555555",
    requestStatus: "requested",
    requestedAt: "2026-05-14T10:00:00.000Z",
    requestExpiresAt: "2026-05-15T10:00:00.000Z",
    canExport: true,
    workspaceId: "forbidden-request-workspace",
    leaseToken: "forbidden-request-lease-token",
  },
};

const gmailExportCancelResponse = {
  success: true,
  data: {
    draftId: gmailExportDraftId,
    leadId: "55555555-5555-4555-8555-555555555555",
    requestStatus: "cancelled",
    cancelledAt: "2026-05-14T10:05:00.000Z",
    workspaceId: "forbidden-cancel-workspace",
    leaseToken: "forbidden-cancel-lease-token",
  },
};

const clientCockpitSummary = {
  success: true,
  data: {
    generatedAt: "2026-05-14T12:00:00.000Z",
    window: {
      since: "2026-05-13T12:00:00.000Z",
      hours: 24,
    },
    pipeline: {
      leads24h: 7,
      scoredLeads24h: 5,
      draftsGenerated24h: 4,
      pendingDrafts: 3,
    },
    gmailExport: {
      status: "requested",
      pendingRequestCount: 2,
      activeLeaseCount: 1,
      staleLeaseCount: 0,
      exported24h: 6,
      lastExportedAt: "2026-05-14T11:30:00.000Z",
    },
    gmailIntake: {
      status: "activity_seen",
      lastIntakeAt: "2026-05-14T11:00:00.000Z",
      leadsReceived24h: 7,
    },
    googleSheets: {
      status: "unknown",
    },
    system: {
      queueStatus: "busy",
      pendingReadyJobs: 2,
      runningJobs: 1,
      failedJobs24h: 0,
      oldestPendingJobMinutes: 12,
    },
    actions: [
      {
        label: "Open Gmail Export Ops",
        href: "/app/gmail-export",
        kind: "primary",
        reason: null,
      },
      {
        label: "Open Client Install",
        href: "/app/client-install",
        kind: "secondary",
        reason: null,
      },
      {
        label: "Draft Queue",
        href: "/app/client-drafts",
        kind: "disabled",
        reason: "Coming in a later issue.",
      },
    ],
    workspaceId: "forbidden-client-workspace",
    apiKey: "forbidden-client-api-key",
    leaseToken: "forbidden-client-lease-token",
    metadata_json: { hidden: true },
    payload_json: { hidden: true },
    subject: "forbidden-client-subject",
    bodyText: "forbidden-client-body",
    toEmail: "forbidden-to@example.test",
    fromEmail: "forbidden-from@example.test",
    prompt: "forbidden-client-prompt",
    output: "forbidden-client-output",
  },
};

const clientCockpitSummaryEmpty = {
  success: true,
  data: {
    ...clientCockpitSummary.data,
    pipeline: {
      leads24h: 0,
      scoredLeads24h: 0,
      draftsGenerated24h: 0,
      pendingDrafts: 0,
    },
    gmailExport: {
      status: "unknown",
      pendingRequestCount: 0,
      activeLeaseCount: 0,
      staleLeaseCount: 0,
      exported24h: 0,
      lastExportedAt: null,
    },
    gmailIntake: {
      status: "unknown",
      lastIntakeAt: null,
      leadsReceived24h: 0,
    },
    googleSheets: {
      status: "unknown",
    },
    system: {
      queueStatus: "clear",
      pendingReadyJobs: 0,
      runningJobs: 0,
      failedJobs24h: 0,
      oldestPendingJobMinutes: null,
    },
  },
};

const draftQueueBodyFull =
  "Bonjour, merci pour votre demande. Nous pouvons organiser une intervention et revenir vers vous avec les prochaines etapes.".repeat(
    3,
  );

const draftQueue = {
  success: true,
  data: {
    items: [
      {
        draftId: draftQueueDraftId,
        leadId: "bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc",
        createdAt: "2026-05-15T10:00:00.000Z",
        score: {
          scoreBand: "hot",
          score: 88,
          confidence: 74,
          recommendedAction: "Call today and prepare a quote follow-up.",
          urgency: "high",
          intent: "urgent_service_intent",
        },
        contextSummary: {
          companyName: "Aqua Nord",
          sector: "Plomberie",
          language: "fr",
          contactKnown: true,
          previousLeadCount: 1,
          riskFlags: ["duplicate_risk"],
        },
        draftPreview: {
          hasSubject: true,
          hasBodyText: true,
          subjectPreview: "Intervention plomberie",
          bodyPreview: "Bonjour, merci pour votre demande.",
          tone: null,
          language: "fr",
        },
        gmailExport: {
          exportStatus: "requested",
          canExport: true,
          blockingReasons: [],
          exportedAt: null,
        },
        actions: {
          canRequestGmailExport: false,
          canCancelGmailExportRequest: true,
          canViewGmailExportStatus: true,
        },
        reviewStatus: "pending_review",
        attentionFlags: ["high_score", "urgent_action"],
        workspaceId: "forbidden-draft-queue-workspace",
        contactEmail: "forbidden@example.test",
        metadata_json: { hidden: true },
        payload_json: { hidden: true },
        leaseToken: "forbidden-lease-token",
        providerMessageId: "forbidden-provider-message-id",
        prompt: "forbidden-prompt",
        output: "forbidden-output",
      },
    ],
    summary: {
      pendingReview: 1,
      readyForGmailExport: 1,
      exported: 0,
      blocked: 0,
      attentionRequired: 1,
    },
    limit: 20,
    offset: 0,
    pagination: {
      limit: 20,
      offset: 0,
      total: 1,
    },
    generatedAt: "2026-05-15T12:00:00.000Z",
  },
};

const draftQueueEmpty = {
  success: true,
  data: {
    ...draftQueue.data,
    items: [],
    summary: {
      pendingReview: 0,
      readyForGmailExport: 0,
      exported: 0,
      blocked: 0,
      attentionRequired: 0,
    },
  },
};

const draftQueueFirstItem = draftQueue.data.items[0]!;

type DraftQueueActionFixture = Omit<typeof draftQueue, "data"> & {
  data: Omit<(typeof draftQueue)["data"], "items"> & {
    items: Array<
      Omit<(typeof draftQueue)["data"]["items"][number], "actions" | "gmailExport"> & {
        gmailExport: {
          exportStatus: string;
          canExport: boolean;
          blockingReasons: string[];
          exportedAt: string | null;
        };
        actions: {
          canRequestGmailExport: boolean;
          canCancelGmailExportRequest: boolean;
          canViewGmailExportStatus: boolean;
        };
      }
    >;
  };
};

function draftQueueWithAction(action: "request" | "cancel" = "request") {
  const cloned = JSON.parse(JSON.stringify(draftQueue)) as DraftQueueActionFixture;
  const item = cloned.data.items[0]!;

  if (action === "request") {
    item.gmailExport = {
      exportStatus: "not_exported",
      canExport: false,
      blockingReasons: ["export_not_requested"],
      exportedAt: null,
    };
    item.actions = {
      canRequestGmailExport: true,
      canCancelGmailExportRequest: false,
      canViewGmailExportStatus: true,
    };
    cloned.data.summary.readyForGmailExport = 0;
    return cloned;
  }

  item.gmailExport = {
    exportStatus: "requested",
    canExport: true,
    blockingReasons: [],
    exportedAt: null,
  };
  item.actions = {
    canRequestGmailExport: false,
    canCancelGmailExportRequest: true,
    canViewGmailExportStatus: true,
  };
  cloned.data.summary.readyForGmailExport = 1;
  return cloned;
}

const draftQueueDetail = {
  success: true,
  data: {
    draftId: draftQueueDraftId,
    leadId: "bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc",
    createdAt: "2026-05-15T10:00:00.000Z",
    score: draftQueueFirstItem.score,
    contextSummary: draftQueueFirstItem.contextSummary,
    gmailExport: draftQueueFirstItem.gmailExport,
    actions: draftQueueFirstItem.actions,
    reviewStatus: "pending_review",
    attentionFlags: ["high_score", "urgent_action"],
    proposedDraft: {
      subject: "Intervention plomberie",
      bodyText: draftQueueBodyFull,
      tone: null,
      language: "fr",
      generatedAt: "2026-05-15T10:00:00.000Z",
    },
    workspaceId: "forbidden-detail-workspace",
    metadata_json: { hidden: true },
    leaseToken: "forbidden-detail-lease-token",
    contactEmail: "forbidden-detail@example.test",
    prompt: "forbidden-detail-prompt",
    output: "forbidden-detail-output",
  },
};

const mailQueue = {
  success: true,
  data: {
    generatedAt: "2026-05-15T12:00:00.000Z",
    filters: {
      applied: {
        limit: 20,
        offset: 0,
        since: "2026-04-15T12:00:00.000Z",
        includeIgnored: false,
        category: [],
        action: [],
        scoreBand: [],
        contactStatus: [],
        hasDraft: null,
        exportStatus: [],
        pipelineState: [],
        attentionRequired: null,
      },
    },
    pagination: {
      limit: 20,
      offset: 0,
      total: 1,
    },
    summary: {
      totalClassified: 1,
      totalIgnored: 0,
      totalLeadsCreated: 1,
      totalScored: 1,
      totalWithDraft: 1,
      totalExportRequested: 1,
      totalExported: 0,
      totalAttentionRequired: 1,
    },
    items: [
      {
        classificationId: mailQueueClassificationId,
        classifiedAt: "2026-05-15T09:00:00.000Z",
        classification: {
          category: "service",
          action: "create_lead",
          confidence: "high",
          reasonCode: "urgent_service_intent",
        },
        lead: {
          leadId: "dededede-dede-4ded-8ded-dededededede",
          leadCreatedAt: "2026-05-15T09:05:00.000Z",
          leadStatus: "scored",
        },
        score: {
          scoreBand: "hot",
          score: 88,
          confidence: 74,
          recommendedAction: "Call today.",
          urgency: "high",
          intent: "urgent_service_intent",
          scoredAt: "2026-05-15T09:30:00.000Z",
        },
        contact: {
          known: true,
          previousLeadCount: 1,
          status: "returning",
        },
        draft: {
          draftId: "efefefef-efef-4efe-8efe-efefefefefef",
          status: "draft",
          hasSubject: true,
          hasBodyText: true,
          subjectPreview: "Intervention plomberie",
          bodyPreview: "Bonjour, merci pour votre demande.",
          tone: null,
          language: "fr",
          createdAt: "2026-05-15T10:00:00.000Z",
        },
        gmailExport: {
          exportStatus: "requested",
          canExport: true,
          exportedAt: null,
        },
        companyContext: {
          companyName: "Aqua Nord",
          sector: "Plomberie",
          language: "fr",
        },
        derived: {
          pipelineState: "export_requested",
          attentionFlags: ["high_score", "urgent_action"],
          nextBestAction: "wait",
        },
        workspaceId: "forbidden-mail-workspace",
        contactEmail: "forbidden-mail@example.test",
        fromEmail: "forbidden-from@example.test",
        toEmail: "forbidden-to@example.test",
        metadata_json: { hidden: true },
        payload_json: { hidden: true },
        leaseToken: "forbidden-mail-lease-token",
        prompt: "forbidden-mail-prompt",
        output: "forbidden-mail-output",
      },
    ],
  },
};

const mailQueueEmpty = {
  success: true,
  data: {
    ...mailQueue.data,
    items: [],
    summary: {
      totalClassified: 0,
      totalIgnored: 0,
      totalLeadsCreated: 0,
      totalScored: 0,
      totalWithDraft: 0,
      totalExportRequested: 0,
      totalExported: 0,
      totalAttentionRequired: 0,
    },
    pagination: {
      limit: 20,
      offset: 0,
      total: 0,
    },
  },
};

const mailQueueDetail = {
  success: true,
  data: {
    ...mailQueue.data.items[0],
    workspace_id: "forbidden-mail-detail-workspace",
    contactEmail: "forbidden-mail-detail@example.test",
    bodyText: "forbidden-full-mail-body",
    rawPayload: "forbidden-raw-payload",
    providerMessageId: "forbidden-provider-message-id",
  },
};

const clientInboxMessages = {
  success: true,
  data: {
    generatedAt: "2026-05-18T10:00:00.000Z",
    pagination: {
      limit: 20,
      offset: 0,
      total: 1,
    },
    items: [
      {
        mailItemId: clientInboxMailItemId,
        classificationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        leadId: clientInboxLeadId,
        draftId: clientInboxDraftId,
        receivedAt: "2026-05-18T09:30:00.000Z",
        senderDisplay: null,
        companyDisplay: null,
        subject: null,
        snippet: null,
        subjectPreview: "Synthetic quote request",
        snippetPreview: "Synthetic safe list preview",
        score: 92,
        scoreBand: "hot",
        category: "quote_request",
        intent: "quote_request",
        urgency: "high",
        contactStatus: "new_contact",
        previousThreadCount: 0,
        draftStatus: "ready",
        gmailExportStatus: "not_exported",
        pipelineState: "draft_ready",
        attentionFlags: ["high_score", "urgent_action"],
        needsReview: true,
        bodyText: "forbidden-client-inbox-list-body",
        fromEmail: "forbidden-client-inbox-list-from@example.test",
        toEmail: "forbidden-client-inbox-list-to@example.test",
        metadata_json: { hidden: true },
      },
    ],
  },
};

const clientInboxDetail = {
  success: true,
  data: {
    mail: {
      mailItemId: clientInboxMailItemId,
      subject: "Synthetic quote request",
      fromDisplay: "Clean Pilot Sender",
      fromEmail: "sender@example.test",
      toDisplay: "Syrantis Pilot",
      toEmail: "pilot@example.test",
      receivedAt: "2026-05-18T09:30:00.000Z",
      bodyText: "Synthetic clean Gmail pilot body for admin validation.",
      snippet: "Synthetic clean Gmail pilot body",
      attachments: [],
    },
    analysis: {
      category: "quote_request",
      action: "create_lead",
      reasonCode: "quote_request",
      intent: "quote_request",
      urgency: "high",
      score: 92,
      scoreBand: "hot",
      confidence: 88,
      recommendedAction: "Prepare a quote reply.",
      attentionFlags: ["high_score", "urgent_action"],
    },
    contactContext: {
      contactKnown: false,
      contactStatus: "new_contact",
      previousLeadCount: 0,
      previousThreadCount: 0,
      lastInboundAt: "2026-05-18T09:30:00.000Z",
      lastOutboundAt: null,
      lastOutboundStatus: null,
    },
    companyPolicyContext: {
      companyName: null,
      sector: "Plomberie",
      language: "fr",
      tone: "professional",
      keyRulesMatched: ["confirm availability"],
      missingInfo: ["preferred date"],
      forbiddenClaims: ["guaranteed price"],
    },
    draft: {
      draftId: clientInboxDraftId,
      subject: "Draft reply",
      bodyText: "Generated draft body.",
      status: "draft",
      generatedAt: "2026-05-18T09:45:00.000Z",
      editedAt: null,
      source: "ai",
      policyMatchScore: 84,
      canEdit: true,
      canRewrite: false,
      canExportToGmail: true,
    },
    gmailExport: {
      status: "not_exported",
      requestedAt: null,
      exportedAt: null,
      blockingReasons: [],
    },
    actions: {
      canEditDraft: true,
      canRequestGmailExport: true,
      canCancelGmailExport: true,
      canRewriteLater: false,
      canSendDirectLater: false,
    },
    rawPayload: "forbidden-client-inbox-raw-payload",
  },
};

const clientInboxDraftEdit = {
  success: true,
  data: {
    mailItemId: clientInboxMailItemId,
    draftId: clientInboxDraftId,
    status: "draft",
    updatedAt: "2026-05-18T10:05:00.000Z",
    canExportToGmail: true,
    bodyText: "forbidden-client-inbox-edited-body",
  },
};

const googleSheetsStatus = {
  success: true,
  data: {
    enabled: true,
    configured: true,
    credentialsConfigured: true,
    spreadsheetConfigured: true,
    spreadsheetIdMasked: "1tml...w7lc",
    pushbackRangeConfigured: true,
    verificationRangeConfigured: true,
    pushbackRangeLabel: "Pushback_Log!A:Q",
    verificationRangeLabel: "Verification!A:E",
    lastTest: {
      result: "failed",
      diagnosticTraceId: "77777777-7777-4777-8777-777777777777",
      errorCode: "PUSHBACK_APPEND_FAILED",
      testedAt: "2026-05-07T10:00:00.000Z",
    },
    spreadsheetId: "1tmlX52yatPzZD5peOH_oGS46PArKNltZHr28CUzw7lc",
    credentials: "forbidden-credentials-json",
    private_key: "forbidden-private-key",
    client_email: "forbidden-client-email",
    rawGoogle: "forbidden-raw-google",
    workspaceId: "forbidden-workspace",
  },
};

const googleSheetsTestSuccess = {
  success: true,
  data: {
    result: "succeeded",
    diagnosticTraceId: "88888888-8888-4888-8888-888888888888",
    testedAt: "2026-05-07T10:01:00.000Z",
    errorCode: null,
    errorSummary: null,
    verification: {
      rangeTested: "Verification!A:E",
      rowsAppended: 1,
    },
    rawGoogle: "forbidden-test-raw-google",
    workspaceId: "forbidden-test-workspace",
  },
};

const googleSheetsTestFailure = {
  success: true,
  data: {
    result: "failed",
    diagnosticTraceId: "99999999-9999-4999-8999-999999999999",
    testedAt: "2026-05-07T10:02:00.000Z",
    errorCode: "PUSHBACK_AUTH_FAILED",
    errorSummary: "Google Sheets authentication or authorization failed.",
    verification: null,
    client_email: "forbidden-failure-client-email",
  },
};

const workspaceApiKeys = {
  success: true,
  data: [
    {
      id: "12121212-1212-4121-8121-121212121212",
      name: "Website form production",
      keyPrefix: "syr_live",
      last4: "abcd",
      status: "active",
      lastUsedAt: "2026-05-09T10:00:00.000Z",
      revokedAt: null,
      createdAt: "2026-05-09T09:00:00.000Z",
      updatedAt: "2026-05-09T09:00:00.000Z",
      key_hash: "forbidden-hash",
      plaintextApiKey: "syr_live_forbidden_plaintext",
    },
  ],
};

const workspaceApiKeysEmpty = {
  success: true,
  data: [],
};

const workspaceApiKeyCreate = {
  success: true,
  data: {
    id: "13131313-1313-4131-8131-131313131313",
    name: "Make inbound",
    keyPrefix: "syr_live",
    last4: "wxyz",
    status: "active",
    lastUsedAt: null,
    revokedAt: null,
    createdAt: "2026-05-09T11:00:00.000Z",
    updatedAt: "2026-05-09T11:00:00.000Z",
    plaintextApiKey: "syr_live_created_wxyz",
    keyHash: "forbidden-hash",
  },
};

const workspaceApiKeyRevoked = {
  success: true,
  data: {
    id: "12121212-1212-4121-8121-121212121212",
    name: "Website form production",
    keyPrefix: "syr_live",
    last4: "abcd",
    status: "revoked",
    lastUsedAt: "2026-05-09T10:00:00.000Z",
    revokedAt: "2026-05-09T12:00:00.000Z",
    createdAt: "2026-05-09T09:00:00.000Z",
    updatedAt: "2026-05-09T12:00:00.000Z",
    plaintextApiKey: "syr_live_forbidden_plaintext",
    key_hash: "forbidden-hash",
  },
};

const responsePolicyEmpty = {
  success: true,
  data: {
    policy: {
      language: "auto",
      tone: "professional",
      customToneNotes: null,
      signature: null,
      defaultGreeting: null,
      defaultClosing: null,
      responseStructure: [],
      businessRules: [],
      forbiddenClaims: [],
      escalationRules: [],
      offerNotes: [],
      catalogSummary: null,
      exampleReplies: [],
      updatedAt: null,
      status: "empty",
    },
  },
};

const responsePolicyConfigured = {
  success: true,
  data: {
    policy: {
      language: "fr",
      tone: "warm",
      customToneNotes: "Keep replies clear and calm.",
      signature: "Acme team",
      defaultGreeting: "Bonjour,",
      defaultClosing: "Bien cordialement,",
      responseStructure: ["acknowledge request", "propose next step"],
      businessRules: ["confirm slots before promising timing"],
      forbiddenClaims: ["do not guarantee exact price"],
      escalationRules: ["complaints require human review"],
      offerNotes: ["lead with diagnostic visit"],
      catalogSummary: "Heating services.",
      exampleReplies: [{ label: "Quote", bodyText: "Bonjour, merci pour votre demande." }],
      updatedAt: "2026-05-16T09:00:00.000Z",
      status: "configured",
      workspaceId: "forbidden-response-policy-workspace",
      contextJson: { raw: true },
    },
  },
};

const opsHealth = {
  success: true,
  data: {
    status: "healthy",
    checkedAt: "2026-05-08T10:00:00.000Z",
    api: {
      status: "ok",
      uptimeSeconds: 120,
    },
    db: {
      status: "ok",
      latencyMs: 8,
    },
    googleSheets: {
      status: "ok",
      configured: true,
      lastTestResult: "succeeded",
      lastTestedAt: "2026-05-08T09:55:00.000Z",
    },
    workerQueue: {
      status: "ok",
      pending: 2,
      running: 1,
      failed: 0,
      oldestPendingMinutes: 12,
    },
    workspaceId: "forbidden-ops-workspace",
    payload_json: { hidden: true },
  },
};

const opsRecent = {
  success: true,
  data: {
    checks: [
      {
        checkId: "api-health",
        result: "succeeded",
        diagnosticTraceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        runAt: "2026-05-08T10:01:00.000Z",
        durationMs: 3,
        errorCode: null,
        errorSummary: null,
        workspaceId: "forbidden-recent-workspace",
        metadata_json: { hidden: true },
      },
    ],
    limit: 20,
  },
};

const opsDbHealthSuccess = {
  success: true,
  data: {
    checkId: "db-health",
    result: "succeeded",
    diagnosticTraceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    runAt: "2026-05-08T10:02:00.000Z",
    durationMs: 9,
    errorCode: null,
    errorSummary: null,
    data: {
      latencyMs: 8,
      payload_json: { hidden: true },
      workspaceId: "forbidden-run-workspace",
    },
  },
};

const opsGoogleSheetsSkipped = {
  success: true,
  data: {
    checkId: "google-sheets-test",
    result: "skipped",
    diagnosticTraceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    runAt: "2026-05-08T10:03:00.000Z",
    durationMs: 4,
    errorCode: "OPS_CHECK_COOLDOWN",
    errorSummary: "Google Sheets test was skipped because it ran recently.",
    data: {
      cooldownMinutes: 5,
      rawGoogle: "forbidden-ops-raw-google",
      private_key: "forbidden-ops-private-key",
    },
  },
};

const opsWorkerFailedSummary = {
  success: true,
  data: {
    checkId: "worker-failed-summary",
    result: "succeeded",
    diagnosticTraceId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    runAt: "2026-05-08T10:04:00.000Z",
    durationMs: 11,
    errorCode: null,
    errorSummary: null,
    data: {
      totalFailed: 5,
      status: "degraded",
      groups: [
        {
          type: "score_lead",
          count: 5,
          minAttempts: 1,
          maxAttempts: 1,
          oldestCreatedAt: "2026-05-02T10:00:00.000Z",
          latestUpdatedAt: "2026-05-02T10:05:00.000Z",
          ageBucket: "historical",
          payload_json: { hidden: true },
          id: "job-id",
          locked_by: "forbidden-worker",
          stack: "forbidden stack",
        },
      ],
      interpretation: {
        summary: "Only historical failed worker jobs detected.",
        hasOnlyHistoricalFailures: true,
        hasFreshFailures: false,
        recommendedNextAction: "review_historical_failures",
      },
      payload_json: { hidden: true },
      id: "job-id",
      stack: "forbidden stack",
    },
  },
};

function mockJson(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function pushbackStatusFixture(canReplay = true) {
  const clone = JSON.parse(JSON.stringify(pushbackStatus)) as {
    data: {
      pushback: {
        canReplay: boolean;
        canReplayReason: string | null;
        replay: {
          emailSendId: string | null;
          endpoint: string | null;
        };
        counts: {
          manualReplayEvents: number;
        };
      };
    };
  };
  clone.data.pushback.canReplay = canReplay;
  clone.data.pushback.canReplayReason = canReplay ? null : "send_not_terminal";
  clone.data.pushback.replay.emailSendId = canReplay ? emailSendId : null;
  clone.data.pushback.replay.endpoint = canReplay ? replayUrl : null;
  return clone;
}

async function lookupEmailSendStatus(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("UUID"), emailSendId);
  await user.click(screen.getByRole("button", { name: "Look up status" }));
  await screen.findByLabelText("Result");
}

function replayPostCalls(request: ReturnType<typeof vi.fn>) {
  return request.mock.calls.filter(([url, init]) => url === replayUrl && init?.method === "POST");
}

function googleSheetsTestPostCalls(request: ReturnType<typeof vi.fn>) {
  return request.mock.calls.filter(
    ([url, init]) => url === googleSheetsTestUrl && init?.method === "POST",
  );
}

function opsCheckPostCalls(request: ReturnType<typeof vi.fn>, url: string) {
  return request.mock.calls.filter(
    ([calledUrl, init]) => calledUrl === url && init?.method === "POST",
  );
}

function gmailExportPostCalls(request: ReturnType<typeof vi.fn>, url: string) {
  return request.mock.calls.filter(
    ([calledUrl, init]) => calledUrl === url && init?.method === "POST",
  );
}

function opsDefaultResponse(url: string) {
  if (url === opsHealthUrl) {
    return mockJson(opsHealth);
  }

  if (url === opsRecentUrl) {
    return mockJson(opsRecent);
  }

  return mockJson(currentUser);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("admin app", () => {
  it("renders the login form", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => mockJson({ success: false }, 401)),
    );

    renderApp("/login");

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("validates the login form", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => mockJson({ success: false }, 401)),
    );

    renderApp("/login");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();
  });

  it("calls the login endpoint and redirects after success", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === "/auth/login") {
        return mockJson(currentUser);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/login");
    await user.type(screen.getByLabelText("Email"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith(
        "/auth/login",
        expect.objectContaining({ credentials: "include", method: "POST" }),
      );
    });
    expect(await screen.findByRole("heading", { name: "Admin dashboard" })).toBeInTheDocument();
  });

  it("shows a generic invalid credentials message", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => mockJson({ success: false }, 401)),
    );

    renderApp("/login");
    await user.type(screen.getByLabelText("Email"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
  });

  it("redirects protected routes for unauthenticated users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => mockJson({ success: false }, 401)),
    );

    renderApp("/app");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("renders the protected shell for authenticated users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => mockJson(currentUser)),
    );

    renderApp("/app");

    expect(await screen.findByText("Syrantis Admin")).toBeInTheDocument();
    expect(screen.getByText("Admin User")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pushback" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Client Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Client Inbox Lab" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Client Install" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Draft Queue" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mail Queue" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gmail Export" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "API Keys" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google Sheets" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ops" })).toBeInTheDocument();
  });

  it("renders the Client Inbox Lab inside the protected admin app", async () => {
    const request = vi.fn((url: string) => {
      if (url === clientInboxMessagesUrl) {
        return mockJson(clientInboxMessages);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/client-inbox-lab");

    expect(await screen.findByRole("heading", { name: "Client Inbox Lab" })).toBeInTheDocument();
    expect(screen.getByText("Syrantis Admin")).toBeInTheDocument();
    expect(screen.getByText("Internal validation only · Not final client UI")).toBeInTheDocument();
    expect(
      screen.getByText(
        "List v1 keeps subject and snippet null while exposing bounded safe preview fields for final Inbox validation.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText(clientInboxMailItemId)).toBeInTheDocument();
    expect(screen.getByText("Subject preview")).toBeInTheDocument();
    expect(screen.getByText("Snippet preview")).toBeInTheDocument();
    expect(screen.getByText("Synthetic quote request")).toBeInTheDocument();
    expect(screen.getByText("Synthetic safe list preview")).toBeInTheDocument();
    expect(screen.getByText("Subject value")).toBeInTheDocument();
    expect(screen.getByText("Snippet value")).toBeInTheDocument();
    expect(screen.getAllByText("null").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByLabelText("Navigation client")).not.toBeInTheDocument();
    expect(screen.queryByText("Boîte de réception")).not.toBeInTheDocument();
    expect(screen.queryByText("Tableau de bord")).not.toBeInTheDocument();
    expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
    expect(screen.queryByText(/raw json/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/secret/i)).not.toBeInTheDocument();

    const listPanel = screen.getByLabelText("Filter and list");
    expect(
      within(listPanel).queryByText("forbidden-client-inbox-list-body"),
    ).not.toBeInTheDocument();
    expect(
      within(listPanel).queryByText("Synthetic clean Gmail pilot body for admin validation."),
    ).not.toBeInTheDocument();
  });

  it("loads Client Inbox Lab detail and runs draft/export smoke actions safely", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string, init?: RequestInit) => {
      if (url === clientInboxMessagesUrl) {
        return mockJson(clientInboxMessages);
      }

      if (url === clientInboxDetailUrl) {
        return mockJson(clientInboxDetail);
      }

      if (url === clientInboxDraftUrl && init?.method === "PATCH") {
        return mockJson(clientInboxDraftEdit);
      }

      if (url === clientInboxExportRequestUrl && init?.method === "POST") {
        return mockJson(gmailExportRequestResponse);
      }

      if (url === clientInboxExportCancelUrl && init?.method === "POST") {
        return mockJson(gmailExportCancelResponse);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/client-inbox-lab");
    const rowButton = (await screen.findByText(clientInboxMailItemId)).closest("button");
    expect(rowButton).not.toBeNull();
    await user.click(rowButton!);

    expect(
      await screen.findByText("Synthetic clean Gmail pilot body for admin validation."),
    ).toBeInTheDocument();
    expect(screen.getByText("sender@example.test")).toBeInTheDocument();
    expect(screen.getByText("pilot@example.test")).toBeInTheDocument();
    expect(screen.queryByText(/listSubjectPreview/)).not.toBeInTheDocument();
    expect(screen.queryByText(/listSnippetPreview/)).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-client-inbox-raw-payload")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Draft subject"), "Smoke subject");
    await user.type(screen.getByLabelText("Draft body"), "Smoke body");
    await user.click(screen.getByRole("button", { name: "Save draft edit" }));
    expect(await screen.findByText(/Draft draft updated/)).toBeInTheDocument();

    const patchCall = request.mock.calls.find(
      ([url, init]) => url === clientInboxDraftUrl && init?.method === "PATCH",
    );
    expect(JSON.stringify(patchCall?.[1]?.body)).toContain("Smoke subject");
    expect(JSON.stringify(patchCall?.[1]?.body)).toContain("Smoke body");
    expect(JSON.stringify(patchCall?.[1])).not.toContain("Authorization");

    await user.click(screen.getByRole("button", { name: "Request export" }));
    expect(await screen.findByText(/Export request requested/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel export" }));
    expect(await screen.findByText(/Export request cancelled/)).toBeInTheDocument();
    expect(gmailExportPostCalls(request, clientInboxExportRequestUrl)).toHaveLength(1);
    expect(gmailExportPostCalls(request, clientInboxExportCancelUrl)).toHaveLength(1);
    expect(screen.queryByText("forbidden-client-inbox-edited-body")).not.toBeInTheDocument();
  });

  it("renders the mock Client Inbox preview without admin or debug controls", () => {
    renderApp("/app/client-inbox-preview");

    expect(screen.getByRole("heading", { name: "Boîte de réception" })).toBeInTheDocument();
    expect(screen.getByText("Analyse Syrantis")).toBeInTheDocument();
    expect(screen.getByText("Brouillon IA")).toBeInTheDocument();
    expect(screen.getAllByText("Lumière Services").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Demande de devis/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Modifier" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Préparer dans Gmail" })).toBeInTheDocument();

    const clientNav = screen.getByLabelText("Navigation client");
    expect(within(clientNav).getByText("Tableau de bord")).toBeInTheDocument();
    expect(within(clientNav).getByText("Boîte de réception")).toBeInTheDocument();
    expect(within(clientNav).getByText("Configuration")).toBeInTheDocument();

    for (const forbidden of ["Ops", "API Keys", "Google Sheets", "Pushback"]) {
      expect(within(clientNav).queryByText(forbidden)).not.toBeInTheDocument();
    }

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/bulk/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/raw json/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/debug/i)).not.toBeInTheDocument();
  });

  it("renders the draft queue page with summary cards and cards", async () => {
    const request = vi.fn((url: string) => {
      if (url === draftQueueUrl) {
        return mockJson(draftQueue);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/draft-queue");

    expect(await screen.findByRole("heading", { name: "Draft Queue" })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Intervention plomberie" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Pending review")).toBeInTheDocument();
    expect(screen.getByText("Ready for Gmail export")).toBeInTheDocument();
    expect(screen.getAllByText("Attention required").length).toBeGreaterThan(0);
    expect(screen.getByText("Bonjour, merci pour votre demande.")).toBeInTheDocument();
    expect(screen.getByText("Aqua Nord / Plomberie")).toBeInTheDocument();
    expect(screen.getAllByText("requested").length).toBeGreaterThan(0);
    expect(screen.queryByText("forbidden-draft-queue-workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden@example.test")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-prompt")).not.toBeInTheDocument();
  });

  it("renders the draft queue empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === draftQueueUrl) {
          return mockJson(draftQueueEmpty);
        }

        return mockJson(currentUser);
      }),
    );

    renderApp("/app/draft-queue");

    expect(
      await screen.findByText("No generated drafts are waiting in this queue."),
    ).toBeInTheDocument();
  });

  it("updates draft queue filters and refreshes", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === draftQueueHotUrl || url === draftQueueAttentionUrl || url === draftQueueUrl) {
        return mockJson(draftQueue);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/draft-queue");
    await screen.findByRole("heading", { name: "Intervention plomberie" });
    await user.click(screen.getByRole("button", { name: "hot" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(draftQueueHotUrl, expect.anything()));
    await user.click(screen.getByRole("button", { name: "hot" }));
    await user.click(screen.getByRole("button", { name: "Attention required" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(draftQueueAttentionUrl, expect.anything()),
    );
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(request).toHaveBeenCalled();
  });

  it("opens the draft detail drawer with full generated draft only", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === draftQueueUrl) {
        return mockJson(draftQueue);
      }

      if (url === draftQueueDetailUrl) {
        return mockJson(draftQueueDetail);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/draft-queue");
    await user.click(await screen.findByRole("button", { name: "View details" }));

    const drawer = await screen.findByLabelText("Draft detail");
    expect(within(drawer).getByText(draftQueueBodyFull)).toBeInTheDocument();
    expect(within(drawer).getByText("Blocking reasons")).toBeInTheDocument();
    expect(screen.queryByText("forbidden-detail-workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-detail-prompt")).not.toBeInTheDocument();
  });

  it("requests Gmail export from the draft queue and refreshes the list", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    let listCalls = 0;
    let resolvePost: (() => void) | undefined;
    const postDone = new Promise<void>((resolve) => {
      resolvePost = resolve;
    });
    const request = vi.fn((url: string, init?: RequestInit) => {
      if (url === draftQueueUrl) {
        listCalls += 1;
        return mockJson(listCalls === 1 ? draftQueueWithAction("request") : draftQueue);
      }

      if (
        url === `/api/drafts/${draftQueueDraftId}/gmail-export-request` &&
        init?.method === "POST"
      ) {
        return postDone.then(() => mockJson(gmailExportRequestResponse));
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/draft-queue");
    const requestButton = await screen.findByRole("button", { name: "Request Gmail export" });
    await user.click(requestButton);

    expect(confirm).toHaveBeenCalledWith("Request Gmail export for this draft?");
    expect(requestButton).toBeDisabled();
    resolvePost?.();
    expect(
      await screen.findByText("Gmail export requested. Refresh complete."),
    ).toBeInTheDocument();
    await waitFor(() => expect(listCalls).toBe(2));
    expect(
      gmailExportPostCalls(request, `/api/drafts/${draftQueueDraftId}/gmail-export-request`),
    ).toHaveLength(1);
    expect((await screen.findAllByText("requested")).length).toBeGreaterThan(0);
  });

  it("cancels a Gmail export request from the draft queue", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const request = vi.fn((url: string, init?: RequestInit) => {
      if (url === draftQueueUrl) {
        return mockJson(draftQueueWithAction("cancel"));
      }

      if (
        url === `/api/drafts/${draftQueueDraftId}/gmail-export-cancel` &&
        init?.method === "POST"
      ) {
        return mockJson(gmailExportCancelResponse);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/draft-queue");
    await user.click(await screen.findByRole("button", { name: "Cancel request" }));

    expect(confirm).toHaveBeenCalledWith("Cancel this Gmail export request?");
    expect(
      await screen.findByText("Gmail export request cancelled. Refresh complete."),
    ).toBeInTheDocument();
    expect(
      gmailExportPostCalls(request, `/api/drafts/${draftQueueDraftId}/gmail-export-cancel`),
    ).toHaveLength(1);
  });

  it("shows draft queue action errors and keeps forbidden actions hidden", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const request = vi.fn((url: string, init?: RequestInit) => {
      if (url === draftQueueUrl) {
        return mockJson(draftQueueWithAction("request"));
      }

      if (
        url === `/api/drafts/${draftQueueDraftId}/gmail-export-request` &&
        init?.method === "POST"
      ) {
        return mockJson({ success: false }, 409);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/draft-queue");
    await user.click(await screen.findByRole("button", { name: "Request Gmail export" }));

    expect(await screen.findByText("Could not request Gmail export.")).toBeInTheDocument();
    for (const name of ["Send", "Approve", "Reject", "Edit", "Mark reviewed", "Dismiss"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/bulk/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/raw json/i)).not.toBeInTheDocument();
  });

  it("shows draft queue action buttons in the detail drawer with the same rules", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let detailCalls = 0;
    const requestableQueue = draftQueueWithAction("request");
    const requestableDetail = {
      ...draftQueueDetail,
      data: {
        ...draftQueueDetail.data,
        gmailExport: requestableQueue.data.items[0]!.gmailExport,
        actions: requestableQueue.data.items[0]!.actions,
      },
    };
    const request = vi.fn((url: string, init?: RequestInit) => {
      if (url === draftQueueUrl) {
        return mockJson(requestableQueue);
      }

      if (url === draftQueueDetailUrl) {
        detailCalls += 1;
        return mockJson(detailCalls === 1 ? requestableDetail : draftQueueDetail);
      }

      if (
        url === `/api/drafts/${draftQueueDraftId}/gmail-export-request` &&
        init?.method === "POST"
      ) {
        return mockJson(gmailExportRequestResponse);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/draft-queue");
    await user.click(await screen.findByRole("button", { name: "View details" }));
    const drawer = await screen.findByLabelText("Draft detail");
    await user.click(within(drawer).getByRole("button", { name: "Request Gmail export" }));

    await waitFor(() => expect(detailCalls).toBe(2));
    expect(
      gmailExportPostCalls(request, `/api/drafts/${draftQueueDraftId}/gmail-export-request`),
    ).toHaveLength(1);
    expect(within(drawer).queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    expect(screen.queryByText(/raw json/i)).not.toBeInTheDocument();
  });

  it("keeps the draft queue out of mutation and inbox patterns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === draftQueueUrl) {
          return mockJson(draftQueue);
        }

        return mockJson(currentUser);
      }),
    );

    renderApp("/app/draft-queue");
    await screen.findByRole("heading", { name: "Intervention plomberie" });

    for (const name of ["Send", "Approve", "Reject", "Edit", "Mark reviewed", "Export"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/bulk/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/raw json/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/From|To|CC|BCC/)).not.toBeInTheDocument();
  });

  it("renders the mail queue page with summary cards, filters, and cards", async () => {
    const request = vi.fn((url: string) => {
      if (url === mailQueueUrl) {
        return mockJson(mailQueue);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/mail-queue");

    expect(await screen.findByRole("heading", { name: "Mail Review Queue" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "This is a mail review queue for AI-classified inbound messages. It is not an inbox.",
      ),
    ).toBeInTheDocument();
    for (const label of [
      "Classified",
      "Ignored",
      "Leads created",
      "Scored",
      "With draft",
      "Exported",
      "Attention required",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    for (const label of [
      "Include ignored",
      "Has draft",
      "Attention required",
      "service",
      "create_lead",
      "hot",
      "export_requested",
      "returning",
      "requested",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("button", { name: /Refresh/ })).toBeInTheDocument();
    expect(await screen.findByText("urgent_service_intent")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getAllByText("Gmail export").length).toBeGreaterThan(0);
    expect(screen.queryByText("forbidden-mail-workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-mail@example.test")).not.toBeInTheDocument();
  });

  it("renders the mail queue empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === mailQueueUrl) {
          return mockJson(mailQueueEmpty);
        }

        return mockJson(currentUser);
      }),
    );

    renderApp("/app/mail-queue");

    expect(
      await screen.findByText("No classified inbound mail is visible in this queue."),
    ).toBeInTheDocument();
  });

  it("updates mail queue filters and refreshes", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (
        url === mailQueueUrl ||
        url === mailQueueIncludeIgnoredUrl ||
        url === mailQueueCategoryUrl
      ) {
        return mockJson(mailQueue);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/mail-queue");
    await screen.findByText("urgent_service_intent");
    await user.click(screen.getByRole("button", { name: "Include ignored" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(mailQueueIncludeIgnoredUrl, expect.anything()),
    );
    await user.click(screen.getByRole("button", { name: "Include ignored" }));
    await user.click(screen.getByRole("button", { name: "service" }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(mailQueueCategoryUrl, expect.anything()),
    );
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(request).toHaveBeenCalled();
  });

  it("opens the mail queue detail drawer with safe read-only cards and links", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === mailQueueUrl) {
        return mockJson(mailQueue);
      }

      if (url === mailQueueDetailUrl) {
        return mockJson(mailQueueDetail);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/mail-queue");
    await user.click(await screen.findByRole("button", { name: "View details" }));

    const drawer = await screen.findByLabelText("Mail queue detail");
    for (const label of [
      "Classification",
      "Score",
      "Contact status",
      "Draft preview",
      "Export status",
      "Company context",
    ]) {
      expect(within(drawer).getByText(label)).toBeInTheDocument();
    }
    expect(within(drawer).getByRole("link", { name: "View Draft Queue" })).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: "View Gmail Export" })).toBeInTheDocument();
    expect(within(drawer).getByText("Bonjour, merci pour votre demande.")).toBeInTheDocument();
    expect(screen.queryByText("forbidden-mail-detail-workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-full-mail-body")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-mail-detail@example.test")).not.toBeInTheDocument();
  });

  it("keeps the mail queue free of inbox, mutation, raw JSON, and contact exposure patterns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === mailQueueUrl) {
          return mockJson(mailQueue);
        }

        return mockJson(currentUser);
      }),
    );

    renderApp("/app/mail-queue");
    await screen.findByText("urgent_service_intent");

    for (const name of [
      "Send",
      "Approve",
      "Reject",
      "Edit",
      "Archive",
      "Delete",
      "Reply",
      "Forward",
      "Mark reviewed",
    ]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/bulk/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/raw json/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/forbidden-mail@example\.test/)).not.toBeInTheDocument();
    expect(screen.queryByText(/From|To|CC|BCC/)).not.toBeInTheDocument();
  });

  it("logs out through the backend and redirects", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === "/auth/logout") {
        return mockJson({ success: true });
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app");
    await user.click(await screen.findByRole("button", { name: "Logout" }));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith(
        "/auth/logout",
        expect.objectContaining({ credentials: "include", method: "POST" }),
      );
    });
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("validates pushback UUID input", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => mockJson(currentUser)),
    );

    renderApp("/app/pushback");
    await user.type(await screen.findByLabelText("UUID"), "not-a-uuid");
    await user.click(screen.getByRole("button", { name: "Look up status" }));

    expect(await screen.findByText("Enter a valid UUID.")).toBeInTheDocument();
  });

  it("looks up pushback status by email send ID", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === statusUrl) {
        return mockJson(pushbackStatus);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await user.type(await screen.findByLabelText("UUID"), "33333333-3333-4333-8333-333333333333");
    await user.click(screen.getByRole("button", { name: "Look up status" }));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith(
        statusUrl,
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  it("looks up pushback status by draft ID", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === "/api/drafts/44444444-4444-4444-8444-444444444444/pushback-status") {
        return mockJson({
          ...pushbackStatus,
          data: {
            ...pushbackStatus.data,
            target: {
              type: "draft",
              draftId: "44444444-4444-4444-8444-444444444444",
              emailSendId: "33333333-3333-4333-8333-333333333333",
              resolvedFromDraft: true,
            },
          },
        });
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await user.click(await screen.findByLabelText("Draft ID"));
    await user.type(screen.getByLabelText("UUID"), "44444444-4444-4444-8444-444444444444");
    await user.click(screen.getByRole("button", { name: "Look up status" }));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith(
        "/api/drafts/44444444-4444-4444-8444-444444444444/pushback-status",
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  it("renders safe pushback status fields only", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url === "/api/email-sends/33333333-3333-4333-8333-333333333333/pushback-status"
          ? mockJson(pushbackStatus)
          : mockJson(currentUser),
      ),
    );

    renderApp("/app/pushback");
    await user.type(await screen.findByLabelText("UUID"), "33333333-3333-4333-8333-333333333333");
    await user.click(screen.getByRole("button", { name: "Look up status" }));

    const result = await screen.findByLabelText("Result");
    expect(within(result).getByText("succeeded")).toBeInTheDocument();
    expect(within(result).getByText("manual_replay")).toBeInTheDocument();
    expect(within(result).getByText("PUSHBACK_RATE_LIMITED")).toBeInTheDocument();
    expect(within(result).getByText("Pushback was rate limited.")).toBeInTheDocument();
    expect(within(result).getByText("2")).toBeInTheDocument();
    expect(within(result).getByText("1")).toBeInTheDocument();

    expect(screen.queryByText("forbidden-provider")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-provider-camel")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-google")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-provider-payload")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-provider-error")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-subject")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-html")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-text")).not.toBeInTheDocument();
    expect(screen.queryByText("hidden@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-lead-label")).not.toBeInTheDocument();
    expect(screen.queryByText("hidden-recipient@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("hidden-workspace-id")).not.toBeInTheDocument();
    expect(screen.queryByText("hidden_workspace_id")).not.toBeInTheDocument();
    expect(screen.queryByText("sheet...1234")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden!A:Q")).not.toBeInTheDocument();
  });

  it("does not render the replay button when canReplay is false", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url === statusUrl ? mockJson(pushbackStatusFixture(false)) : mockJson(currentUser),
      ),
    );

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);

    expect(screen.queryByRole("button", { name: "Replay pushback" })).not.toBeInTheDocument();
    expect(screen.getByText("Replay unavailable for this status.")).toBeInTheDocument();
  });

  it("renders the replay button when canReplay is true", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url === statusUrl ? mockJson(pushbackStatusFixture(true)) : mockJson(currentUser),
      ),
    );

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);

    expect(screen.getByRole("button", { name: "Replay pushback" })).toBeInTheDocument();
  });

  it("requires confirmation before replay POST", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) =>
      url === statusUrl ? mockJson(pushbackStatus) : mockJson(currentUser),
    );
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);
    await user.click(screen.getByRole("button", { name: "Replay pushback" }));

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Replay Google Sheets pushback for this email send?",
    );
    expect(screen.getByText("This will not resend the email.")).toBeInTheDocument();
    expect(replayPostCalls(request)).toHaveLength(0);
  });

  it("does not call replay POST when confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) =>
      url === statusUrl ? mockJson(pushbackStatus) : mockJson(currentUser),
    );
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);
    await user.click(screen.getByRole("button", { name: "Replay pushback" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(replayPostCalls(request)).toHaveLength(0);
  });

  it("confirms replay with emailSendId only and no workspaceId", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === statusUrl) {
        return mockJson(pushbackStatus);
      }

      if (url === replayUrl) {
        return mockJson(replayResponse);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);
    await user.click(screen.getByRole("button", { name: "Replay pushback" }));
    await user.click(screen.getByRole("button", { name: "Confirm replay" }));

    await screen.findByText(/Replay result:/);
    const postCalls = replayPostCalls(request);
    expect(postCalls).toHaveLength(1);
    const [, init] = postCalls[0] ?? [];
    expect(init).toEqual(expect.objectContaining({ credentials: "include", method: "POST" }));
    expect(init).not.toHaveProperty("body");
    expect(JSON.stringify(init)).not.toContain("workspaceId");
    expect(JSON.stringify(init)).not.toContain("workspace_id");
    expect(JSON.stringify(init)).not.toContain("Authorization");
    expect(JSON.stringify(init)).not.toContain("Bearer");
  });

  it("locks replay UI during POST and prevents rapid double confirm", async () => {
    const user = userEvent.setup();
    let resolveReplay: (response: Response) => void = () => undefined;
    const replayPromise = new Promise<Response>((resolve) => {
      resolveReplay = resolve;
    });
    const request = vi.fn((url: string) => {
      if (url === statusUrl) {
        return mockJson(pushbackStatus);
      }

      if (url === replayUrl) {
        return replayPromise;
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);
    await user.click(screen.getByRole("button", { name: "Replay pushback" }));
    await user.dblClick(screen.getByRole("button", { name: "Confirm replay" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Replaying..." })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(replayPostCalls(request)).toHaveLength(1);

    resolveReplay(
      new Response(JSON.stringify(replayResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(await screen.findByText(/Replay result:/)).toBeInTheDocument();
  });

  it("displays replay success and refetches pushback status", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    const refreshedStatus = pushbackStatusFixture(true);
    refreshedStatus.data.pushback.counts.manualReplayEvents = 2;
    const request = vi.fn((url: string) => {
      if (url === statusUrl) {
        statusCalls += 1;
        return mockJson(statusCalls === 1 ? pushbackStatus : refreshedStatus);
      }

      if (url === replayUrl) {
        return mockJson(replayResponse);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);
    await user.click(screen.getByRole("button", { name: "Replay pushback" }));
    await user.click(screen.getByRole("button", { name: "Confirm replay" }));

    expect(await screen.findByText(/Replay result:/)).toBeInTheDocument();
    expect(screen.getAllByText("succeeded").length).toBeGreaterThan(0);
    expect(screen.getByText("66666666-6666-4666-8666-666666666666")).toBeInTheDocument();
    await waitFor(() => expect(statusCalls).toBe(2));
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.queryByText("forbidden-replay-provider")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-replay-workspace")).not.toBeInTheDocument();
  });

  it("preserves replay success when status refresh fails", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    const request = vi.fn((url: string) => {
      if (url === statusUrl) {
        statusCalls += 1;
        return statusCalls === 1 ? mockJson(pushbackStatus) : mockJson({ success: false }, 500);
      }

      if (url === replayUrl) {
        return mockJson(replayResponse);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);
    await user.click(screen.getByRole("button", { name: "Replay pushback" }));
    await user.click(screen.getByRole("button", { name: "Confirm replay" }));

    expect(await screen.findByText(/Replay result:/)).toBeInTheDocument();
    expect(screen.getByText("66666666-6666-4666-8666-666666666666")).toBeInTheDocument();
    expect(
      await screen.findByText("Replay completed, but status refresh failed."),
    ).toBeInTheDocument();
  });

  it.each([
    [401, "Replay failed (401)."],
    [403, "Replay failed (403)."],
    [404, "Replay failed (404)."],
    [500, "Replay failed (500)."],
  ])("shows safe replay handling for %s responses", async (status, message) => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === statusUrl) {
        return mockJson(pushbackStatus);
      }

      if (url === replayUrl) {
        return mockJson({ success: false, rawProvider: "do-not-render" }, status);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);
    await user.click(screen.getByRole("button", { name: "Replay pushback" }));
    await user.click(screen.getByRole("button", { name: "Confirm replay" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText("do-not-render")).not.toBeInTheDocument();
  });

  it("refetches status when backend refuses replay after canReplay was true", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    const refusedStatus = pushbackStatusFixture(false);
    const request = vi.fn((url: string) => {
      if (url === statusUrl) {
        statusCalls += 1;
        return mockJson(statusCalls === 1 ? pushbackStatusFixture(true) : refusedStatus);
      }

      if (url === replayUrl) {
        return mockJson({ success: false, errorCode: "PUSHBACK_NOT_REPLAYABLE" }, 409);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);
    await user.click(screen.getByRole("button", { name: "Replay pushback" }));
    await user.click(screen.getByRole("button", { name: "Confirm replay" }));

    expect(await screen.findByText("Replay failed (409).")).toBeInTheDocument();
    await waitFor(() => expect(statusCalls).toBe(2));
    expect(screen.queryByRole("button", { name: "Replay pushback" })).not.toBeInTheDocument();
    expect(screen.getByText("Replay unavailable for this status.")).toBeInTheDocument();
  });

  it("renders the Google Sheets setup status card with masked spreadsheet id only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url === googleSheetsStatusUrl ? mockJson(googleSheetsStatus) : mockJson(currentUser),
      ),
    );

    renderApp("/app/google-sheets");

    expect(await screen.findByRole("heading", { name: "Google Sheets Setup" })).toBeInTheDocument();
    const status = await screen.findByLabelText("Status");
    expect(within(status).getByText("Pushback enabled")).toBeInTheDocument();
    expect(within(status).getByText("Credentials configured")).toBeInTheDocument();
    expect(within(status).getByText("Spreadsheet configured")).toBeInTheDocument();
    expect(within(status).getByText("1tml...w7lc")).toBeInTheDocument();
    expect(within(status).getByText("PUSHBACK_APPEND_FAILED")).toBeInTheDocument();

    expect(
      screen.queryByText("1tmlX52yatPzZD5peOH_oGS46PArKNltZHr28CUzw7lc"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-credentials-json")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-private-key")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-client-email")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-raw-google")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-workspace")).not.toBeInTheDocument();
  });

  it("Google Sheets setup test button triggers api-client POST and shows success", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === googleSheetsStatusUrl) {
        return mockJson(googleSheetsStatus);
      }

      if (url === googleSheetsTestUrl) {
        return mockJson(googleSheetsTestSuccess);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/google-sheets");
    await user.click(await screen.findByRole("button", { name: "Test connection" }));

    await screen.findByLabelText("Test result");
    expect(googleSheetsTestPostCalls(request)).toHaveLength(1);
    expect(screen.getAllByText("succeeded").length).toBeGreaterThan(0);
    expect(screen.getByText("88888888-8888-4888-8888-888888888888")).toBeInTheDocument();
    expect(screen.getByText("Verification!A:E")).toBeInTheDocument();
    expect(screen.queryByText("forbidden-test-raw-google")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-test-workspace")).not.toBeInTheDocument();
  });

  it("locks Google Sheets setup test button during POST and prevents double submit", async () => {
    const user = userEvent.setup();
    let resolveTest: (response: Response) => void = () => undefined;
    const testPromise = new Promise<Response>((resolve) => {
      resolveTest = resolve;
    });
    const request = vi.fn((url: string) => {
      if (url === googleSheetsStatusUrl) {
        return mockJson(googleSheetsStatus);
      }

      if (url === googleSheetsTestUrl) {
        return testPromise;
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/google-sheets");
    await user.dblClick(await screen.findByRole("button", { name: "Test connection" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Testing..." })).toBeDisabled());
    expect(screen.getByRole("status")).toHaveTextContent("Testing Google Sheets connection...");
    expect(googleSheetsTestPostCalls(request)).toHaveLength(1);

    resolveTest(
      new Response(JSON.stringify(googleSheetsTestSuccess), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(await screen.findByLabelText("Test result")).toBeInTheDocument();
  });

  it("shows safe Google Sheets setup failure code and diagnostic trace id", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === googleSheetsStatusUrl) {
        return mockJson(googleSheetsStatus);
      }

      if (url === googleSheetsTestUrl) {
        return mockJson(googleSheetsTestFailure);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/google-sheets");
    await user.click(await screen.findByRole("button", { name: "Test connection" }));

    expect(await screen.findByText("PUSHBACK_AUTH_FAILED")).toBeInTheDocument();
    expect(screen.getByText("99999999-9999-4999-8999-999999999999")).toBeInTheDocument();
    expect(
      screen.getByText("Google Sheets authentication or authorization failed."),
    ).toBeInTheDocument();
    expect(screen.queryByText("forbidden-failure-client-email")).not.toBeInTheDocument();
  });

  it("renders API keys page list with safe key material", async () => {
    const request = vi.fn((url: string) => {
      if (url === workspaceApiKeysUrl) {
        return mockJson(workspaceApiKeys);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/api-keys");

    expect(await screen.findByRole("heading", { name: "API Keys" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Create API keys for public machine-to-machine intake. Keys are shown once.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "API Keys" })).toBeInTheDocument();
    expect(await screen.findByText("Website form production")).toBeInTheDocument();
    expect(screen.getByText("syr_live...abcd")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("May 9, 2026, 10:00 AM")).toBeInTheDocument();
    expect(screen.queryByText("forbidden-hash")).not.toBeInTheDocument();
    expect(screen.queryByText("syr_live_forbidden_plaintext")).not.toBeInTheDocument();
  });

  it("renders API keys empty state", async () => {
    const request = vi.fn((url: string) => {
      if (url === workspaceApiKeysUrl) {
        return mockJson(workspaceApiKeysEmpty);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/api-keys");

    expect(await screen.findByText("No API keys yet.")).toBeInTheDocument();
  });

  it("renders response policy empty state and nav link", async () => {
    const request = vi.fn((url: string) => {
      if (url === responsePolicyUrl) {
        return mockJson(responsePolicyEmpty);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/response-policy");

    expect(await screen.findByRole("heading", { name: "Response Policy" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Response Policy" })).toBeInTheDocument();
    expect(screen.getByText("No response policy configured yet.")).toBeInTheDocument();
    expect(screen.queryByText(/raw json/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/file/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /test/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send|export|approve/i })).not.toBeInTheDocument();
  });

  it("loads existing response policy into the form", async () => {
    const request = vi.fn((url: string) => {
      if (url === responsePolicyUrl) {
        return mockJson(responsePolicyConfigured);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/response-policy");

    expect(await screen.findByDisplayValue("Acme team")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bonjour,")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Heating services.")).toBeInTheDocument();
    expect(screen.getByText("configured")).toBeInTheDocument();
    expect(screen.queryByText("forbidden-response-policy-workspace")).not.toBeInTheDocument();
  });

  it("saves response policy changes with PUT", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string, init?: RequestInit) => {
      if (url === responsePolicyUrl && init?.method === "PUT") {
        return mockJson(responsePolicyConfigured);
      }

      if (url === responsePolicyUrl) {
        return mockJson(responsePolicyEmpty);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/response-policy");
    await user.type(await screen.findByLabelText("Signature"), "Acme team");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        request.mock.calls.some(
          ([url, init]) => url === responsePolicyUrl && init?.method === "PUT",
        ),
      ).toBe(true);
    });
    const putCall = request.mock.calls.find(
      ([url, init]) => url === responsePolicyUrl && init?.method === "PUT",
    );
    expect(JSON.stringify(putCall?.[1])).toContain("Acme team");
    expect(JSON.stringify(putCall?.[1])).not.toContain("workspaceId");
  });

  it("shows response policy validation errors", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === responsePolicyUrl) {
        return mockJson(responsePolicyEmpty);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/response-policy");
    await user.type(
      await screen.findByLabelText("Services, products, pricing notes"),
      `syr_live_${"a".repeat(24)}`,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "Response policy could not be saved. Check field lengths and sensitive material.",
      ),
    ).toBeInTheDocument();
  });

  it("creates an API key, copies it, and clears the one-time value on close", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const request = vi.fn((url: string, init?: RequestInit) => {
      if (url === workspaceApiKeysUrl && init?.method === "POST") {
        return mockJson(workspaceApiKeyCreate);
      }

      if (url === workspaceApiKeysUrl) {
        return mockJson(workspaceApiKeysEmpty);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/api-keys");
    await user.click(await screen.findByRole("button", { name: "Create API key" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Make inbound");
    await user.click(within(dialog).getByRole("button", { name: "Create API key" }));

    expect(await screen.findByText("syr_live_created_wxyz")).toBeInTheDocument();
    expect(
      screen.getByText("Copy this key now. It will never be shown again."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("syr_live_created_wxyz");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("syr_live_created_wxyz")).not.toBeInTheDocument();
    expect(JSON.stringify(request.mock.calls[1]?.[1])).not.toContain("Authorization");
    expect(JSON.stringify(request.mock.calls[1]?.[1])).not.toContain("Bearer");
  });

  it("requires confirmation before revoking an API key and shows revoked state", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    let revoked = false;
    const request = vi.fn((url: string, init?: RequestInit) => {
      if (url === workspaceApiKeyRevokeUrl && init?.method === "POST") {
        revoked = true;
        return mockJson(workspaceApiKeyRevoked);
      }

      if (url === workspaceApiKeysUrl) {
        return mockJson(
          revoked ? { success: true, data: [workspaceApiKeyRevoked.data] } : workspaceApiKeys,
        );
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/api-keys");
    await user.click(await screen.findByRole("button", { name: "Revoke" }));

    expect(confirm).toHaveBeenCalledWith(
      "This immediately breaks integrations using this key. Continue?",
    );
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        workspaceApiKeyRevokeUrl,
        expect.objectContaining({ credentials: "include", method: "POST" }),
      ),
    );
    expect(await screen.findByText("revoked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
  });

  it("renders the Client Install guide, properties, and Apps Script template", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => mockJson(currentUser)),
    );

    renderApp("/app/client-install");

    expect(await screen.findByRole("heading", { name: "Client Install Pack" })).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "API Keys" })
        .some((link) => link.getAttribute("href") === "/app/api-keys"),
    ).toBe(true);
    expect(screen.getByText("SYRANTIS_API_BASE")).toBeInTheDocument();
    expect(screen.getByText("SYRANTIS_API_KEY")).toBeInTheDocument();
    expect(screen.getByText("<created from admin UI>")).toBeInTheDocument();
    expect(screen.getByText("INTAKE_ENABLED")).toBeInTheDocument();
    expect(screen.getByText("EXPORT_ENABLED")).toBeInTheDocument();
    expect(screen.getByText("gmail_apps_script_client")).toBeInTheDocument();
    expect(screen.getByText(/function runSyrantisGmailBridge/)).toBeInTheDocument();
    expect(screen.getByText(/PropertiesService\.getScriptProperties/)).toBeInTheDocument();
    expect(screen.getByText(/GmailApp\.createDraft/)).toBeInTheDocument();
    expect(screen.queryByText(/syr_live_/)).not.toBeInTheDocument();
  });

  it("copies the Apps Script template", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => mockJson(currentUser)),
    );

    renderApp("/app/client-install");
    await user.click(await screen.findByRole("button", { name: "Copy template" }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("runSyrantisGmailBridge"));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("PropertiesService.getScriptProperties"),
    );
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("loads Gmail export status and renders safe DTO fields only", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === gmailExportStatusUrl) {
        return mockJson(gmailExportStatusFixture());
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/gmail-export");
    await user.type(await screen.findByLabelText("Draft ID"), gmailExportDraftId);
    await user.click(screen.getByRole("button", { name: "Load Status" }));

    const status = await screen.findByLabelText("Status");
    expect(within(status).getByText("Gmail export status")).toBeInTheDocument();
    expect(within(status).getAllByText("not_requested").length).toBeGreaterThan(0);
    expect(within(status).getAllByText("not_exported").length).toBeGreaterThan(0);
    expect(within(status).getByText("present")).toBeInTheDocument();
    expect(within(status).getByText("export_not_requested")).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(
      gmailExportStatusUrl,
      expect.objectContaining({ credentials: "include" }),
    );

    for (const forbidden of [
      "forbidden-to-email@example.com",
      "forbidden-body-text",
      "forbidden-html-body",
      "forbidden-contact-name",
      "forbidden-contact-id",
      "forbidden-workspace-id",
      "metadata_json",
      "forbidden-lease-token",
      "forbidden-provider-message-id",
      "forbidden-prompt",
      "forbidden-output",
    ]) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument();
    }
  });

  it("requests Gmail export and refreshes status without workspace material", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    const request = vi.fn((url: string, init?: RequestInit) => {
      if (url === gmailExportStatusUrl) {
        statusCalls += 1;
        return mockJson(
          statusCalls === 1
            ? gmailExportStatusFixture()
            : gmailExportStatusFixture({
                requestStatus: "requested",
                requestedAt: "2026-05-14T10:00:00.000Z",
                requestExpiresAt: "2026-05-15T10:00:00.000Z",
                canExport: true,
                blockingReasons: [],
              }),
        );
      }

      if (url === gmailExportRequestUrl && init?.method === "POST") {
        return mockJson(gmailExportRequestResponse);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/gmail-export");
    await user.type(await screen.findByLabelText("Draft ID"), gmailExportDraftId);
    await user.click(screen.getByRole("button", { name: "Load Status" }));
    await user.click(await screen.findByRole("button", { name: "Request Export" }));

    expect(await screen.findByText("Export request requested.")).toBeInTheDocument();
    await waitFor(() => expect(statusCalls).toBe(2));
    const postCalls = gmailExportPostCalls(request, gmailExportRequestUrl);
    expect(postCalls).toHaveLength(1);
    const [, init] = postCalls[0] ?? [];
    expect(init).toEqual(expect.objectContaining({ credentials: "include", method: "POST" }));
    expect(init).not.toHaveProperty("body");
    expect(JSON.stringify(init)).not.toContain("workspaceId");
    expect(JSON.stringify(init)).not.toContain("Authorization");
    expect(JSON.stringify(init)).not.toContain("Bearer");
    expect(screen.queryByText("forbidden-request-workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-request-lease-token")).not.toBeInTheDocument();
  });

  it("cancels Gmail export before lease and refreshes status", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    const request = vi.fn((url: string, init?: RequestInit) => {
      if (url === gmailExportStatusUrl) {
        statusCalls += 1;
        return mockJson(
          statusCalls === 1
            ? gmailExportStatusFixture({
                requestStatus: "requested",
                requestedAt: "2026-05-14T10:00:00.000Z",
                requestExpiresAt: "2026-05-15T10:00:00.000Z",
                canExport: true,
                blockingReasons: [],
              })
            : gmailExportStatusFixture({
                requestStatus: "cancelled",
                requestedAt: "2026-05-14T10:00:00.000Z",
                requestExpiresAt: "2026-05-15T10:00:00.000Z",
                blockingReasons: ["export_cancelled"],
              }),
        );
      }

      if (url === gmailExportCancelUrl && init?.method === "POST") {
        return mockJson(gmailExportCancelResponse);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/gmail-export");
    await user.type(await screen.findByLabelText("Draft ID"), gmailExportDraftId);
    await user.click(screen.getByRole("button", { name: "Load Status" }));
    await user.click(await screen.findByRole("button", { name: "Cancel Export" }));

    expect(await screen.findByText("Export request cancelled.")).toBeInTheDocument();
    await waitFor(() => expect(statusCalls).toBe(2));
    const postCalls = gmailExportPostCalls(request, gmailExportCancelUrl);
    expect(postCalls).toHaveLength(1);
    const [, init] = postCalls[0] ?? [];
    expect(init).toEqual(expect.objectContaining({ credentials: "include", method: "POST" }));
    expect(init).not.toHaveProperty("body");
    expect(JSON.stringify(init)).not.toContain("workspaceId");
    expect(screen.queryByText("forbidden-cancel-workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-cancel-lease-token")).not.toBeInTheDocument();
  });

  it("disables or hides Gmail export actions for exported and leased states", async () => {
    const user = userEvent.setup();
    let currentResponse = gmailExportStatusFixture({
      requestStatus: "leased",
      leaseStatus: "active",
      leaseExpiresAt: "2026-05-14T10:10:00.000Z",
      blockingReasons: ["active_lease", "export_in_progress"],
    });
    const request = vi.fn((url: string) => {
      if (url === gmailExportStatusUrl) {
        return mockJson(currentResponse);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/gmail-export");
    await user.type(await screen.findByLabelText("Draft ID"), gmailExportDraftId);
    await user.click(screen.getByRole("button", { name: "Load Status" }));

    expect(await screen.findByRole("button", { name: "Cancel Export" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Request Export" })).not.toBeInTheDocument();

    currentResponse = gmailExportStatusFixture({
      requestStatus: "exported",
      exportStatus: "exported",
      exportedAt: "2026-05-14T10:11:00.000Z",
      blockingReasons: ["already_exported"],
    });
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Cancel Export" })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Request Export" })).not.toBeInTheDocument();
  });

  it("renders the Client Dashboard with aggregate cards and safe action links", async () => {
    const request = vi.fn((url: string) => {
      if (url === clientCockpitSummaryUrl) {
        return mockJson(clientCockpitSummary);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/client-dashboard");

    expect(await screen.findByRole("heading", { name: "Client Dashboard" })).toBeInTheDocument();
    expect(
      screen.getByText("Read-only aggregate status for the current Syrantis pipeline."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Leads 24h")).toBeInTheDocument();
    expect(screen.getAllByText("7").length).toBeGreaterThan(0);
    expect(screen.getByText("Scored leads 24h")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Drafts generated 24h")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Pending drafts")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByLabelText("Gmail intake")).toHaveTextContent("activity seen");
    expect(screen.getByLabelText("Gmail export")).toHaveTextContent("requested");
    expect(screen.getByLabelText("Google Sheets")).toHaveTextContent("unknown");
    expect(screen.getByLabelText("System")).toHaveTextContent("busy");
    expect(screen.getByRole("link", { name: "Open Gmail Export Ops" })).toHaveAttribute(
      "href",
      "/app/gmail-export",
    );
    expect(screen.getByRole("link", { name: "Open Client Install" })).toHaveAttribute(
      "href",
      "/app/client-install",
    );
    expect(screen.getAllByText("Draft Queue").length).toBeGreaterThan(0);
    expect(request).toHaveBeenCalledWith(
      clientCockpitSummaryUrl,
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("renders Client Dashboard loading, empty, and error states", async () => {
    let resolveSummary: (response: Response) => void = () => undefined;
    const summaryPromise = new Promise<Response>((resolve) => {
      resolveSummary = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url === clientCockpitSummaryUrl ? summaryPromise : mockJson(currentUser),
      ),
    );

    const loadingRender = renderApp("/app/client-dashboard");
    expect(await screen.findByText("Loading client dashboard...")).toBeInTheDocument();
    resolveSummary(
      new Response(JSON.stringify(clientCockpitSummaryEmpty), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(await screen.findByText("Leads 24h")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("None").length).toBeGreaterThan(0);
    loadingRender.unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url === clientCockpitSummaryUrl ? mockJson({ success: false }, 500) : mockJson(currentUser),
      ),
    );
    renderApp("/app/client-dashboard");
    expect(await screen.findByText("Client dashboard is unavailable.")).toBeInTheDocument();
  });

  it("refreshes the Client Dashboard", async () => {
    const user = userEvent.setup();
    let calls = 0;
    const refreshed = {
      ...clientCockpitSummary,
      data: {
        ...clientCockpitSummary.data,
        pipeline: {
          ...clientCockpitSummary.data.pipeline,
          leads24h: 8,
        },
      },
    };
    const request = vi.fn((url: string) => {
      if (url === clientCockpitSummaryUrl) {
        calls += 1;
        return mockJson(calls === 1 ? clientCockpitSummary : refreshed);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/client-dashboard");
    expect(await screen.findByText("Leads 24h")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(calls).toBe(2));
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("keeps Client Dashboard free of draft input, raw JSON, and forbidden strings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url === clientCockpitSummaryUrl ? mockJson(clientCockpitSummary) : mockJson(currentUser),
      ),
    );

    const { container } = renderApp("/app/client-dashboard");
    expect(await screen.findByRole("heading", { name: "Client Dashboard" })).toBeInTheDocument();

    expect(screen.queryByLabelText("Draft ID")).not.toBeInTheDocument();
    expect(container.querySelector("pre")).toBeNull();
    expect(container.querySelector("code")).toBeNull();

    const text = document.body.textContent ?? "";
    for (const forbidden of [
      "workspaceId",
      "apiKey",
      "leaseToken",
      "metadata_json",
      "payload_json",
      "subject",
      "bodyText",
      "toEmail",
      "fromEmail",
      "prompt",
      "output",
      "forbidden-client-workspace",
      "forbidden-client-api-key",
      "forbidden-client-lease-token",
      "forbidden-client-subject",
      "forbidden-client-body",
      "forbidden-to@example.test",
      "forbidden-from@example.test",
      "forbidden-client-prompt",
      "forbidden-client-output",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("renders the Ops page with health cards, checks, and recent checks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => opsDefaultResponse(url)),
    );

    renderApp("/app/ops");

    expect(await screen.findByRole("heading", { name: "Ops Health" })).toBeInTheDocument();
    expect(screen.getByText(/bounded diagnostic checks only/i)).toBeInTheDocument();
    const cards = await screen.findByLabelText("Health cards");
    expect(within(cards).getByText("API")).toBeInTheDocument();
    expect(within(cards).getByText("Database")).toBeInTheDocument();
    expect(within(cards).getByText("Google Sheets")).toBeInTheDocument();
    expect(within(cards).getByText("Worker Queue")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "API health" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DB health" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google Sheets status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Google Sheets test" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Worker queue summary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Worker Failed Summary" })).toBeInTheDocument();
    const recent = await screen.findByLabelText("Recent checks");
    expect(within(recent).getByText("api-health")).toBeInTheDocument();
    expect(within(recent).getByText("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBeInTheDocument();
  });

  it("Ops check button calls api-client POST and renders success diagnostic trace id", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === opsDbHealthUrl) {
        return mockJson(opsDbHealthSuccess);
      }

      return opsDefaultResponse(url);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/ops");
    await user.click(await screen.findByRole("button", { name: "DB health" }));

    const result = await screen.findByLabelText("Last result");
    expect(opsCheckPostCalls(request, opsDbHealthUrl)).toHaveLength(1);
    expect(within(result).getByText("succeeded")).toBeInTheDocument();
    expect(within(result).getByText("db-health")).toBeInTheDocument();
    expect(within(result).getByText("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).toBeInTheDocument();
    expect(within(result).getAllByText("8").length).toBeGreaterThan(0);
    expect(screen.queryByText("forbidden-run-workspace")).not.toBeInTheDocument();
  });

  it("Ops worker failed summary calls api-client POST and renders safe aggregates", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === opsWorkerFailedUrl) {
        return mockJson(opsWorkerFailedSummary);
      }

      return opsDefaultResponse(url);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/ops");
    await user.click(await screen.findByRole("button", { name: "Worker Failed Summary" }));

    const result = await screen.findByLabelText("Last result");
    expect(opsCheckPostCalls(request, opsWorkerFailedUrl)).toHaveLength(1);
    expect(within(result).getByText("worker-failed-summary")).toBeInTheDocument();
    expect(within(result).getByText("Total failed")).toBeInTheDocument();
    expect(within(result).getAllByText("degraded").length).toBeGreaterThan(0);
    expect(within(result).getByText("review_historical_failures")).toBeInTheDocument();
    expect(within(result).getByText("score_lead")).toBeInTheDocument();
    expect(within(result).getAllByText("5").length).toBeGreaterThan(0);
    expect(screen.queryByText("payload_json")).not.toBeInTheDocument();
    expect(screen.queryByText("job-id")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden stack")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-worker")).not.toBeInTheDocument();
  });

  it("Ops check button locks while running and prevents double submit", async () => {
    const user = userEvent.setup();
    let resolveCheck: (response: Response) => void = () => undefined;
    const checkPromise = new Promise<Response>((resolve) => {
      resolveCheck = resolve;
    });
    const request = vi.fn((url: string) => {
      if (url === opsDbHealthUrl) {
        return checkPromise;
      }

      return opsDefaultResponse(url);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/ops");
    await user.dblClick(await screen.findByRole("button", { name: "DB health" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Running..." })).toBeDisabled());
    expect(screen.getByRole("status")).toHaveTextContent("Running bounded diagnostic check...");
    expect(opsCheckPostCalls(request, opsDbHealthUrl)).toHaveLength(1);

    resolveCheck(
      new Response(JSON.stringify(opsDbHealthSuccess), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(await screen.findByLabelText("Last result")).toBeInTheDocument();
  });

  it("Ops skipped and failure result renders safe error fields only", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === opsGoogleSheetsTestUrl) {
        return mockJson(opsGoogleSheetsSkipped);
      }

      return opsDefaultResponse(url);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/ops");
    await user.click(await screen.findByRole("button", { name: "Google Sheets test" }));

    const result = await screen.findByLabelText("Last result");
    expect(within(result).getByText("skipped")).toBeInTheDocument();
    expect(within(result).getByText("OPS_CHECK_COOLDOWN")).toBeInTheDocument();
    expect(
      within(result).getByText("Google Sheets test was skipped because it ran recently."),
    ).toBeInTheDocument();
    expect(screen.queryByText("forbidden-ops-raw-google")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-ops-private-key")).not.toBeInTheDocument();
  });

  it("Ops page does not render forbidden sensitive strings from responses", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === opsGoogleSheetsTestUrl) {
        return mockJson(opsGoogleSheetsSkipped);
      }

      return opsDefaultResponse(url);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/ops");
    await user.click(await screen.findByRole("button", { name: "Google Sheets test" }));
    await screen.findByLabelText("Last result");

    for (const forbidden of [
      "forbidden-ops-workspace",
      "forbidden-recent-workspace",
      "forbidden-run-workspace",
      "forbidden-ops-raw-google",
      "forbidden-ops-private-key",
      "job-id",
      "forbidden stack",
      "forbidden-worker",
      "metadata_json",
      "payload_json",
    ]) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument();
    }
  });

  it("keeps production fetch calls inside api-client", () => {
    const sourceFiles = [
      "../src/App.tsx",
      "../src/components/AdminShell.tsx",
      "../src/components/ProtectedRoute.tsx",
      "../src/pages/ApiKeysPage.tsx",
      "../src/pages/ClientDashboardPage.tsx",
      "../src/pages/ClientInboxLabPage.tsx",
      "../src/pages/ClientInboxPreviewPage.tsx",
      "../src/pages/ClientInstallPage.tsx",
      "../src/pages/DashboardPage.tsx",
      "../src/pages/GmailExportOpsPage.tsx",
      "../src/pages/GoogleSheetsPage.tsx",
      "../src/pages/LoginPage.tsx",
      "../src/pages/NotFoundPage.tsx",
      "../src/pages/OpsPage.tsx",
      "../src/pages/PushbackPage.tsx",
    ].map((file) => readFileSync(new URL(file, import.meta.url), "utf8"));

    for (const source of sourceFiles) {
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toContain("Authorization");
      expect(source).not.toContain("Bearer");
      expect(source).not.toContain("localStorage");
      expect(source).not.toContain("sessionStorage");
      expect(source).not.toContain("document.cookie");
      expect(source).not.toContain("workspaceId");
    }
  });
});
