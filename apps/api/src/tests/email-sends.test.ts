import { readFileSync } from "node:fs";

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EmailSendOutputSchema,
  type DraftOutput,
  type EmailSendOutput,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import * as emailSendRepository from "../repositories/email-sends.js";
import { createDraftRoutes } from "../routes/drafts.js";
import { createEmailSendRoutes } from "../routes/email-sends.js";
import type { AuthService } from "../services/auth.js";
import type {
  DraftApprovalRequestServiceResult,
  DraftService,
  DraftServiceMutationResult,
} from "../services/drafts.js";
import type {
  EmailSendRequestServiceResult,
  EmailSendService,
} from "../services/email-sends.js";
import { createFakeAuthService, testUser, validSessionToken } from "./mocks/auth.js";
import { otherWorkspaceId } from "./mocks/tasks.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown,
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockDb.tx),
  ),
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000001899" })),
}));

const approvedDraftId = "00000000-0000-4000-8000-000000001001";
const draftStatusDraftId = "00000000-0000-4000-8000-000000001002";
const pendingApprovalDraftId = "00000000-0000-4000-8000-000000001003";
const rejectedDraftId = "00000000-0000-4000-8000-000000001004";
const archivedDraftId = "00000000-0000-4000-8000-000000001005";
const otherWorkspaceDraftId = "00000000-0000-4000-8000-000000001006";
const missingDraftId = "00000000-0000-4000-8000-000000001007";
const leadId = "00000000-0000-4000-8000-000000001101";
const contactId = "00000000-0000-4000-8000-000000001102";
const approvalId = "00000000-0000-4000-8000-000000001103";
const emailSendId = "00000000-0000-4000-8000-000000001104";
const backgroundJobId = "00000000-0000-4000-8000-000000001105";

const approvedDraft: DraftOutput = {
  id: approvedDraftId,
  workspaceId: testUser.workspaceId,
  taskId: null,
  leadId,
  opportunityId: null,
  contactId,
  status: "approved",
  channel: "email",
  subject: "Relance devis",
  textBody: "Bonjour, souhaitez-vous avancer sur le devis ?",
  htmlBody: "<p>Bonjour, souhaitez-vous avancer sur le devis ?</p>",
  metadata: {},
  createdAt: "2026-05-01T10:00:00.000Z",
  updatedAt: "2026-05-01T11:00:00.000Z",
};

const pendingEmailSend: EmailSendOutput = {
  id: emailSendId,
  workspaceId: testUser.workspaceId,
  draftId: approvedDraftId,
  status: "pending",
  createdAt: "2026-05-01T12:00:00.000Z",
  updatedAt: "2026-05-01T12:00:00.000Z",
};

let mockTx: ReturnType<typeof createMockTx>;

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    offset: vi.fn(async () => response),
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };

  return builder;
}

function createMockTx() {
  const state = {
    selectResponses: [] as unknown[][],
    insertResponse: null as unknown,
    insertResponses: [] as unknown[],
    insertValues: [] as unknown[],
  };

  return {
    state,
    select: vi.fn(() => createSelectBuilder(state.selectResponses.shift() ?? [])),
    insert: vi.fn(() => ({
      values: vi.fn((values: unknown) => {
        state.insertValues.push(values);
        return {
          returning: vi.fn(async () => {
            const response =
              state.insertResponses.length > 0
                ? state.insertResponses.shift()
                : state.insertResponse;
            return response ? [response] : [];
          }),
        };
      }),
    })),
  };
}

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
  };
}

function jsonHeaders() {
  return {
    ...validSessionHeaders(),
    "content-type": "application/json",
  };
}

function createUnusedDraftService(): DraftService {
  return {
    listDrafts: vi.fn(async () => []),
    getDraft: vi.fn(async () => null),
    createDraft: vi.fn(
      async () => ({ result: "not_found" }) satisfies DraftServiceMutationResult,
    ),
    updateDraft: vi.fn(
      async () => ({ result: "not_found" }) satisfies DraftServiceMutationResult,
    ),
    archiveDraft: vi.fn(
      async () => ({ result: "not_found" }) satisfies DraftServiceMutationResult,
    ),
    requestApproval: vi.fn(
      async () => ({ result: "not_found" }) satisfies DraftApprovalRequestServiceResult,
    ),
  };
}

function createFakeEmailSendService(): EmailSendService {
  const sends = new Map<string, EmailSendOutput>([[pendingEmailSend.id, pendingEmailSend]]);

  return {
    listEmailSends: vi.fn(async (workspaceId: string) => {
      return [...sends.values()].filter((send) => send.workspaceId === workspaceId);
    }),
    getEmailSend: vi.fn(async (workspaceId: string, id: string) => {
      const send = sends.get(id);
      return send?.workspaceId === workspaceId ? send : null;
    }),
    requestSendFromDraft: vi.fn(
      async (
        workspaceId: string,
        _actorUserId: string,
        draftId: string,
      ): Promise<EmailSendRequestServiceResult> => {
        if (workspaceId !== testUser.workspaceId) {
          return { result: "not_found" };
        }

        if ([draftStatusDraftId, pendingApprovalDraftId, rejectedDraftId].includes(draftId)) {
          return { result: "conflict" };
        }

        if ([archivedDraftId, otherWorkspaceDraftId, missingDraftId].includes(draftId)) {
          return { result: "not_found" };
        }

        if (draftId === approvedDraftId) {
          return { result: "ok", emailSend: pendingEmailSend };
        }

        return { result: "not_found" };
      },
    ),
  };
}

function createDraftRequestSendApp(
  emailSendService: EmailSendService,
  authService: AuthService = createFakeAuthService(),
): Hono {
  const app = new Hono();

  app.route(
    "/api/drafts",
    createDraftRoutes({
      authService,
      draftService: createUnusedDraftService(),
      emailSendService,
    }),
  );

  return app;
}

function createEmailSendReadApp(
  emailSendService: EmailSendService,
  authService: AuthService = createFakeAuthService(),
): Hono {
  const app = new Hono();

  app.route(
    "/api/email-sends",
    createEmailSendRoutes({
      authService,
      emailSendService,
    }),
  );

  return app;
}

function draftRowFromOutput(draft: DraftOutput) {
  return {
    id: draft.id,
    workspaceId: draft.workspaceId,
    taskId: draft.taskId,
    leadId: draft.leadId,
    opportunityId: draft.opportunityId,
    contactId: draft.contactId,
    status: draft.status,
    channel: draft.channel,
    subject: draft.subject,
    textBody: draft.textBody,
    htmlBody: draft.htmlBody,
    metadataJson: draft.metadata,
    createdAt: new Date(draft.createdAt),
    updatedAt: new Date(draft.updatedAt),
  };
}

function emailSendRowFromOutput(emailSend: EmailSendOutput) {
  return {
    id: emailSend.id,
    workspaceId: emailSend.workspaceId,
    approvalId,
    draftId: emailSend.draftId,
    leadId,
    contactId,
    fromEmail: "no-reply@syrantis.local",
    toEmail: "client@example.com",
    replyToEmail: null,
    subject: approvedDraft.subject,
    textBody: approvedDraft.textBody,
    htmlBody: approvedDraft.htmlBody,
    provider: "internal",
    providerMessageId: null,
    idempotencyKey: `request_send:${emailSend.draftId}:00000000-0000-4000-8000-000000001999`,
    approvalCheckedAt: null,
    suppressionCheckedAt: null,
    attemptCount: 0,
    lastErrorCode: null,
    lastErrorMessage: null,
    status: emailSend.status,
    sentAt: null,
    failedAt: null,
    metadataJson: { source: "draft.request_send" },
    createdAt: new Date(emailSend.createdAt),
    updatedAt: new Date(emailSend.updatedAt),
  };
}

function backgroundJobRow() {
  return {
    id: backgroundJobId,
    workspaceId: testUser.workspaceId,
    type: "send_email",
    payloadJson: { emailSendId },
    status: "pending",
    attempts: 0,
    maxAttempts: 3,
    runAfter: new Date("2026-05-01T12:00:00.000Z"),
    lockedAt: null,
    lockedBy: null,
    completedAt: null,
    failedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: new Date("2026-05-01T12:00:00.000Z"),
    updatedAt: new Date("2026-05-01T12:00:00.000Z"),
  };
}

describe("draft request-send route", () => {
  it("returns 401 for POST /api/drafts/:id/request-send without session", async () => {
    const app = createDraftRequestSendApp(createFakeEmailSendService());

    const response = await app.request(`/api/drafts/${approvedDraftId}/request-send`, {
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "NO_SESSION",
    });
  });

  it("creates a pending email send from an approved draft", async () => {
    const emailSendService = createFakeEmailSendService();
    const app = createDraftRequestSendApp(emailSendService);

    const response = await app.request(`/api/drafts/${approvedDraftId}/request-send`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ message: "Ready to send after approval." }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      data: pendingEmailSend,
    });
    expect(emailSendService.requestSendFromDraft).toHaveBeenCalledWith(
      testUser.workspaceId,
      testUser.id,
      approvedDraftId,
      { message: "Ready to send after approval." },
    );
  });

  it.each([draftStatusDraftId, pendingApprovalDraftId, rejectedDraftId])(
    "returns 409 for request-send when draft is not approved",
    async (draftId) => {
      const app = createDraftRequestSendApp(createFakeEmailSendService());

      const response = await app.request(`/api/drafts/${draftId}/request-send`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        success: false,
        error: "Draft cannot request email send.",
        code: "EMAIL_SEND_CONFLICT",
      });
    },
  );

  it("returns 404 for request-send on archived, missing, or cross-workspace drafts", async () => {
    const app = createDraftRequestSendApp(createFakeEmailSendService());

    for (const draftId of [archivedDraftId, missingDraftId, otherWorkspaceDraftId]) {
      const response = await app.request(`/api/drafts/${draftId}/request-send`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        success: false,
        error: "Draft not found.",
        code: "DRAFT_NOT_FOUND",
      });
    }
  });
});

describe("email send read routes", () => {
  it("lists current workspace email sends and returns detail", async () => {
    const app = createEmailSendReadApp(createFakeEmailSendService());

    const listResponse = await app.request("/api/email-sends", {
      headers: validSessionHeaders(),
    });

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({
      success: true,
      data: [pendingEmailSend],
    });

    const detailResponse = await app.request(`/api/email-sends/${emailSendId}`, {
      headers: validSessionHeaders(),
    });

    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toEqual({
      success: true,
      data: pendingEmailSend,
    });
  });

  it("returns 404 for cross-workspace or missing email send detail", async () => {
    const emailSendService = createFakeEmailSendService();
    const app = createEmailSendReadApp(emailSendService);

    vi.mocked(emailSendService.getEmailSend).mockResolvedValueOnce(null);

    const response = await app.request(`/api/email-sends/${emailSendId}`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: "Email send not found.",
      code: "EMAIL_SEND_NOT_FOUND",
    });
  });
});

describe("email send repository", () => {
  beforeEach(() => {
    mockTx = createMockTx();
    mockDb.tx = mockTx;
    vi.mocked(createActivityLog).mockClear();
  });

  it("creates pending email send and send_email background job on request-send", async () => {
    mockTx.state.selectResponses.push(
      [draftRowFromOutput(approvedDraft)],
      [{ id: approvalId }],
      [{ id: contactId, email: "client@example.com" }],
    );
    mockTx.state.insertResponses.push(emailSendRowFromOutput(pendingEmailSend), backgroundJobRow());

    const result = await emailSendRepository.requestEmailSendFromDraft({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      draftId: approvedDraftId,
      data: { message: "Operator note" },
    });

    expect(result.result).toBe("ok");
    expect(mockTx.state.insertValues[0]).toMatchObject({
      workspaceId: testUser.workspaceId,
      approvalId,
      draftId: approvedDraftId,
      leadId,
      contactId,
      toEmail: "client@example.com",
      subject: approvedDraft.subject,
      textBody: approvedDraft.textBody,
      htmlBody: approvedDraft.htmlBody,
      status: "pending",
      provider: "internal",
      attemptCount: 0,
      metadataJson: {
        source: "draft.request_send",
        requestedBy: testUser.id,
        message: "Operator note",
      },
    });
    expect(mockTx.state.insertValues[0]).toMatchObject({
      idempotencyKey: expect.stringMatching(/^request_send:/),
    });
    expect(mockTx.state.insertValues[1]).toMatchObject({
      workspaceId: testUser.workspaceId,
      type: "send_email",
      payloadJson: { emailSendId },
      status: "pending",
      runAfter: expect.any(Date),
    });
  });

  it("accepts legacy queued email send rows in output parsing", () => {
    expect(
      EmailSendOutputSchema.parse({
        ...pendingEmailSend,
        status: "queued",
      }),
    ).toMatchObject({
      id: pendingEmailSend.id,
      status: "queued",
    });
  });

  it("writes compact email_send activity logs in the same transaction", async () => {
    mockTx.state.selectResponses.push(
      [draftRowFromOutput(approvedDraft)],
      [{ id: approvalId }],
      [{ id: contactId, email: "client@example.com" }],
    );
    mockTx.state.insertResponses.push(emailSendRowFromOutput(pendingEmailSend), backgroundJobRow());

    await emailSendRepository.requestEmailSendFromDraft({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      draftId: approvedDraftId,
      data: {},
    });

    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "email_send.requested",
        entityType: "draft",
        entityId: approvedDraftId,
      }),
    );
    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "email_send.created",
        entityType: "email_send",
        entityId: emailSendId,
      }),
    );
    expect(createActivityLog).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        action: "email_send.queued",
        entityType: "email_send",
        entityId: emailSendId,
        metadataJson: expect.objectContaining({
          draftId: approvedDraftId,
          leadId,
          contactId,
          jobId: backgroundJobId,
          status: "pending",
        }),
      }),
    );

    for (const call of vi.mocked(createActivityLog).mock.calls) {
      const metadata = call[1].metadataJson ?? {};
      expect(metadata).not.toHaveProperty("textBody");
      expect(metadata).not.toHaveProperty("htmlBody");
      expect(metadata).not.toHaveProperty("subject");
    }
  });

  it("returns conflict and creates no background job when draft is not approved", async () => {
    mockTx.state.selectResponses.push([
      draftRowFromOutput({
        ...approvedDraft,
        status: "draft",
      }),
    ]);

    const result = await emailSendRepository.requestEmailSendFromDraft({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      draftId: approvedDraftId,
      data: {},
    });

    expect(result).toEqual({ result: "conflict" });
    expect(mockTx.state.insertValues).toEqual([]);
  });

  it("returns not_found and creates no background job when draft is missing or cross-workspace", async () => {
    mockTx.state.selectResponses.push([]);

    const result = await emailSendRepository.requestEmailSendFromDraft({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      draftId: approvedDraftId,
      data: {},
    });

    expect(result).toEqual({ result: "not_found" });
    expect(mockTx.state.insertValues).toEqual([]);
  });

  it("returns recipient_missing when no current-workspace contact email can be resolved", async () => {
    mockTx.state.selectResponses.push(
      [draftRowFromOutput({ ...approvedDraft, contactId: null })],
      [{ id: approvalId }],
      [{ id: leadId, contactId: null }],
    );

    const result = await emailSendRepository.requestEmailSendFromDraft({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      draftId: approvedDraftId,
      data: {},
    });

    expect(result).toEqual({ result: "recipient_missing" });
    expect(mockTx.state.insertValues).toEqual([]);
  });
});

describe("email send governance checks", () => {
  it("documents RLS validation for email_sends without app.current_workspace_id", () => {
    const migration = readFileSync(
      "../../packages/db/migrations/0010_email_sends_access_rls.sql",
      "utf8",
    );
    const implementation = readFileSync(
      "../../docs/implementation/018A-email-sends-foundation.md",
      "utf8",
    );

    expect(migration).toContain('ALTER TABLE "email_sends" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE "email_sends" FORCE ROW LEVEL SECURITY');
    expect(migration).toContain("tenant_isolation_email_sends");
    expect(migration).toContain("app.current_workspace_id");
    expect(implementation).toContain("without `app.current_workspace_id`, `email_sends` returns zero rows");
  });

  it("documents RLS validation for background_jobs without app.current_workspace_id", () => {
    const migration = readFileSync(
      "../../packages/db/migrations/0011_background_jobs_foundation.sql",
      "utf8",
    );
    const implementation = readFileSync(
      "../../docs/implementation/019A-jobs-outbox-foundation.md",
      "utf8",
    );

    expect(migration).toContain('ALTER TABLE "background_jobs" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE "background_jobs" FORCE ROW LEVEL SECURITY');
    expect(migration).toContain("tenant_isolation_background_jobs");
    expect(migration).toContain("app.current_workspace_id");
    expect(implementation).toContain("without `app.current_workspace_id`, `background_jobs` returns zero rows");
  });

  it("does not add Resend or external HTTP calls to the 019A API code", () => {
    const files = [
      "src/repositories/background-jobs.ts",
      "src/repositories/email-sends.ts",
      "src/services/email-sends.ts",
      "src/routes/email-sends.ts",
      "src/routes/drafts.ts",
    ];
    const combined = files.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(combined).not.toMatch(/\bfetch\s*\(/);
    expect(combined).not.toMatch(/\baxios\b/);
    expect(combined).not.toMatch(/\bundici\b/);
    expect(combined).not.toMatch(/\bhttp\.request\b/);
    expect(combined).not.toMatch(/\bhttps\.request\b/);
    expect(combined).not.toMatch(/\bResend\b/);
    expect(combined).not.toMatch(/from ["']resend["']/);
    expect(combined).not.toContain(otherWorkspaceId);
  });
});
