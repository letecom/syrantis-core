import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelClientInboxGmailExport,
  createClientUser,
  createWorkspaceApiKey,
  cancelDraftGmailExportRequest,
  getClientInboxMessage,
  getGoogleSheetsSetupStatus,
  getCurrentUser,
  getClientResponsePolicy,
  getDraftQueue,
  getDraftQueueDetail,
  getDraftGmailExportStatus,
  getMailQueue,
  getMailQueueDetail,
  getOpsHealth,
  getRecentOpsChecks,
  getDraftPushbackStatus,
  getEmailSendPushbackStatus,
  listClientInboxMessages,
  listClientUsers,
  listWorkspaceApiKeys,
  login,
  replayEmailSendPushback,
  requestClientInboxGmailExport,
  requestDraftGmailExport,
  revokeWorkspaceApiKey,
  runOpsCheck,
  testGoogleSheetsSetup,
  putClientResponsePolicy,
  updateClientInboxDraft,
} from "../src/lib/api-client";

const userResponse = {
  success: true,
  data: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    workspaceName: "Hidden tenant",
  },
};

const pushbackResponse = {
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
      requestedAt: null,
      sentAt: null,
      updatedAt: null,
    },
    pushback: {
      status: "succeeded",
      latestEventType: "crm_pushback.succeeded",
      latestSource: "system",
      latestAt: null,
      canReplay: true,
      canReplayReason: null,
      replay: {
        emailSendId: "33333333-3333-4333-8333-333333333333",
        endpoint: "/api/email-sends/33333333-3333-4333-8333-333333333333/pushback-replay",
      },
      diagnostic: null,
      counts: {
        totalPushbackEvents: 1,
        manualReplayEvents: 0,
      },
      recentHistory: [],
    },
  },
};

const replayResponse = {
  success: true,
  data: {
    emailSendId: "33333333-3333-4333-8333-333333333333",
    result: "succeeded",
    diagnosticTraceId: "55555555-5555-4555-8555-555555555555",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    providerMessageId: "forbidden-provider",
  },
};

const gmailExportStatusResponse = {
  success: true,
  data: {
    draftId: "44444444-4444-4444-8444-444444444444",
    leadId: "55555555-5555-4555-8555-555555555555",
    draftStatus: "draft",
    hasSubject: true,
    hasBodyText: true,
    recipientStatus: "present",
    requestStatus: "not_requested",
    requestedAt: null,
    requestExpiresAt: null,
    requestSource: null,
    exportStatus: "not_exported",
    exportSource: null,
    exportedAt: null,
    leaseStatus: "none",
    leaseExpiresAt: null,
    canExport: false,
    blockingReasons: ["export_not_requested"],
    sideEffects: {
      emailSendsCount: 0,
      approvalsCount: 0,
    },
    toEmail: "forbidden@example.com",
    bodyText: "forbidden-body",
    htmlBody: "forbidden-html",
    contactName: "forbidden-contact",
    contactId: "forbidden-contact-id",
    workspaceId: "forbidden-workspace",
    metadata_json: { hidden: true },
    leaseToken: "forbidden-lease-token",
    providerMessageId: "forbidden-provider",
  },
};

const gmailExportRequestResponse = {
  success: true,
  data: {
    draftId: "44444444-4444-4444-8444-444444444444",
    leadId: "55555555-5555-4555-8555-555555555555",
    requestStatus: "requested",
    requestedAt: "2026-05-14T10:00:00.000Z",
    requestExpiresAt: "2026-05-15T10:00:00.000Z",
    canExport: true,
    workspaceId: "forbidden-workspace",
    leaseToken: "forbidden-lease-token",
  },
};

const gmailExportCancelResponse = {
  success: true,
  data: {
    draftId: "44444444-4444-4444-8444-444444444444",
    leadId: "55555555-5555-4555-8555-555555555555",
    requestStatus: "cancelled",
    cancelledAt: "2026-05-14T10:05:00.000Z",
    workspaceId: "forbidden-workspace",
    leaseToken: "forbidden-lease-token",
  },
};

const googleSheetsStatusResponse = {
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
    spreadsheetId: "forbidden-full-spreadsheet-id",
    client_email: "forbidden-client-email",
    private_key: "forbidden-private-key",
  },
};

const googleSheetsTestResponse = {
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
    workspaceId: "forbidden-workspace",
    rawGoogle: "forbidden-raw-google",
  },
};

const opsHealthResponse = {
  success: true,
  data: {
    status: "healthy",
    checkedAt: "2026-05-08T10:03:00.000Z",
    api: {
      status: "ok",
      uptimeSeconds: 123,
    },
    db: {
      status: "ok",
      latencyMs: 8,
    },
    googleSheets: {
      status: "ok",
      configured: true,
      lastTestResult: "succeeded",
      lastTestedAt: "2026-05-08T10:00:00.000Z",
    },
    workerQueue: {
      status: "ok",
      pending: 2,
      running: 1,
      failed: 0,
      oldestPendingMinutes: 12,
    },
    workspaceId: "forbidden-workspace",
    rawProvider: "forbidden-provider",
  },
};

const opsRunCheckResponse = {
  success: true,
  data: {
    checkId: "google-sheets-test",
    result: "skipped",
    diagnosticTraceId: "99999999-9999-4999-8999-999999999999",
    runAt: "2026-05-08T10:04:00.000Z",
    durationMs: 4,
    errorCode: "OPS_CHECK_COOLDOWN",
    errorSummary: "Google Sheets test was skipped because it ran recently.",
    data: {
      cooldownMinutes: 5,
      workspaceId: "forbidden-workspace",
      rawGoogle: "forbidden-raw-google",
    },
    metadata_json: {
      hidden: true,
    },
  },
};

const opsWorkerFailedSummaryResponse = {
  success: true,
  data: {
    checkId: "worker-failed-summary",
    result: "succeeded",
    diagnosticTraceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    runAt: "2026-05-08T10:06:00.000Z",
    durationMs: 6,
    errorCode: null,
    errorSummary: null,
    data: {
      totalFailed: 0,
      status: "ok",
      groups: [],
      interpretation: {
        summary: "No failed worker jobs detected.",
        hasOnlyHistoricalFailures: false,
        hasFreshFailures: false,
        recommendedNextAction: "none",
      },
    },
  },
};

const opsRecentChecksResponse = {
  success: true,
  data: {
    checks: [
      {
        checkId: "db-health",
        result: "failed",
        diagnosticTraceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        runAt: "2026-05-08T10:05:00.000Z",
        durationMs: 5000,
        errorCode: "OPS_CHECK_TIMEOUT",
        errorSummary: "Check timed out.",
        workspaceId: "forbidden-workspace",
        payload_json: { hidden: true },
      },
    ],
    limit: 20,
    metadata_json: { hidden: true },
  },
};

const workspaceApiKeysResponse = {
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
      workspaceId: "forbidden-workspace",
      plaintextApiKey: "syr_live_forbidden_plaintext",
    },
  ],
};

const workspaceApiKeyCreateResponse = {
  success: true,
  data: {
    id: "13131313-1313-4131-8131-131313131313",
    name: "New intake",
    keyPrefix: "syr_live",
    last4: "wxyz",
    status: "active",
    lastUsedAt: null,
    revokedAt: null,
    createdAt: "2026-05-09T11:00:00.000Z",
    updatedAt: "2026-05-09T11:00:00.000Z",
    plaintextApiKey: "syr_live_created_wxyz",
    keyHash: "forbidden-hash",
    workspaceId: "forbidden-workspace",
  },
};

const workspaceApiKeyRevokedResponse = {
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
    workspaceId: "forbidden-workspace",
  },
};

const clientUsersResponse = {
  success: true,
  data: [
    {
      id: "14141414-1414-4141-8141-141414141414",
      email: "client@example.com",
      displayName: "Client User",
      role: "client",
      status: "active",
      createdAt: "2026-05-20T10:00:00.000Z",
      updatedAt: "2026-05-20T10:00:00.000Z",
      temporaryPassword: "forbidden-list-password",
      passwordHash: "forbidden-hash",
      workspaceId: "forbidden-workspace",
    },
  ],
};

const clientUserCreateResponse = {
  success: true,
  data: {
    user: {
      id: "15151515-1515-4151-8151-151515151515",
      email: "new-client@example.com",
      displayName: "New Client",
      role: "client",
      status: "active",
      createdAt: "2026-05-20T11:00:00.000Z",
      updatedAt: "2026-05-20T11:00:00.000Z",
      passwordHash: "forbidden-hash",
      workspaceId: "forbidden-workspace",
    },
    temporaryPassword: "temporary-password-shown-once",
  },
};

const draftQueueResponse = {
  success: true,
  data: {
    items: [
      {
        draftId: "abababab-abab-4aba-8aba-abababababab",
        leadId: "bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc",
        createdAt: "2026-05-15T10:00:00.000Z",
        score: {
          scoreBand: "hot",
          score: 88,
          confidence: 74,
          recommendedAction: "Call today.",
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
          bodyPreview: "Bonjour.",
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
        attentionFlags: ["high_score"],
        workspaceId: "forbidden-workspace",
        contactEmail: "forbidden@example.test",
        metadata_json: { hidden: true },
        leaseToken: "forbidden-lease-token",
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

const draftQueueDetailResponse = {
  success: true,
  data: {
    ...draftQueueResponse.data.items[0],
    proposedDraft: {
      subject: "Intervention plomberie",
      bodyText: "Full generated draft body for review.",
      tone: null,
      language: "fr",
      generatedAt: "2026-05-15T10:00:00.000Z",
    },
    workspaceId: "forbidden-detail-workspace",
    metadata_json: { hidden: true },
    prompt: "forbidden-prompt",
    output: "forbidden-output",
  },
};

const mailQueueResponse = {
  success: true,
  data: {
    generatedAt: "2026-05-15T12:00:00.000Z",
    filters: {
      applied: {
        limit: 20,
        offset: 0,
        since: "2026-04-15T12:00:00.000Z",
        includeIgnored: false,
        category: ["service"],
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
        classificationId: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
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
          bodyPreview: "Bonjour.",
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
          attentionFlags: ["high_score"],
          nextBestAction: "wait",
        },
        workspaceId: "forbidden-mail-workspace",
        contactEmail: "forbidden-mail@example.test",
        metadata_json: { hidden: true },
        payload_json: { hidden: true },
        leaseToken: "forbidden-mail-lease-token",
        prompt: "forbidden-mail-prompt",
        output: "forbidden-mail-output",
        rawMetadata: "forbidden-mail-raw-metadata",
      },
    ],
  },
};

const mailQueueDetailResponse = {
  success: true,
  data: {
    ...mailQueueResponse.data.items[0],
    workspace_id: "forbidden-mail-detail-workspace",
    fromEmail: "forbidden-from@example.test",
    providerMessageId: "forbidden-provider-message-id",
    bodyText: "forbidden-full-body",
  },
};

const clientResponsePolicyResponse = {
  success: true,
  data: {
    policy: {
      language: "fr",
      tone: "warm",
      customToneNotes: "Clear and calm.",
      signature: "Acme team",
      defaultGreeting: "Bonjour,",
      defaultClosing: "Bien cordialement,",
      responseStructure: ["acknowledge request"],
      businessRules: ["confirm slots before promising timing"],
      forbiddenClaims: ["do not guarantee exact price"],
      escalationRules: ["complaints require human review"],
      offerNotes: ["lead with diagnostic visit"],
      catalogSummary: "Heating services.",
      exampleReplies: [{ label: "Quote", bodyText: "Bonjour, merci pour votre demande." }],
      updatedAt: "2026-05-16T09:00:00.000Z",
      status: "configured",
      workspaceId: "forbidden-workspace",
      contextJson: { hidden: true },
      createdBy: "forbidden-created-by",
      updatedBy: "forbidden-updated-by",
    },
  },
};

const clientInboxMailItemId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const clientInboxDraftId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const clientInboxLeadId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const clientInboxMessagesResponse = {
  success: true,
  data: {
    generatedAt: "2026-05-18T10:00:00.000Z",
    pagination: {
      limit: 10,
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
        bodyText: "forbidden-list-body",
        fromEmail: "forbidden-list-from@example.test",
        toEmail: "forbidden-list-to@example.test",
        workspaceId: "forbidden-client-inbox-workspace",
      },
    ],
  },
};

const clientInboxMessageDetailResponse = {
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
    workspaceId: "forbidden-detail-workspace",
    rawPayload: "forbidden-raw-payload",
  },
};

const clientInboxDraftEditResponse = {
  success: true,
  data: {
    mailItemId: clientInboxMailItemId,
    draftId: clientInboxDraftId,
    status: "draft",
    updatedAt: "2026-05-18T10:05:00.000Z",
    canExportToGmail: true,
    bodyText: "forbidden-edited-body",
    workspaceId: "forbidden-edit-workspace",
  },
};

function mockResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api client", () => {
  it("uses credentials include for login", async () => {
    const request = vi.fn(() => mockResponse(userResponse));
    vi.stubGlobal("fetch", request);

    await login({ email: "admin@example.com", password: "password123" });

    expect(request).toHaveBeenCalledWith(
      "/auth/login",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
  });

  it("strips unknown auth fields from the current user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => mockResponse(userResponse)),
    );

    await expect(getCurrentUser()).resolves.toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
    });
  });

  it("calls the email send pushback status endpoint", async () => {
    const request = vi.fn(() => mockResponse(pushbackResponse));
    vi.stubGlobal("fetch", request);

    await getEmailSendPushbackStatus("33333333-3333-4333-8333-333333333333");

    expect(request).toHaveBeenCalledWith(
      "/api/email-sends/33333333-3333-4333-8333-333333333333/pushback-status",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("calls the draft pushback status endpoint", async () => {
    const request = vi.fn(() => mockResponse(pushbackResponse));
    vi.stubGlobal("fetch", request);

    await getDraftPushbackStatus("44444444-4444-4444-8444-444444444444");

    expect(request).toHaveBeenCalledWith(
      "/api/drafts/44444444-4444-4444-8444-444444444444/pushback-status",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("calls the draft Gmail export status endpoint and strips unsafe fields", async () => {
    const request = vi.fn(() => mockResponse(gmailExportStatusResponse));
    vi.stubGlobal("fetch", request);

    await expect(
      getDraftGmailExportStatus("44444444-4444-4444-8444-444444444444"),
    ).resolves.toEqual({
      draftId: "44444444-4444-4444-8444-444444444444",
      leadId: "55555555-5555-4555-8555-555555555555",
      draftStatus: "draft",
      hasSubject: true,
      hasBodyText: true,
      recipientStatus: "present",
      requestStatus: "not_requested",
      requestedAt: null,
      requestExpiresAt: null,
      requestSource: null,
      exportStatus: "not_exported",
      exportSource: null,
      exportedAt: null,
      leaseStatus: "none",
      leaseExpiresAt: null,
      canExport: false,
      blockingReasons: ["export_not_requested"],
      sideEffects: {
        emailSendsCount: 0,
        approvalsCount: 0,
      },
    });
    expect(request).toHaveBeenCalledWith(
      "/api/drafts/44444444-4444-4444-8444-444444444444/gmail-export-status",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("calls the client draft queue endpoint and strips unsafe fields", async () => {
    const request = vi.fn(() => mockResponse(draftQueueResponse));
    vi.stubGlobal("fetch", request);

    await expect(
      getDraftQueue({ limit: 20, scoreBand: "hot", attentionRequired: true }),
    ).resolves.toMatchObject({
      items: [
        {
          draftId: "abababab-abab-4aba-8aba-abababababab",
          draftPreview: {
            subjectPreview: "Intervention plomberie",
            bodyPreview: "Bonjour.",
          },
          score: {
            scoreBand: "hot",
          },
        },
      ],
      summary: {
        pendingReview: 1,
      },
    });
    expect(request).toHaveBeenCalledWith(
      "/api/client/draft-queue?limit=20&scoreBand=hot&attentionRequired=true",
      expect.objectContaining({ credentials: "include" }),
    );
    const serialized = JSON.stringify(await getDraftQueue({ limit: 20 }));
    expect(serialized).not.toContain("forbidden-workspace");
    expect(serialized).not.toContain("forbidden@example.test");
    expect(serialized).not.toContain("forbidden-lease-token");
  });

  it("calls the client draft queue detail endpoint and keeps only generated draft body", async () => {
    const request = vi.fn(() => mockResponse(draftQueueDetailResponse));
    vi.stubGlobal("fetch", request);

    await expect(
      getDraftQueueDetail("abababab-abab-4aba-8aba-abababababab"),
    ).resolves.toMatchObject({
      draftId: "abababab-abab-4aba-8aba-abababababab",
      proposedDraft: {
        bodyText: "Full generated draft body for review.",
      },
    });
    expect(request).toHaveBeenCalledWith(
      "/api/client/draft-queue/abababab-abab-4aba-8aba-abababababab",
      expect.objectContaining({ credentials: "include" }),
    );
    const serialized = JSON.stringify(
      await getDraftQueueDetail("abababab-abab-4aba-8aba-abababababab"),
    );
    expect(serialized).not.toContain("forbidden-detail-workspace");
    expect(serialized).not.toContain("forbidden-prompt");
    expect(serialized).not.toContain("forbidden-output");
  });

  it("calls the client mail queue endpoint and strips unsafe fields", async () => {
    const request = vi.fn(() => mockResponse(mailQueueResponse));
    vi.stubGlobal("fetch", request);

    await expect(
      getMailQueue({
        limit: 20,
        includeIgnored: true,
        category: ["service", "quote"],
        action: ["create_lead"],
        scoreBand: ["hot"],
        contactStatus: ["returning"],
        hasDraft: true,
        exportStatus: ["requested"],
        pipelineState: ["export_requested"],
        attentionRequired: true,
      }),
    ).resolves.toMatchObject({
      items: [
        {
          classificationId: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
          classification: { category: "service" },
          draft: { bodyPreview: "Bonjour." },
        },
      ],
      summary: {
        totalClassified: 1,
      },
    });
    expect(request).toHaveBeenCalledWith(
      "/api/client/mail-queue?limit=20&includeIgnored=true&category=service%2Cquote&action=create_lead&scoreBand=hot&contactStatus=returning&exportStatus=requested&pipelineState=export_requested&hasDraft=true&attentionRequired=true",
      expect.objectContaining({ credentials: "include" }),
    );
    const serialized = JSON.stringify(await getMailQueue({ limit: 20 }));
    expect(serialized).not.toContain("forbidden-mail-workspace");
    expect(serialized).not.toContain("forbidden-mail@example.test");
    expect(serialized).not.toContain("forbidden-mail-lease-token");
    expect(serialized).not.toContain("forbidden-mail-prompt");
  });

  it("calls the client mail queue detail endpoint without raw mail body", async () => {
    const request = vi.fn(() => mockResponse(mailQueueDetailResponse));
    vi.stubGlobal("fetch", request);

    await expect(getMailQueueDetail("cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd")).resolves.toMatchObject(
      {
        classificationId: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
        draft: {
          bodyPreview: "Bonjour.",
        },
      },
    );
    expect(request).toHaveBeenCalledWith(
      "/api/client/mail-queue/cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
      expect.objectContaining({ credentials: "include" }),
    );
    const serialized = JSON.stringify(
      await getMailQueueDetail("cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd"),
    );
    expect(serialized).not.toContain("forbidden-mail-detail-workspace");
    expect(serialized).not.toContain("forbidden-from@example.test");
    expect(serialized).not.toContain("forbidden-full-body");
  });

  it("calls the client Inbox list endpoint and keeps v1 list fields safe", async () => {
    const request = vi.fn(() => mockResponse(clientInboxMessagesResponse));
    vi.stubGlobal("fetch", request);

    const result = await listClientInboxMessages({
      tab: "ignored",
      sort: "urgency",
      limit: 10,
    });

    expect(result.items[0]).toMatchObject({
      mailItemId: clientInboxMailItemId,
      subject: null,
      snippet: null,
      subjectPreview: "Synthetic quote request",
      snippetPreview: "Synthetic safe list preview",
      scoreBand: "hot",
      pipelineState: "draft_ready",
    });
    expect(request).toHaveBeenCalledWith(
      "/api/client/inbox/messages?tab=ignored&sort=urgency&limit=10",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(JSON.stringify(result)).not.toContain("forbidden-list-body");
    expect(JSON.stringify(result)).not.toContain("forbidden-list-from@example.test");
    expect(JSON.stringify(result)).not.toContain("forbidden-client-inbox-workspace");
  });

  it("calls the client Inbox detail endpoint and keeps the approved detail body", async () => {
    const request = vi.fn(() => mockResponse(clientInboxMessageDetailResponse));
    vi.stubGlobal("fetch", request);

    const result = await getClientInboxMessage(clientInboxMailItemId);

    expect(result.mail.bodyText).toBe("Synthetic clean Gmail pilot body for admin validation.");
    expect(result.mail.fromEmail).toBe("sender@example.test");
    expect(result.mail.toEmail).toBe("pilot@example.test");
    expect(request).toHaveBeenCalledWith(
      `/api/client/inbox/messages/${clientInboxMailItemId}`,
      expect.objectContaining({ credentials: "include" }),
    );
    expect(JSON.stringify(result)).not.toContain("forbidden-detail-workspace");
    expect(JSON.stringify(result)).not.toContain("forbidden-raw-payload");
  });

  it("updates a client Inbox draft through the mail item wrapper", async () => {
    const request = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      mockResponse(clientInboxDraftEditResponse),
    );
    vi.stubGlobal("fetch", request);

    await expect(
      updateClientInboxDraft(clientInboxMailItemId, {
        subject: "Updated synthetic subject",
        bodyText: "Updated synthetic body",
      }),
    ).resolves.toEqual({
      mailItemId: clientInboxMailItemId,
      draftId: clientInboxDraftId,
      status: "draft",
      updatedAt: "2026-05-18T10:05:00.000Z",
      canExportToGmail: true,
    });
    expect(request).toHaveBeenCalledWith(
      `/api/client/inbox/messages/${clientInboxMailItemId}/draft`,
      expect.objectContaining({
        credentials: "include",
        method: "PATCH",
      }),
    );
    const init = request.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.stringify(init?.body)).toContain("Updated synthetic subject");
    expect(JSON.stringify(init)).not.toContain("workspaceId");
    expect(JSON.stringify(init)).not.toContain("Authorization");
  });

  it("requests and cancels Gmail export through client Inbox wrappers", async () => {
    const request = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url) => {
      if (url.endsWith("/gmail-export-cancel")) {
        return mockResponse(gmailExportCancelResponse);
      }

      return mockResponse(gmailExportRequestResponse);
    });
    vi.stubGlobal("fetch", request);

    await expect(requestClientInboxGmailExport(clientInboxMailItemId)).resolves.toMatchObject({
      requestStatus: "requested",
      canExport: true,
    });
    await expect(cancelClientInboxGmailExport(clientInboxMailItemId)).resolves.toMatchObject({
      requestStatus: "cancelled",
    });

    expect(request).toHaveBeenCalledWith(
      `/api/client/inbox/messages/${clientInboxMailItemId}/gmail-export-request`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    expect(request).toHaveBeenCalledWith(
      `/api/client/inbox/messages/${clientInboxMailItemId}/gmail-export-cancel`,
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    expect(request.mock.calls[0]?.[1]).not.toHaveProperty("body");
    expect(request.mock.calls[1]?.[1]).not.toHaveProperty("body");
  });

  it("loads client response policy through the session backend route", async () => {
    const request = vi.fn(() => mockResponse(clientResponsePolicyResponse));
    vi.stubGlobal("fetch", request);

    const result = await getClientResponsePolicy();

    expect(result).toMatchObject({
      language: "fr",
      tone: "warm",
      status: "configured",
      signature: "Acme team",
    });
    expect(request).toHaveBeenCalledWith(
      "/api/client/response-policy",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(JSON.stringify(result)).not.toContain("workspaceId");
    expect(JSON.stringify(result)).not.toContain("contextJson");
  });

  it("saves client response policy without tenant material", async () => {
    const request = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      mockResponse(clientResponsePolicyResponse),
    );
    vi.stubGlobal("fetch", request);

    await expect(
      putClientResponsePolicy({
        language: "fr",
        tone: "warm",
        customToneNotes: null,
        signature: "Acme team",
        defaultGreeting: "Bonjour,",
        defaultClosing: "Bien cordialement,",
        responseStructure: ["acknowledge request"],
        businessRules: ["confirm slots before promising timing"],
        forbiddenClaims: ["do not guarantee exact price"],
        escalationRules: ["complaints require human review"],
        offerNotes: ["lead with diagnostic visit"],
        catalogSummary: "Heating services.",
        exampleReplies: [{ label: "Quote", bodyText: "Bonjour, merci pour votre demande." }],
      }),
    ).resolves.toMatchObject({ status: "configured" });
    expect(request).toHaveBeenCalledWith(
      "/api/client/response-policy",
      expect.objectContaining({
        credentials: "include",
        method: "PUT",
      }),
    );
    expect(JSON.stringify(request.mock.calls[0]?.[1])).not.toContain("workspaceId");
    expect(JSON.stringify(request.mock.calls[0]?.[1])).not.toContain("Authorization");
  });

  it("requests draft Gmail export without client workspace material", async () => {
    const request = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      mockResponse(gmailExportRequestResponse),
    );
    vi.stubGlobal("fetch", request);

    await expect(requestDraftGmailExport("44444444-4444-4444-8444-444444444444")).resolves.toEqual({
      draftId: "44444444-4444-4444-8444-444444444444",
      leadId: "55555555-5555-4555-8555-555555555555",
      requestStatus: "requested",
      requestedAt: "2026-05-14T10:00:00.000Z",
      requestExpiresAt: "2026-05-15T10:00:00.000Z",
      canExport: true,
    });
    expect(request).toHaveBeenCalledWith(
      "/api/drafts/44444444-4444-4444-8444-444444444444/gmail-export-request",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    const init = request.mock.calls[0]?.[1];
    expect(init).not.toHaveProperty("body");
    expect(JSON.stringify(init)).not.toContain("workspaceId");
    expect(JSON.stringify(init)).not.toContain("Authorization");
    expect(JSON.stringify(init)).not.toContain("Bearer");
  });

  it("cancels draft Gmail export without client workspace material", async () => {
    const request = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      mockResponse(gmailExportCancelResponse),
    );
    vi.stubGlobal("fetch", request);

    await expect(
      cancelDraftGmailExportRequest("44444444-4444-4444-8444-444444444444"),
    ).resolves.toEqual({
      draftId: "44444444-4444-4444-8444-444444444444",
      leadId: "55555555-5555-4555-8555-555555555555",
      requestStatus: "cancelled",
      cancelledAt: "2026-05-14T10:05:00.000Z",
    });
    expect(request).toHaveBeenCalledWith(
      "/api/drafts/44444444-4444-4444-8444-444444444444/gmail-export-cancel",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    const init = request.mock.calls[0]?.[1];
    expect(init).not.toHaveProperty("body");
    expect(JSON.stringify(init)).not.toContain("workspaceId");
    expect(JSON.stringify(init)).not.toContain("Authorization");
    expect(JSON.stringify(init)).not.toContain("Bearer");
  });

  it("calls the email send pushback replay endpoint without client workspace material", async () => {
    const request = vi.fn((url: string, init?: RequestInit) => {
      void url;
      void init;
      return mockResponse(replayResponse);
    });
    vi.stubGlobal("fetch", request);

    await expect(replayEmailSendPushback("33333333-3333-4333-8333-333333333333")).resolves.toEqual({
      emailSendId: "33333333-3333-4333-8333-333333333333",
      result: "succeeded",
      diagnosticTraceId: "55555555-5555-4555-8555-555555555555",
    });

    expect(request).toHaveBeenCalledWith(
      "/api/email-sends/33333333-3333-4333-8333-333333333333/pushback-replay",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
      }),
    );
    const firstCall = request.mock.calls[0] as [string, RequestInit?] | undefined;
    expect(firstCall).toBeDefined();
    const init = firstCall?.[1];
    expect(init).not.toHaveProperty("body");
    expect(init).not.toHaveProperty("headers.Authorization");
    expect(JSON.stringify(init)).not.toContain("workspaceId");
    expect(JSON.stringify(init)).not.toContain("Bearer");
  });

  it("calls the Google Sheets setup status endpoint and strips unsafe fields", async () => {
    const request = vi.fn(() => mockResponse(googleSheetsStatusResponse));
    vi.stubGlobal("fetch", request);

    await expect(getGoogleSheetsSetupStatus()).resolves.toEqual({
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
    });
    expect(request).toHaveBeenCalledWith(
      "/api/integrations/google-sheets/setup-status",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("calls the Google Sheets setup test endpoint without client workspace material", async () => {
    const request = vi.fn(() => mockResponse(googleSheetsTestResponse));
    vi.stubGlobal("fetch", request);

    await expect(testGoogleSheetsSetup()).resolves.toEqual({
      result: "succeeded",
      diagnosticTraceId: "88888888-8888-4888-8888-888888888888",
      testedAt: "2026-05-07T10:01:00.000Z",
      errorCode: null,
      errorSummary: null,
      verification: {
        rangeTested: "Verification!A:E",
        rowsAppended: 1,
      },
    });
    expect(request).toHaveBeenCalledWith(
      "/api/integrations/google-sheets/setup-test",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
      }),
    );
    const firstCall = request.mock.calls[0] as [string, RequestInit?] | undefined;
    expect(firstCall).toBeDefined();
    const init = firstCall?.[1];
    expect(init).not.toHaveProperty("body");
    expect(JSON.stringify(init)).not.toContain("workspaceId");
    expect(JSON.stringify(init)).not.toContain("Authorization");
    expect(JSON.stringify(init)).not.toContain("Bearer");
  });

  it("calls the Ops health endpoint and strips unsafe fields", async () => {
    const request = vi.fn(() => mockResponse(opsHealthResponse));
    vi.stubGlobal("fetch", request);

    await expect(getOpsHealth()).resolves.toEqual({
      status: "healthy",
      checkedAt: "2026-05-08T10:03:00.000Z",
      api: {
        status: "ok",
        uptimeSeconds: 123,
      },
      db: {
        status: "ok",
        latencyMs: 8,
      },
      googleSheets: {
        status: "ok",
        configured: true,
        lastTestResult: "succeeded",
        lastTestedAt: "2026-05-08T10:00:00.000Z",
      },
      workerQueue: {
        status: "ok",
        pending: 2,
        running: 1,
        failed: 0,
        oldestPendingMinutes: 12,
      },
    });
    expect(request).toHaveBeenCalledWith(
      "/api/admin/ops/health",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("calls an Ops check endpoint without client workspace material", async () => {
    const request = vi.fn(() => mockResponse(opsRunCheckResponse));
    vi.stubGlobal("fetch", request);

    await expect(runOpsCheck("google-sheets-test")).resolves.toEqual({
      checkId: "google-sheets-test",
      result: "skipped",
      diagnosticTraceId: "99999999-9999-4999-8999-999999999999",
      runAt: "2026-05-08T10:04:00.000Z",
      durationMs: 4,
      errorCode: "OPS_CHECK_COOLDOWN",
      errorSummary: "Google Sheets test was skipped because it ran recently.",
      data: {
        cooldownMinutes: 5,
        workspaceId: "forbidden-workspace",
        rawGoogle: "forbidden-raw-google",
      },
    });
    expect(request).toHaveBeenCalledWith(
      "/api/admin/ops/checks/google-sheets-test",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
      }),
    );
    const firstCall = request.mock.calls[0] as [string, RequestInit?] | undefined;
    expect(firstCall).toBeDefined();
    const init = firstCall?.[1];
    expect(init).not.toHaveProperty("body");
    expect(JSON.stringify(init)).not.toContain("workspaceId");
    expect(JSON.stringify(init)).not.toContain("Authorization");
    expect(JSON.stringify(init)).not.toContain("Bearer");
  });

  it("calls the worker failed summary Ops check endpoint", async () => {
    const request = vi.fn(() => mockResponse(opsWorkerFailedSummaryResponse));
    vi.stubGlobal("fetch", request);

    await expect(runOpsCheck("worker-failed-summary")).resolves.toEqual({
      checkId: "worker-failed-summary",
      result: "succeeded",
      diagnosticTraceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      runAt: "2026-05-08T10:06:00.000Z",
      durationMs: 6,
      errorCode: null,
      errorSummary: null,
      data: {
        totalFailed: 0,
        status: "ok",
        groups: [],
        interpretation: {
          summary: "No failed worker jobs detected.",
          hasOnlyHistoricalFailures: false,
          hasFreshFailures: false,
          recommendedNextAction: "none",
        },
      },
    });
    expect(request).toHaveBeenCalledWith(
      "/api/admin/ops/checks/worker-failed-summary",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
      }),
    );
  });

  it("lists workspace API keys and strips unsafe fields", async () => {
    const request = vi.fn(() => mockResponse(workspaceApiKeysResponse));
    vi.stubGlobal("fetch", request);

    await expect(listWorkspaceApiKeys()).resolves.toEqual([
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
      },
    ]);
    expect(request).toHaveBeenCalledWith(
      "/api/workspace-api-keys",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("creates a workspace API key and returns plaintext only from create", async () => {
    const request = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      mockResponse(workspaceApiKeyCreateResponse),
    );
    vi.stubGlobal("fetch", request);

    await expect(createWorkspaceApiKey({ name: "New intake" })).resolves.toEqual({
      id: "13131313-1313-4131-8131-131313131313",
      name: "New intake",
      keyPrefix: "syr_live",
      last4: "wxyz",
      status: "active",
      lastUsedAt: null,
      revokedAt: null,
      createdAt: "2026-05-09T11:00:00.000Z",
      updatedAt: "2026-05-09T11:00:00.000Z",
      plaintextApiKey: "syr_live_created_wxyz",
    });
    expect(request).toHaveBeenCalledWith(
      "/api/workspace-api-keys",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        body: JSON.stringify({ name: "New intake" }),
      }),
    );
    expect(JSON.stringify(request.mock.calls[0]?.[1])).not.toContain("workspaceId");
    expect(JSON.stringify(request.mock.calls[0]?.[1])).not.toContain("Authorization");
  });

  it("lists client users and strips unsafe fields", async () => {
    const request = vi.fn(() => mockResponse(clientUsersResponse));
    vi.stubGlobal("fetch", request);

    await expect(listClientUsers()).resolves.toEqual([
      {
        id: "14141414-1414-4141-8141-141414141414",
        email: "client@example.com",
        displayName: "Client User",
        role: "client",
        status: "active",
        createdAt: "2026-05-20T10:00:00.000Z",
        updatedAt: "2026-05-20T10:00:00.000Z",
      },
    ]);
    expect(request).toHaveBeenCalledWith(
      "/api/admin/client-users",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("creates a client user without sending role or tenant material", async () => {
    const request = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      mockResponse(clientUserCreateResponse),
    );
    vi.stubGlobal("fetch", request);

    await expect(
      createClientUser({ email: "New-Client@Example.com", displayName: "New Client" }),
    ).resolves.toEqual({
      user: {
        id: "15151515-1515-4151-8151-151515151515",
        email: "new-client@example.com",
        displayName: "New Client",
        role: "client",
        status: "active",
        createdAt: "2026-05-20T11:00:00.000Z",
        updatedAt: "2026-05-20T11:00:00.000Z",
      },
      temporaryPassword: "temporary-password-shown-once",
    });
    expect(request).toHaveBeenCalledWith(
      "/api/admin/client-users",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        body: JSON.stringify({
          email: "new-client@example.com",
          displayName: "New Client",
        }),
      }),
    );
    expect(JSON.stringify(request.mock.calls[0]?.[1])).not.toContain("role");
    expect(JSON.stringify(request.mock.calls[0]?.[1])).not.toContain("workspaceId");
    expect(JSON.stringify(request.mock.calls[0]?.[1])).not.toContain("Authorization");
  });

  it("revokes a workspace API key without sending client tenant material", async () => {
    const request = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      mockResponse(workspaceApiKeyRevokedResponse),
    );
    vi.stubGlobal("fetch", request);

    await expect(revokeWorkspaceApiKey("12121212-1212-4121-8121-121212121212")).resolves.toEqual({
      id: "12121212-1212-4121-8121-121212121212",
      name: "Website form production",
      keyPrefix: "syr_live",
      last4: "abcd",
      status: "revoked",
      lastUsedAt: "2026-05-09T10:00:00.000Z",
      revokedAt: "2026-05-09T12:00:00.000Z",
      createdAt: "2026-05-09T09:00:00.000Z",
      updatedAt: "2026-05-09T12:00:00.000Z",
    });
    expect(request).toHaveBeenCalledWith(
      "/api/workspace-api-keys/12121212-1212-4121-8121-121212121212/revoke",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
      }),
    );
    expect(JSON.stringify(request.mock.calls[0]?.[1])).not.toContain("workspaceId");
    expect(JSON.stringify(request.mock.calls[0]?.[1])).not.toContain("Bearer");
  });

  it("calls the recent Ops checks endpoint with bounded query params", async () => {
    const request = vi.fn(() => mockResponse(opsRecentChecksResponse));
    vi.stubGlobal("fetch", request);

    await expect(getRecentOpsChecks({ limit: 20, checkId: "db-health" })).resolves.toEqual({
      checks: [
        {
          checkId: "db-health",
          result: "failed",
          diagnosticTraceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          runAt: "2026-05-08T10:05:00.000Z",
          durationMs: 5000,
          errorCode: "OPS_CHECK_TIMEOUT",
          errorSummary: "Check timed out.",
        },
      ],
      limit: 20,
    });
    expect(request).toHaveBeenCalledWith(
      "/api/admin/ops/checks/recent?limit=20&checkId=db-health",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
