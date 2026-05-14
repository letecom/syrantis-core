import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createWorkspaceApiKey,
  cancelDraftGmailExport,
  getGoogleSheetsSetupStatus,
  getCurrentUser,
  getDraftGmailExportStatus,
  getOpsHealth,
  getRecentOpsChecks,
  getDraftPushbackStatus,
  getEmailSendPushbackStatus,
  listWorkspaceApiKeys,
  login,
  replayEmailSendPushback,
  requestDraftGmailExport,
  revokeWorkspaceApiKey,
  runOpsCheck,
  testGoogleSheetsSetup,
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

    await expect(cancelDraftGmailExport("44444444-4444-4444-8444-444444444444")).resolves.toEqual({
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
