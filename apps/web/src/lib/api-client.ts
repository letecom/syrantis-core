import { z } from "zod";

import {
  ClientCockpitSummaryResponseSchema,
  DraftQueueDetailResponseSchema,
  DraftQueueResponseSchema,
} from "@syrantis/shared";

const { stringify: encodeJsonBody } = JSON;

const loginSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().nullable(),
    role: z.enum(["founder", "admin", "operator", "client"]),
  }),
});

const logoutSuccessSchema = z.object({
  success: z.literal(true),
});

const pushbackStatusResponseSchema = z.object({
  target: z.object({
    type: z.enum(["draft", "email_send"]),
    draftId: z.string().uuid().nullable(),
    emailSendId: z.string().uuid().nullable(),
    resolvedFromDraft: z.boolean(),
  }),
  send: z.object({
    exists: z.boolean(),
    status: z.string().nullable(),
    deliveryStatus: z.string().nullable(),
    deliveryProofAvailable: z.boolean(),
    requestedAt: z.string().nullable(),
    sentAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
  }),
  pushback: z.object({
    status: z.string(),
    latestEventType: z.string().nullable(),
    latestSource: z.string().nullable(),
    latestAt: z.string().nullable(),
    canReplay: z.boolean(),
    canReplayReason: z.string().nullable(),
    replay: z.object({
      emailSendId: z.string().uuid().nullable(),
      endpoint: z.string().nullable(),
    }),
    diagnostic: z
      .object({
        diagnosticTraceId: z.string().uuid().nullable(),
        errorCode: z.string().nullable(),
        errorSummary: z.string().nullable(),
      })
      .nullable(),
    counts: z.object({
      totalPushbackEvents: z.number().int().min(0),
      manualReplayEvents: z.number().int().min(0),
    }),
    recentHistory: z.array(
      z.object({
        eventType: z.string(),
        source: z.string(),
        occurredAt: z.string(),
        diagnosticTraceId: z.string().uuid().nullable(),
        errorCode: z.string().nullable(),
      }),
    ),
  }),
});

const pushbackStatusSuccessSchema = z.object({
  success: z.literal(true),
  data: pushbackStatusResponseSchema,
});

const emailSendPushbackReplaySuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    emailSendId: z.string().uuid(),
    result: z.enum(["succeeded", "failed", "skipped"]),
    diagnosticTraceId: z.string().uuid(),
  }),
});

const googleSheetsSetupStatusSchema = z.object({
  enabled: z.boolean(),
  configured: z.boolean(),
  credentialsConfigured: z.boolean(),
  spreadsheetConfigured: z.boolean(),
  spreadsheetIdMasked: z.string().nullable(),
  pushbackRangeConfigured: z.boolean(),
  verificationRangeConfigured: z.boolean(),
  pushbackRangeLabel: z.string().nullable(),
  verificationRangeLabel: z.string().nullable(),
  lastTest: z
    .object({
      result: z.enum(["succeeded", "failed", "skipped"]),
      diagnosticTraceId: z.string().uuid(),
      errorCode: z.string().nullable(),
      testedAt: z.string(),
    })
    .nullable(),
});

const googleSheetsSetupStatusSuccessSchema = z.object({
  success: z.literal(true),
  data: googleSheetsSetupStatusSchema,
});

const googleSheetsSetupTestSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    result: z.enum(["succeeded", "failed", "skipped"]),
    diagnosticTraceId: z.string().uuid(),
    testedAt: z.string(),
    errorCode: z.string().nullable(),
    errorSummary: z.string().nullable(),
    verification: z
      .object({
        rangeTested: z.string(),
        rowsAppended: z.number().int().min(0),
      })
      .nullable(),
  }),
});

const opsCheckIdSchema = z.enum([
  "api-health",
  "db-health",
  "google-sheets-status",
  "google-sheets-test",
  "worker-queue-summary",
  "worker-failed-summary",
]);

const opsResultSchema = z.enum(["succeeded", "failed", "skipped"]);

const opsHealthSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    status: z.enum(["healthy", "degraded", "unhealthy"]),
    checkedAt: z.string(),
    api: z.object({
      status: z.literal("ok"),
      uptimeSeconds: z.number().min(0),
    }),
    db: z.object({
      status: z.enum(["ok", "error"]),
      latencyMs: z.number().int().min(0).nullable(),
    }),
    googleSheets: z.object({
      status: z.enum(["ok", "disabled", "unconfigured", "error"]),
      configured: z.boolean(),
      lastTestResult: opsResultSchema.nullable(),
      lastTestedAt: z.string().nullable(),
    }),
    workerQueue: z.object({
      status: z.enum(["ok", "degraded", "error"]),
      pending: z.number().int().min(0).nullable(),
      running: z.number().int().min(0).nullable(),
      failed: z.number().int().min(0).nullable(),
      oldestPendingMinutes: z.number().int().min(0).nullable(),
    }),
  }),
});

const opsRunCheckSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    checkId: opsCheckIdSchema,
    result: opsResultSchema,
    diagnosticTraceId: z.string().uuid(),
    runAt: z.string(),
    durationMs: z.number().int().min(0),
    errorCode: z.string().nullable(),
    errorSummary: z.string().nullable(),
    data: z.record(z.unknown()),
  }),
});

const opsRecentChecksSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    checks: z.array(
      z.object({
        checkId: opsCheckIdSchema,
        result: opsResultSchema,
        diagnosticTraceId: z.string().uuid(),
        runAt: z.string(),
        durationMs: z.number().int().min(0),
        errorCode: z.string().nullable(),
        errorSummary: z.string().nullable(),
      }),
    ),
    limit: z.number().int().min(1).max(50),
  }),
});

const gmailExportRecipientStatusSchema = z.enum([
  "present",
  "missing_lead",
  "missing_contact",
  "missing_email",
  "invalid_email",
]);

const gmailExportStatusSchema = z.enum(["not_exported", "leased", "lease_expired", "exported"]);

const gmailExportLeaseStatusSchema = z.enum(["none", "active", "expired"]);

const gmailExportRequestStatusSchema = z.enum([
  "not_requested",
  "requested",
  "request_expired",
  "cancelled",
  "leased",
  "exported",
]);

const gmailExportBlockingReasonSchema = z.enum([
  "draft_not_ready",
  "missing_subject",
  "missing_body",
  "missing_lead",
  "missing_contact",
  "missing_email",
  "invalid_email",
  "active_lease",
  "already_exported",
  "has_email_sends",
  "export_not_requested",
  "export_request_expired",
  "export_cancelled",
  "export_in_progress",
]);

const gmailExportStatusSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    draftId: z.string().uuid(),
    leadId: z.string().uuid().nullable(),
    draftStatus: z.string(),
    hasSubject: z.boolean(),
    hasBodyText: z.boolean(),
    recipientStatus: gmailExportRecipientStatusSchema,
    requestStatus: gmailExportRequestStatusSchema,
    requestedAt: z.string().datetime().nullable(),
    requestExpiresAt: z.string().datetime().nullable(),
    requestSource: z.literal("admin_api").nullable(),
    exportStatus: gmailExportStatusSchema,
    exportSource: z.literal("apps_script").nullable(),
    exportedAt: z.string().datetime().nullable(),
    leaseStatus: gmailExportLeaseStatusSchema,
    leaseExpiresAt: z.string().datetime().nullable(),
    canExport: z.boolean(),
    blockingReasons: z.array(gmailExportBlockingReasonSchema),
    sideEffects: z.object({
      emailSendsCount: z.number().int().min(0),
      approvalsCount: z.number().int().min(0),
    }),
  }),
});

const gmailExportRequestResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    draftId: z.string().uuid(),
    leadId: z.string().uuid(),
    requestStatus: z.enum(["requested", "already_requested"]),
    requestedAt: z.string().datetime(),
    requestExpiresAt: z.string().datetime(),
    canExport: z.boolean(),
  }),
});

const gmailExportCancelResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    draftId: z.string().uuid(),
    leadId: z.string().uuid(),
    requestStatus: z.literal("cancelled"),
    cancelledAt: z.string().datetime(),
  }),
});

const workspaceApiKeyStatusSchema = z.enum(["active", "revoked"]);

const workspaceApiKeySafeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  last4: z.string(),
  status: workspaceApiKeyStatusSchema,
  lastUsedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const workspaceApiKeyListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(workspaceApiKeySafeSchema),
});

const workspaceApiKeyCreateResponseSchema = z.object({
  success: z.literal(true),
  data: workspaceApiKeySafeSchema.extend({
    plaintextApiKey: z.string().min(1),
  }),
});

const workspaceApiKeyResponseSchema = z.object({
  success: z.literal(true),
  data: workspaceApiKeySafeSchema,
});

export type CurrentUser = z.infer<typeof loginSuccessSchema>["data"];
export type PushbackStatusResponse = z.infer<typeof pushbackStatusResponseSchema>;
export type EmailSendPushbackReplayResponse = z.infer<
  typeof emailSendPushbackReplaySuccessSchema
>["data"];
export type GoogleSheetsSetupStatus = z.infer<typeof googleSheetsSetupStatusSchema>;
export type GoogleSheetsSetupTestResponse = z.infer<
  typeof googleSheetsSetupTestSuccessSchema
>["data"];
export type OpsCheckId = z.infer<typeof opsCheckIdSchema>;
export type OpsHealthResponse = z.infer<typeof opsHealthSuccessSchema>["data"];
export type OpsRunCheckResponse = z.infer<typeof opsRunCheckSuccessSchema>["data"];
export type OpsRecentChecksResponse = z.infer<typeof opsRecentChecksSuccessSchema>["data"];
export type GmailExportStatusResponse = z.infer<typeof gmailExportStatusSuccessSchema>["data"];
export type GmailExportRequestResponse = z.infer<typeof gmailExportRequestResponseSchema>["data"];
export type GmailExportCancelResponse = z.infer<typeof gmailExportCancelResponseSchema>["data"];
export type ClientCockpitSummary = z.infer<typeof ClientCockpitSummaryResponseSchema>["data"];
export type DraftQueueData = z.infer<typeof DraftQueueResponseSchema>["data"];
export type DraftQueueItem = DraftQueueData["items"][number];
export type DraftQueueDetail = z.infer<typeof DraftQueueDetailResponseSchema>["data"];
export type WorkspaceApiKeySafe = z.infer<typeof workspaceApiKeyListResponseSchema>["data"][number];
export type WorkspaceApiKeyCreateResponse = z.infer<
  typeof workspaceApiKeyCreateResponseSchema
>["data"];

export class ApiUnauthorizedError extends Error {
  constructor() {
    super("Authentication is required.");
    this.name = "ApiUnauthorizedError";
  }
}

export class ApiRequestError extends Error {
  readonly status: number | null;

  constructor(message = "Request failed.", status: number | null = null) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

async function requestJson(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401) {
    throw new ApiUnauthorizedError();
  }

  if (!response.ok) {
    throw new ApiRequestError("Request failed.", response.status);
  }

  return response.json();
}

export async function login(input: { email: string; password: string }): Promise<CurrentUser> {
  const payload = await requestJson("/auth/login", {
    method: "POST",
    body: encodeJsonBody(input),
  });

  return loginSuccessSchema.parse(payload).data;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const payload = await requestJson("/auth/me");
  return loginSuccessSchema.parse(payload).data;
}

export async function logout(): Promise<void> {
  const payload = await requestJson("/auth/logout", {
    method: "POST",
  });

  logoutSuccessSchema.parse(payload);
}

export async function getEmailSendPushbackStatus(id: string): Promise<PushbackStatusResponse> {
  const payload = await requestJson(`/api/email-sends/${encodeURIComponent(id)}/pushback-status`);
  return pushbackStatusSuccessSchema.parse(payload).data;
}

export async function getDraftPushbackStatus(id: string): Promise<PushbackStatusResponse> {
  const payload = await requestJson(`/api/drafts/${encodeURIComponent(id)}/pushback-status`);
  return pushbackStatusSuccessSchema.parse(payload).data;
}

export async function getDraftGmailExportStatus(id: string): Promise<GmailExportStatusResponse> {
  const payload = await requestJson(`/api/drafts/${encodeURIComponent(id)}/gmail-export-status`);
  return gmailExportStatusSuccessSchema.parse(payload).data;
}

export async function requestDraftGmailExport(id: string): Promise<GmailExportRequestResponse> {
  const payload = await requestJson(`/api/drafts/${encodeURIComponent(id)}/gmail-export-request`, {
    method: "POST",
  });

  return gmailExportRequestResponseSchema.parse(payload).data;
}

export async function cancelDraftGmailExport(id: string): Promise<GmailExportCancelResponse> {
  const payload = await requestJson(`/api/drafts/${encodeURIComponent(id)}/gmail-export-cancel`, {
    method: "POST",
  });

  return gmailExportCancelResponseSchema.parse(payload).data;
}

export async function cancelDraftGmailExportRequest(
  id: string,
): Promise<GmailExportCancelResponse> {
  return cancelDraftGmailExport(id);
}

export async function replayEmailSendPushback(
  id: string,
): Promise<EmailSendPushbackReplayResponse> {
  const payload = await requestJson(`/api/email-sends/${encodeURIComponent(id)}/pushback-replay`, {
    method: "POST",
  });

  return emailSendPushbackReplaySuccessSchema.parse(payload).data;
}

export async function getGoogleSheetsSetupStatus(): Promise<GoogleSheetsSetupStatus> {
  const payload = await requestJson("/api/integrations/google-sheets/setup-status");
  return googleSheetsSetupStatusSuccessSchema.parse(payload).data;
}

export async function testGoogleSheetsSetup(): Promise<GoogleSheetsSetupTestResponse> {
  const payload = await requestJson("/api/integrations/google-sheets/setup-test", {
    method: "POST",
  });

  return googleSheetsSetupTestSuccessSchema.parse(payload).data;
}

export async function getOpsHealth(): Promise<OpsHealthResponse> {
  const payload = await requestJson("/api/admin/ops/health");
  return opsHealthSuccessSchema.parse(payload).data;
}

export async function runOpsCheck(checkId: OpsCheckId): Promise<OpsRunCheckResponse> {
  const payload = await requestJson(`/api/admin/ops/checks/${encodeURIComponent(checkId)}`, {
    method: "POST",
  });

  return opsRunCheckSuccessSchema.parse(payload).data;
}

export async function getRecentOpsChecks(
  params: {
    limit?: number;
    checkId?: OpsCheckId;
  } = {},
): Promise<OpsRecentChecksResponse> {
  const search = new URLSearchParams();

  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }

  if (params.checkId) {
    search.set("checkId", params.checkId);
  }

  const query = search.toString();
  const payload = await requestJson(`/api/admin/ops/checks/recent${query ? `?${query}` : ""}`);
  return opsRecentChecksSuccessSchema.parse(payload).data;
}

export async function getClientCockpitSummary(): Promise<ClientCockpitSummary> {
  const payload = await requestJson("/api/client/cockpit-summary");
  return ClientCockpitSummaryResponseSchema.parse(payload).data;
}

export async function getDraftQueue(
  params: {
    limit?: number;
    offset?: number;
    scoreBand?: string;
    exportStatus?: string;
    attentionRequired?: boolean;
  } = {},
): Promise<DraftQueueData> {
  const search = new URLSearchParams();

  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }

  if (params.offset !== undefined) {
    search.set("offset", String(params.offset));
  }

  if (params.scoreBand) {
    search.set("scoreBand", params.scoreBand);
  }

  if (params.exportStatus) {
    search.set("exportStatus", params.exportStatus);
  }

  if (params.attentionRequired !== undefined) {
    search.set("attentionRequired", String(params.attentionRequired));
  }

  const query = search.toString();
  const payload = await requestJson(`/api/client/draft-queue${query ? `?${query}` : ""}`);
  return DraftQueueResponseSchema.parse(payload).data;
}

export async function getDraftQueueDetail(draftId: string): Promise<DraftQueueDetail> {
  const payload = await requestJson(`/api/client/draft-queue/${encodeURIComponent(draftId)}`);
  return DraftQueueDetailResponseSchema.parse(payload).data;
}

export async function listWorkspaceApiKeys(): Promise<WorkspaceApiKeySafe[]> {
  const payload = await requestJson("/api/workspace-api-keys");
  return workspaceApiKeyListResponseSchema.parse(payload).data;
}

export async function createWorkspaceApiKey(input: {
  name: string;
}): Promise<WorkspaceApiKeyCreateResponse> {
  const payload = await requestJson("/api/workspace-api-keys", {
    method: "POST",
    body: encodeJsonBody({ name: input.name }),
  });

  return workspaceApiKeyCreateResponseSchema.parse(payload).data;
}

export async function revokeWorkspaceApiKey(id: string): Promise<WorkspaceApiKeySafe> {
  const payload = await requestJson(`/api/workspace-api-keys/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
  });

  return workspaceApiKeyResponseSchema.parse(payload).data;
}
