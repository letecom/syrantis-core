import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { AuthMe } from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createAdminOpsRoutes } from "../routes/admin-ops.js";
import { createClientDraftQueueRoutes } from "../routes/client/draft-queue.js";
import { createClientMailQueueRoutes } from "../routes/client/mail-queue.js";
import { createClientResponsePolicyRoutes } from "../routes/client/response-policy.js";
import { createDraftGmailExportStatusRoutes } from "../routes/drafts-gmail-export-status.js";
import { createIntegrationRoutes } from "../routes/integrations.js";
import { createWorkspaceApiKeyRoutes } from "../routes/workspace-api-keys.js";
import { createWorkspaceContextRoutes } from "../routes/workspace-context.js";
import type { AdminOpsService } from "../services/admin-ops.js";
import type { AuthService } from "../services/auth.js";
import type { ClientResponsePolicyService } from "../services/client-response-policy.js";
import type { DraftQueueService } from "../services/draft-queue.service.js";
import type { GmailExportRequestService } from "../services/gmail-export-request.js";
import type { GmailExportStatusService } from "../services/gmail-export-status.js";
import type { GoogleSheetsSetupService } from "../services/google-sheets-setup.js";
import type { IntegrationService } from "../services/integrations.js";
import type { MailQueueService } from "../services/mail-queue.service.js";
import type { WorkspaceApiKeyService } from "../services/workspace-api-keys.js";
import type { WorkspaceContextService } from "../services/workspace-context.js";
import { testUser, validSessionToken } from "./mocks/auth.js";

const resourceId = "00000000-0000-4000-8000-000000000123";

const clientUser: AuthMe = {
  ...testUser,
  role: "client",
};

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
    "content-type": "application/json",
  };
}

function authServiceFor(user: AuthMe): AuthService {
  return {
    login: vi.fn(async () => null),
    getCurrentUser: vi.fn(async (token: string) => (token === validSessionToken ? user : null)),
    logout: vi.fn(async () => undefined),
  };
}

function createBoundaryApp(user: AuthMe = clientUser) {
  const app = new Hono();
  const authService = authServiceFor(user);
  const adminOpsService = {
    getHealth: vi.fn(),
    getRecentChecks: vi.fn(),
    runCheck: vi.fn(),
  } satisfies AdminOpsService;
  const workspaceApiKeyService = {
    listWorkspaceApiKeys: vi.fn(),
    getWorkspaceApiKey: vi.fn(),
    createWorkspaceApiKey: vi.fn(),
    revokeWorkspaceApiKey: vi.fn(),
  } satisfies WorkspaceApiKeyService;
  const integrationService = {
    listConnections: vi.fn(),
    getConnection: vi.fn(),
    createConnection: vi.fn(),
    updateConnection: vi.fn(),
    archiveConnection: vi.fn(),
    listMappings: vi.fn(),
    getMapping: vi.fn(),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    archiveMapping: vi.fn(),
    listEvents: vi.fn(),
  } satisfies IntegrationService;
  const googleSheetsSetupService = {
    getSetupStatus: vi.fn(),
    runSetupTest: vi.fn(),
  } satisfies GoogleSheetsSetupService;
  const workspaceContextService = {
    getWorkspaceContext: vi.fn(),
    putWorkspaceContext: vi.fn(),
  } satisfies WorkspaceContextService;
  const mailQueueService = {
    listMailQueue: vi.fn(),
    getMailQueueDetail: vi.fn(),
  } satisfies MailQueueService;
  const draftQueueService = {
    listDraftQueue: vi.fn(),
    getDraftQueueDetail: vi.fn(),
  } satisfies DraftQueueService;
  const clientResponsePolicyService = {
    getClientResponsePolicy: vi.fn(),
    putClientResponsePolicy: vi.fn(),
  } satisfies ClientResponsePolicyService;
  const gmailExportStatusService = {
    getGmailExportStatus: vi.fn(),
  } satisfies GmailExportStatusService;
  const gmailExportRequestService = {
    requestGmailExport: vi.fn(),
    cancelGmailExport: vi.fn(),
  } satisfies GmailExportRequestService;

  app.route(
    "/api/admin/ops",
    createAdminOpsRoutes({
      authService,
      adminOpsService,
    }),
  );
  app.route(
    "/api/workspace-api-keys",
    createWorkspaceApiKeyRoutes({
      authService,
      workspaceApiKeyService,
    }),
  );
  app.route(
    "/api/integrations",
    createIntegrationRoutes({
      authService,
      integrationService,
      googleSheetsSetupService,
    }),
  );
  app.route(
    "/api/workspace-context",
    createWorkspaceContextRoutes({
      authService,
      workspaceContextService,
    }),
  );
  app.route(
    "/api/client/mail-queue",
    createClientMailQueueRoutes({
      authService,
      mailQueueService,
    }),
  );
  app.route(
    "/api/client/draft-queue",
    createClientDraftQueueRoutes({
      authService,
      draftQueueService,
    }),
  );
  app.route(
    "/api/client/response-policy",
    createClientResponsePolicyRoutes({
      authService,
      clientResponsePolicyService,
    }),
  );
  app.route(
    "/api/drafts",
    createDraftGmailExportStatusRoutes({
      authService,
      gmailExportStatusService,
      gmailExportRequestService,
    }),
  );

  return {
    app,
    adminOpsService,
    workspaceApiKeyService,
    googleSheetsSetupService,
    workspaceContextService,
    mailQueueService,
    draftQueueService,
    clientResponsePolicyService,
    gmailExportStatusService,
    gmailExportRequestService,
  };
}

describe("client role access boundary", () => {
  it("blocks client sessions from admin ops routes", async () => {
    const { app, adminOpsService } = createBoundaryApp();

    const health = await app.request("/api/admin/ops/health", {
      headers: validSessionHeaders(),
    });
    const run = await app.request("/api/admin/ops/checks/db-health", {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(health.status).toBe(403);
    expect(run.status).toBe(403);
    expect(adminOpsService.getHealth).not.toHaveBeenCalled();
    expect(adminOpsService.runCheck).not.toHaveBeenCalled();
  });

  it("blocks client sessions from workspace API key management", async () => {
    const { app, workspaceApiKeyService } = createBoundaryApp();

    const list = await app.request("/api/workspace-api-keys", {
      headers: validSessionHeaders(),
    });
    const create = await app.request("/api/workspace-api-keys", {
      method: "POST",
      headers: validSessionHeaders(),
      body: JSON.stringify({ name: "Client key" }),
    });

    expect(list.status).toBe(403);
    expect(create.status).toBe(403);
    expect(workspaceApiKeyService.listWorkspaceApiKeys).not.toHaveBeenCalled();
    expect(workspaceApiKeyService.createWorkspaceApiKey).not.toHaveBeenCalled();
  });

  it("blocks client sessions from Google Sheets setup routes", async () => {
    const { app, googleSheetsSetupService } = createBoundaryApp();

    const status = await app.request("/api/integrations/google-sheets/setup-status", {
      headers: validSessionHeaders(),
    });
    const test = await app.request("/api/integrations/google-sheets/setup-test", {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(status.status).toBe(403);
    expect(test.status).toBe(403);
    expect(googleSheetsSetupService.getSetupStatus).not.toHaveBeenCalled();
    expect(googleSheetsSetupService.runSetupTest).not.toHaveBeenCalled();
  });

  it("blocks client sessions from workspace context admin routes", async () => {
    const { app, workspaceContextService } = createBoundaryApp();

    const read = await app.request("/api/workspace-context", {
      headers: validSessionHeaders(),
    });
    const write = await app.request("/api/workspace-context", {
      method: "PUT",
      headers: validSessionHeaders(),
      body: JSON.stringify({ companyName: "Client" }),
    });

    expect(read.status).toBe(403);
    expect(write.status).toBe(403);
    expect(workspaceContextService.getWorkspaceContext).not.toHaveBeenCalled();
    expect(workspaceContextService.putWorkspaceContext).not.toHaveBeenCalled();
  });

  it("blocks client sessions from client-labeled admin validation APIs", async () => {
    const {
      app,
      mailQueueService,
      draftQueueService,
      clientResponsePolicyService,
      gmailExportStatusService,
      gmailExportRequestService,
    } = createBoundaryApp();

    const mailQueue = await app.request("/api/client/mail-queue", {
      headers: validSessionHeaders(),
    });
    const draftQueue = await app.request("/api/client/draft-queue", {
      headers: validSessionHeaders(),
    });
    const responsePolicy = await app.request("/api/client/response-policy", {
      headers: validSessionHeaders(),
    });
    const gmailStatus = await app.request(`/api/drafts/${resourceId}/gmail-export-status`, {
      headers: validSessionHeaders(),
    });
    const gmailRequest = await app.request(`/api/drafts/${resourceId}/gmail-export-request`, {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(mailQueue.status).toBe(403);
    expect(draftQueue.status).toBe(403);
    expect(responsePolicy.status).toBe(403);
    expect(gmailStatus.status).toBe(403);
    expect(gmailRequest.status).toBe(403);
    expect(mailQueueService.listMailQueue).not.toHaveBeenCalled();
    expect(draftQueueService.listDraftQueue).not.toHaveBeenCalled();
    expect(clientResponsePolicyService.getClientResponsePolicy).not.toHaveBeenCalled();
    expect(gmailExportStatusService.getGmailExportStatus).not.toHaveBeenCalled();
    expect(gmailExportRequestService.requestGmailExport).not.toHaveBeenCalled();
  });
});
