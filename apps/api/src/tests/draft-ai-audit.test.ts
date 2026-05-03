import { readFileSync } from "node:fs";

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import { createDraftRoutes } from "../routes/drafts.js";
import { createFakeAuthService, validSessionToken } from "./mocks/auth.js";
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
  createActivityLog: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000021999" })),
}));

const draftId = "00000000-0000-4000-8000-000000021001";
const manualDraftId = "00000000-0000-4000-8000-000000021002";
const otherWorkspaceDraftId = "00000000-0000-4000-8000-000000021003";
const leadId = "00000000-0000-4000-8000-000000021101";
const aiRunId = "00000000-0000-4000-8000-000000021201";
const otherWorkspaceAiRunId = "00000000-0000-4000-8000-000000021202";
const sourceLeadScoreId = "00000000-0000-4000-8000-000000021301";
const missingId = "00000000-0000-4000-8000-000000021404";

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
  };
}

function createTestApp(): Hono {
  const app = new Hono();

  app.route(
    "/api/drafts",
    createDraftRoutes({
      authService: createFakeAuthService(),
    }),
  );

  return app;
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
      throw new Error("audit route must not insert");
    }),
    update: vi.fn(() => {
      throw new Error("audit route must not update");
    }),
    delete: vi.fn(() => {
      throw new Error("audit route must not delete");
    }),
  };
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: draftId,
    leadId,
    metadataJson: {
      origin: "ai_draft_generation",
      aiRunId,
      promptTemplateId: "draft-email-v1",
      sourceLeadScoreId,
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
    latencyMs: 1234,
    finishReason: "stop",
    updatedAt: new Date("2026-05-01T16:00:02.000Z"),
    ...overrides,
  };
}

function sourceScoreRow(overrides: Record<string, unknown> = {}) {
  return {
    id: sourceLeadScoreId,
    score: 86,
    qualification: "hot",
    confidence: 91,
    createdAt: new Date("2026-05-01T15:30:00.000Z"),
    ...overrides,
  };
}

async function requestAudit(selectResponses: unknown[][], id: string = draftId) {
  const tx = createMockTx(selectResponses);
  mockDb.tx = tx;

  const response = await createTestApp().request(`/api/drafts/${id}/ai-audit`, {
    headers: validSessionHeaders(),
  });

  return { response, tx };
}

describe("GET /api/drafts/:id/ai-audit", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(createActivityLog).mockClear();
  });

  it("returns full audit for an AI-generated draft", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { response, tx } = await requestAudit([
      [draftRow()],
      [aiRunRow()],
      [sourceScoreRow()],
    ]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        draftId,
        leadId,
        origin: "ai_draft_generation",
        generatedAt: "2026-05-01T16:00:00.000Z",
        promptTemplateId: "draft-email-v1",
        aiRun: {
          id: aiRunId,
          status: "success",
          provider: "openrouter",
          model: "mistralai/mistral-small-2603",
          finishReason: "completed",
          latencyMs: 1234,
          completedAt: "2026-05-01T16:00:02.000Z",
        },
        sourceScore: {
          id: sourceLeadScoreId,
          score: 86,
          qualification: "hot",
          confidence: 91,
          scoredAt: "2026-05-01T15:30:00.000Z",
        },
        warnings: [],
      },
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
    expect(createActivityLog).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null data for a manual draft", async () => {
    const { response } = await requestAudit(
      [
        [
          draftRow({
            id: manualDraftId,
            metadataJson: { origin: "manual" },
          }),
        ],
      ],
      manualDraftId,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: null });
  });

  it("returns null data for a draft without metadata origin", async () => {
    const { response } = await requestAudit([
      [
        draftRow({
          metadataJson: {},
        }),
      ],
    ]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: null });
  });

  it("returns 404 for a non-existent draft", async () => {
    const { response } = await requestAudit([[]], missingId);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "DRAFT_NOT_FOUND",
    });
  });

  it("returns 404 for a cross-workspace draft", async () => {
    const { response } = await requestAudit([[]], otherWorkspaceDraftId);

    expect(response.status).toBe(404);
  });

  it("returns a partial audit when the ai_run is missing", async () => {
    const { response } = await requestAudit([[draftRow()], [], [sourceScoreRow()]]);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        aiRun: null,
        sourceScore: { id: sourceLeadScoreId },
        warnings: ["AI_RUN_NOT_FOUND"],
      },
    });
  });

  it("treats an ai_run from another workspace as missing", async () => {
    const { response } = await requestAudit([
      [
        draftRow({
          metadataJson: {
            origin: "ai_draft_generation",
            aiRunId: otherWorkspaceAiRunId,
            promptTemplateId: "draft-email-v1",
            sourceLeadScoreId,
          },
        }),
      ],
      [],
      [sourceScoreRow()],
    ]);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        aiRun: null,
        sourceScore: { id: sourceLeadScoreId },
        warnings: ["AI_RUN_NOT_FOUND"],
      },
    });
  });

  it("returns a partial audit when the source score is missing", async () => {
    const { response } = await requestAudit([[draftRow()], [aiRunRow()], []]);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        aiRun: { id: aiRunId },
        sourceScore: null,
        warnings: ["SOURCE_SCORE_NOT_FOUND"],
      },
    });
  });

  it("maps finish_reason stop to completed", async () => {
    const { response } = await requestAudit([
      [draftRow()],
      [aiRunRow({ finishReason: "stop" })],
      [sourceScoreRow()],
    ]);

    expect((await response.json()).data.aiRun.finishReason).toBe("completed");
  });

  it("maps finish_reason length to truncated with warning", async () => {
    const { response } = await requestAudit([
      [draftRow()],
      [aiRunRow({ finishReason: "length" })],
      [sourceScoreRow()],
    ]);
    const body = await response.json();

    expect(body.data.aiRun.finishReason).toBe("truncated");
    expect(body.data.warnings).toContain("AI_RUN_FINISH_REASON_WARNING");
  });

  it("maps content_filter to filtered with warning", async () => {
    const { response } = await requestAudit([
      [draftRow()],
      [aiRunRow({ finishReason: "content_filter" })],
      [sourceScoreRow()],
    ]);
    const body = await response.json();

    expect(body.data.aiRun.finishReason).toBe("filtered");
    expect(body.data.warnings).toContain("AI_RUN_FINISH_REASON_WARNING");
  });

  it("maps unknown and null finish reasons to unknown with warning", async () => {
    for (const finishReason of ["tool_calls", "", null]) {
      const { response } = await requestAudit([
        [draftRow()],
        [aiRunRow({ finishReason })],
        [sourceScoreRow()],
      ]);
      const body = await response.json();

      expect(body.data.aiRun.finishReason).toBe("unknown");
      expect(body.data.warnings).toContain("AI_RUN_FINISH_REASON_WARNING");
    }
  });

  it("returns partial audit warnings for invalid metadata", async () => {
    const { response } = await requestAudit([
      [
        draftRow({
          metadataJson: {
            origin: "ai_draft_generation",
            aiRunId: "not-a-uuid",
            promptTemplateId: 42,
            sourceLeadScoreId: "also-not-a-uuid",
          },
        }),
      ],
    ]);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.aiRun).toBeNull();
    expect(body.data.sourceScore).toBeNull();
    expect(body.data.promptTemplateId).toBeNull();
    expect(body.data.warnings).toEqual(
      expect.arrayContaining([
        "AI_RUN_INVALID",
        "SOURCE_SCORE_NOT_FOUND",
        "AI_DRAFT_METADATA_INVALID",
      ]),
    );
  });

  it("never returns sensitive AI, draft body, contact, cost, or token fields", async () => {
    const { response } = await requestAudit([
      [
        draftRow({
          subject: "Hidden subject",
          textBody: "Hidden body",
          htmlBody: "<p>Hidden body</p>",
          contactEmail: "client@example.com",
        }),
      ],
      [
        aiRunRow({
          outputText: "Hidden output",
          inputTokens: 1,
          outputTokens: 2,
          costEstimateMicroUsd: 3,
          costEstimateCents: 4,
          costCents: 5,
          errorMessage: "Hidden failure",
        }),
      ],
      [sourceScoreRow()],
    ]);
    const bodyText = JSON.stringify(await response.json());

    expect(bodyText).not.toMatch(
      /prompt_json|output_json|input_payload|output_payload|output_text|error_message/i,
    );
    expect(bodyText).not.toMatch(
      /cost_estimate|costEstimate|input_tokens|inputTokens|output_tokens|outputTokens|costCents/i,
    );
    expect(bodyText).not.toMatch(/subject|textBody|htmlBody|client@example\.com/i);
    expect(bodyText).not.toMatch(/firstName|lastName|phone/i);
  });

  it("does not mutate drafts, leads, ai_runs, background_jobs, or activity_logs", async () => {
    const { tx } = await requestAudit([[draftRow()], [aiRunRow()], [sourceScoreRow()]]);

    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
    expect(createActivityLog).not.toHaveBeenCalled();
  });

  it("does not add provider, send, approval, or external HTTP behavior to audit code", () => {
    const files = [
      "src/repositories/draft-ai-audit.ts",
      "src/services/draft-ai-audit.ts",
      "src/routes/drafts.ts",
    ];
    const combined = files.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(combined).not.toMatch(/\bfetch\s*\(/);
    expect(combined).not.toMatch(/\bcomplete\s*\(/);
    expect(combined).not.toMatch(/\bOpenRouter\b/);
    expect(combined).not.toMatch(/\bResend\b/);
    expect(combined).not.toContain("SEND_EMAIL_PROVIDER");
    expect(combined).not.toContain(otherWorkspaceId);
  });
});
