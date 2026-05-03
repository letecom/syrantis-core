import { readFileSync } from "node:fs";

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ApprovalOutput,
  DraftApprovalReadinessOutput,
  DraftOutput,
  RequestDraftApprovalInput,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import { createDraftRoutes } from "../routes/drafts.js";
import type {
  DraftApprovalRequestServiceResult,
  DraftService,
  DraftServiceMutationResult,
} from "../services/drafts.js";
import { createFakeAuthService, testUser, validSessionToken } from "./mocks/auth.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown,
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockDb.tx),
  ),
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000021c99" })),
}));

const draftId = "00000000-0000-4000-8000-000000021c01";
const aiDraftId = "00000000-0000-4000-8000-000000021c02";
const otherWorkspaceDraftId = "00000000-0000-4000-8000-000000021c03";
const missingDraftId = "00000000-0000-4000-8000-000000021c04";
const leadId = "00000000-0000-4000-8000-000000021c11";
const contactId = "00000000-0000-4000-8000-000000021c21";
const aiRunId = "00000000-0000-4000-8000-000000021c31";
const sourceLeadScoreId = "00000000-0000-4000-8000-000000021c41";
const approvalId = "00000000-0000-4000-8000-000000021c51";

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

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(async () => response),
  };

  return builder;
}

function createMockTx(selectResponses: unknown[][]) {
  const responses = [...selectResponses];

  return {
    select: vi.fn(() => createSelectBuilder(responses.shift() ?? [])),
    insert: vi.fn(() => {
      throw new Error("readiness route must not insert");
    }),
    update: vi.fn(() => {
      throw new Error("readiness route must not update");
    }),
    delete: vi.fn(() => {
      throw new Error("readiness route must not delete");
    }),
  };
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: draftId,
    status: "draft",
    channel: "email",
    leadId,
    contactId,
    subject: "Votre devis",
    textBody: "Bonjour, voici votre reponse.",
    htmlBody: null,
    metadataJson: {},
    ...overrides,
  };
}

function leadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: leadId,
    rawContent: "must never leave the repository",
    ...overrides,
  };
}

function contactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: contactId,
    email: "client@example.test",
    phone: "+33600000000",
    firstName: "Ada",
    lastName: "Client",
    ...overrides,
  };
}

function aiAuditDraftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: aiDraftId,
    leadId,
    metadataJson: {
      origin: "ai_draft_generation",
      aiRunId,
      sourceLeadScoreId,
      promptTemplateId: "draft-email-v1",
    },
    createdAt: new Date("2026-05-01T16:00:00.000Z"),
    ...overrides,
  };
}

function aiRunRow(overrides: Record<string, unknown> = {}) {
  return {
    id: aiRunId,
    status: "success",
    provider: "openrouter",
    modelUsed: "mistralai/mistral-small-2603",
    latencyMs: 900,
    finishReason: "stop",
    updatedAt: new Date("2026-05-01T16:00:02.000Z"),
    promptJson: { hidden: true },
    outputJson: { hidden: true },
    outputText: "hidden",
    errorMessage: "hidden",
    inputTokens: 1,
    outputTokens: 2,
    costEstimateCents: 3,
    costEstimateMicroUsd: 4,
    ...overrides,
  };
}

function sourceScoreRow(overrides: Record<string, unknown> = {}) {
  return {
    id: sourceLeadScoreId,
    score: 87,
    qualification: "hot",
    confidence: 91,
    createdAt: new Date("2026-05-01T15:30:00.000Z"),
    ...overrides,
  };
}

function readinessSelects(row: Record<string, unknown>, options: {
  lead?: unknown[];
  contact?: unknown[];
  pendingApproval?: unknown[];
  aiAudit?: boolean;
  aiRun?: unknown[];
  sourceScore?: unknown[];
} = {}) {
  const responses: unknown[][] = [
    [row],
    ...(row.leadId ? [options.lead ?? [leadRow()]] : []),
    ...(row.contactId ? [options.contact ?? [contactRow()]] : []),
    options.pendingApproval ?? [],
  ];

  if (options.aiAudit) {
    responses.push(
      [aiAuditDraftRow({ id: row.id, leadId: row.leadId, metadataJson: row.metadataJson })],
      options.aiRun ?? [aiRunRow()],
      options.sourceScore ?? [sourceScoreRow()],
    );
  }

  return responses;
}

function createTestApp(draftService?: DraftService): Hono {
  const app = new Hono();

  app.route(
    "/api/drafts",
    createDraftRoutes({
      authService: createFakeAuthService(),
      ...(draftService ? { draftService } : {}),
    }),
  );

  return app;
}

async function requestReadiness(selectResponses: unknown[][], id: string = draftId) {
  const tx = createMockTx(selectResponses);
  mockDb.tx = tx;

  const response = await createTestApp().request(`/api/drafts/${id}/approval-readiness`, {
    headers: validSessionHeaders(),
  });

  return { response, tx };
}

function codeList(readiness: DraftApprovalReadinessOutput) {
  return readiness.checks.map((check) => check.code);
}

function currentDraft(overrides: Partial<DraftOutput> = {}): DraftOutput {
  return {
    id: draftId,
    workspaceId: testUser.workspaceId,
    taskId: null,
    leadId,
    opportunityId: null,
    contactId,
    status: "draft",
    channel: "email",
    subject: "Votre devis",
    textBody: "Bonjour, voici votre reponse.",
    htmlBody: null,
    metadata: {},
    createdAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z",
    ...overrides,
  };
}

function pendingApproval(draftApprovalId: string, targetDraftId: string): ApprovalOutput {
  return {
    id: draftApprovalId,
    workspaceId: testUser.workspaceId,
    draftId: targetDraftId,
    taskId: null,
    status: "pending",
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    metadata: {},
    createdAt: "2026-05-01T11:00:00.000Z",
    updatedAt: "2026-05-01T11:00:00.000Z",
  };
}

function createFakeDraftService(initialDraft: DraftOutput = currentDraft()) {
  const drafts = new Map([[initialDraft.id, initialDraft]]);
  const approvals: ApprovalOutput[] = [];

  const service: DraftService = {
    listDrafts: vi.fn(async () => [...drafts.values()]),
    getDraft: vi.fn(async (_workspaceId: string, id: string) => drafts.get(id) ?? null),
    createDraft: vi.fn(async () => ({ result: "conflict" }) satisfies DraftServiceMutationResult),
    updateDraft: vi.fn(async () => ({ result: "conflict" }) satisfies DraftServiceMutationResult),
    archiveDraft: vi.fn(async () => ({ result: "conflict" }) satisfies DraftServiceMutationResult),
    requestApproval: vi.fn(
      async (
        workspaceId: string,
        _actorUserId: string,
        id: string,
        input: RequestDraftApprovalInput,
      ): Promise<DraftApprovalRequestServiceResult> => {
        const draft = drafts.get(id);

        if (!draft || draft.workspaceId !== workspaceId) {
          return { result: "not_found" };
        }

        if (draft.status !== "draft") {
          return { result: "conflict" };
        }

        const requestedDraft = {
          ...draft,
          status: "pending_approval" as const,
          updatedAt: "2026-05-01T12:00:00.000Z",
        };
        const approval = {
          ...pendingApproval(approvalId, id),
          metadata: input.note ? { note: input.note } : {},
        };

        drafts.set(id, requestedDraft);
        approvals.push(approval);

        return { result: "ok", draft: requestedDraft, approval };
      },
    ),
  };

  return { service, drafts, approvals };
}

describe("GET /api/drafts/:id/approval-readiness", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(createActivityLog).mockClear();
  });

  it("returns ready for a valid manual draft", async () => {
    const { response } = await requestReadiness(readinessSelects(draftRow()));
    const body = (await response.json()) as { data: DraftApprovalReadinessOutput };

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      draftId,
      status: "ready",
      canRequestApproval: true,
      blockerCount: 0,
      warningCount: 0,
      checks: [],
      context: {
        draftStatus: "draft",
        channel: "email",
        hasLead: true,
        hasSubject: true,
        hasBody: true,
        hasContact: true,
        contactHasEmail: true,
        isAIGenerated: false,
      },
    });
  });

  it("returns ready for a valid AI draft", async () => {
    const row = draftRow({
      id: aiDraftId,
      metadataJson: {
        origin: "ai_draft_generation",
        aiRunId,
        sourceLeadScoreId,
        promptTemplateId: "draft-email-v1",
      },
    });
    const { response } = await requestReadiness(
      readinessSelects(row, { aiAudit: true }),
      aiDraftId,
    );
    const body = (await response.json()) as { data: DraftApprovalReadinessOutput };

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("ready");
    expect(body.data.context.isAIGenerated).toBe(true);
    expect(body.data.checks).toEqual([]);
  });

  it("blocks missing and trim-empty subject or body", async () => {
    const cases = [
      {
        row: draftRow({ subject: null }),
        code: "EMPTY_SUBJECT",
      },
      {
        row: draftRow({ subject: "   " }),
        code: "EMPTY_SUBJECT",
      },
      {
        row: draftRow({ textBody: null, htmlBody: null }),
        code: "EMPTY_BODY",
      },
      {
        row: draftRow({ textBody: "   ", htmlBody: "   " }),
        code: "EMPTY_BODY",
      },
    ];

    for (const testCase of cases) {
      const { response } = await requestReadiness(readinessSelects(testCase.row));
      const body = (await response.json()) as { data: DraftApprovalReadinessOutput };

      expect(response.status).toBe(200);
      expect(body.data.status).toBe("blocked");
      expect(body.data.canRequestApproval).toBe(false);
      expect(codeList(body.data)).toContain(testCase.code);
    }
  });

  it("blocks non-draft status, unsupported channel, missing lead, invalid contact, and pending approval", async () => {
    const cases = [
      {
        row: draftRow({ status: "pending_approval" }),
        options: {},
        code: "DRAFT_NOT_IN_DRAFT_STATE",
      },
      {
        row: draftRow({ channel: "sms" }),
        options: {},
        code: "UNSUPPORTED_CHANNEL",
      },
      {
        row: draftRow({ leadId: null, contactId: null }),
        options: {},
        code: "MISSING_LEAD",
      },
      {
        row: draftRow(),
        options: { lead: [] },
        code: "MISSING_LEAD",
      },
      {
        row: draftRow(),
        options: { contact: [] },
        code: "INVALID_CONTACT",
      },
      {
        row: draftRow(),
        options: { pendingApproval: [{ id: approvalId }] },
        code: "APPROVAL_ALREADY_PENDING",
      },
    ];

    for (const testCase of cases) {
      const { response } = await requestReadiness(
        readinessSelects(testCase.row, testCase.options),
      );
      const body = (await response.json()) as { data: DraftApprovalReadinessOutput };

      expect(response.status).toBe(200);
      expect(body.data.status).toBe("blocked");
      expect(codeList(body.data)).toContain(testCase.code);
    }
  });

  it("returns warnings for no contact, contact without email, and AI audit warnings", async () => {
    const noContact = await requestReadiness(
      readinessSelects(draftRow({ contactId: null })),
    );
    const noContactBody = (await noContact.response.json()) as {
      data: DraftApprovalReadinessOutput;
    };
    expect(noContactBody.data.status).toBe("ready_with_warnings");
    expect(noContactBody.data.canRequestApproval).toBe(true);
    expect(codeList(noContactBody.data)).toContain("NO_CONTACT_RECIPIENT");

    const noEmail = await requestReadiness(
      readinessSelects(draftRow(), { contact: [contactRow({ email: "   " })] }),
    );
    const noEmailBody = (await noEmail.response.json()) as {
      data: DraftApprovalReadinessOutput;
    };
    expect(noEmailBody.data.status).toBe("ready_with_warnings");
    expect(codeList(noEmailBody.data)).toContain("CONTACT_NO_EMAIL");

    const aiWarningRow = draftRow({
      id: aiDraftId,
      metadataJson: {
        origin: "ai_draft_generation",
        aiRunId,
        sourceLeadScoreId,
      },
    });
    const aiWarning = await requestReadiness(
      readinessSelects(aiWarningRow, {
        aiAudit: true,
        aiRun: [aiRunRow({ finishReason: "length" })],
      }),
      aiDraftId,
    );
    const aiWarningBody = (await aiWarning.response.json()) as {
      data: DraftApprovalReadinessOutput;
    };
    expect(aiWarningBody.data.status).toBe("ready_with_warnings");
    expect(codeList(aiWarningBody.data)).toContain("AI_RUN_FINISH_REASON_WARNING");
  });

  it("returns 404 for cross-workspace or non-existent drafts", async () => {
    for (const id of [otherWorkspaceDraftId, missingDraftId]) {
      const { response } = await requestReadiness([], id);

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        success: false,
        code: "DRAFT_NOT_FOUND",
      });
    }
  });

  it("is read-only and does not expose sensitive fields or call providers", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { response, tx } = await requestReadiness(
      readinessSelects(
        draftRow({
          subject: "Hidden subject",
          textBody: "Hidden text body",
          htmlBody: "<p>Hidden html body</p>",
          metadataJson: {
            origin: "ai_draft_generation",
            aiRunId,
            sourceLeadScoreId,
          },
        }),
        {
          contact: [contactRow()],
          aiAudit: true,
          aiRun: [aiRunRow({ finishReason: "length" })],
        },
      ),
    );
    const bodyText = JSON.stringify(await response.json());

    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
    expect(createActivityLog).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(bodyText).not.toContain("Hidden subject");
    expect(bodyText).not.toContain("Hidden text body");
    expect(bodyText).not.toContain("Hidden html body");
    expect(bodyText).not.toContain("client@example.test");
    expect(bodyText).not.toContain("+33600000000");
    expect(bodyText).not.toContain("Ada");
    expect(bodyText).not.toContain("Client");
    expect(bodyText).not.toContain("rawContent");
    expect(bodyText).not.toMatch(
      /promptJson|outputJson|inputPayload|outputPayload|outputText|errorMessage/i,
    );
    expect(bodyText).not.toMatch(/costEstimate|inputTokens|outputTokens/i);
  });
});

describe("POST /api/drafts/:id/request-approval readiness hardening", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(createActivityLog).mockClear();
  });

  it("lets a ready draft request approval with the existing success shape", async () => {
    mockDb.tx = createMockTx(readinessSelects(draftRow()));
    const draftStore = createFakeDraftService();
    const response = await createTestApp(draftStore.service).request(
      `/api/drafts/${draftId}/request-approval`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ note: "Please review" }),
      },
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        draft: {
          ...currentDraft(),
          status: "pending_approval",
          updatedAt: "2026-05-01T12:00:00.000Z",
        },
        approval: {
          ...pendingApproval(approvalId, draftId),
          metadata: { note: "Please review" },
        },
      },
    });
    expect(draftStore.drafts.get(draftId)?.status).toBe("pending_approval");
    expect(draftStore.approvals).toHaveLength(1);
  });

  it("allows warning-only readiness without sending email or mutating leads", async () => {
    mockDb.tx = createMockTx(readinessSelects(draftRow({ contactId: null })));
    const draftStore = createFakeDraftService(currentDraft({ contactId: null }));
    const response = await createTestApp(draftStore.service).request(
      `/api/drafts/${draftId}/request-approval`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      },
    );

    expect(response.status).toBe(201);
    expect(draftStore.approvals).toHaveLength(1);
    expect(draftStore.drafts.get(draftId)?.leadId).toBe(leadId);
  });

  it("blocks readiness failures before draft mutation, approval creation, or activity logs", async () => {
    mockDb.tx = createMockTx(readinessSelects(draftRow({ subject: "   " })));
    const draftStore = createFakeDraftService();
    const response = await createTestApp(draftStore.service).request(
      `/api/drafts/${draftId}/request-approval`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      },
    );
    const body = (await response.json()) as {
      code: string;
      details: { readiness: DraftApprovalReadinessOutput };
    };

    expect(response.status).toBe(409);
    expect(body.code).toBe("APPROVAL_READINESS_BLOCKED");
    expect(codeList(body.details.readiness)).toContain("EMPTY_SUBJECT");
    expect(draftStore.service.requestApproval).not.toHaveBeenCalled();
    expect(draftStore.approvals).toHaveLength(0);
    expect(draftStore.drafts.get(draftId)).toEqual(currentDraft());
    expect(createActivityLog).not.toHaveBeenCalled();
  });

  it("blocks duplicate pending approvals through readiness", async () => {
    mockDb.tx = createMockTx(
      readinessSelects(draftRow(), { pendingApproval: [{ id: approvalId }] }),
    );
    const draftStore = createFakeDraftService();
    const response = await createTestApp(draftStore.service).request(
      `/api/drafts/${draftId}/request-approval`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      },
    );
    const body = (await response.json()) as {
      details: { readiness: DraftApprovalReadinessOutput };
    };

    expect(response.status).toBe(409);
    expect(codeList(body.details.readiness)).toContain("APPROVAL_ALREADY_PENDING");
    expect(draftStore.service.requestApproval).not.toHaveBeenCalled();
  });

  it("returns 404 for cross-workspace drafts before request approval mutation", async () => {
    mockDb.tx = createMockTx([]);
    const draftStore = createFakeDraftService();
    const response = await createTestApp(draftStore.service).request(
      `/api/drafts/${otherWorkspaceDraftId}/request-approval`,
      {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      },
    );

    expect(response.status).toBe(404);
    expect(draftStore.service.requestApproval).not.toHaveBeenCalled();
    expect(draftStore.approvals).toHaveLength(0);
  });

  it("does not add send-email, public ai-runs, or provider behavior to readiness paths", () => {
    const files = [
      "src/routes/drafts.ts",
      "src/services/draft-approval-readiness.ts",
      "src/repositories/draft-approval-readiness.ts",
    ];
    const combined = files.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(combined).not.toMatch(/\bfetch\s*\(/);
    expect(combined).not.toMatch(/\bcomplete\s*\(/);
    expect(combined).not.toMatch(/\bOpenRouter\b/);
    expect(combined).not.toMatch(/\bResend\b/);
    expect(combined).not.toContain("SEND_EMAIL_PROVIDER");
    expect(combined).not.toContain("email_sends");
    expect(combined).not.toContain("send_email");
    expect(combined).not.toContain("ai-runs");
  });
});
