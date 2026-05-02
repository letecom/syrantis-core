import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  LeadOutput,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import { requestLeadScore } from "../repositories/lead-scoring.js";
import { createLeadRoutes } from "../routes/leads.js";
import {
  AiOutputParseError,
  AiOutputSchemaError,
  buildLeadScoringPrompt,
  parseLeadScoringOutput,
} from "../services/ai/lead-scoring-prompt.js";
import {
  AiFinishReasonError,
  AiProviderHttpError,
  AiProviderInvalidResponseError,
  AiProviderTimeoutError,
  OpenRouterProvider,
} from "../services/ai/openrouter-provider.js";
import { redactLeadForScoring } from "../services/ai/pii-redaction.js";
import {
  calculateAiCostMicroUsd,
  resolveAllowedAiModel,
} from "../services/ai/pricing.js";
import type { AiProvider } from "../services/ai/providers.js";
import { handleScoreLeadJob } from "../services/score-lead-job-handler.js";
import type { LeadService } from "../services/leads.js";
import { createFakeAuthService, testUser, validSessionToken } from "./mocks/auth.js";
import { otherWorkspaceId } from "./mocks/tasks.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown,
  txQueue: [] as unknown[],
  events: [] as string[],
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = mockDb.txQueue.shift() ?? mockDb.tx;
    const label = typeof tx === "object" && tx !== null && "label" in tx ? String(tx.label) : "tx";
    mockDb.events.push(`tx:start:${label}`);
    const result = await fn(tx);
    mockDb.events.push(`tx:end:${label}`);
    return result;
  }),
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async (_tx: unknown, input: Record<string, unknown>) => ({
    id: "00000000-0000-4000-8000-000000003999",
    ...input,
  })),
}));

const leadId = "00000000-0000-4000-8000-000000003001";
const otherWorkspaceLeadId = "00000000-0000-4000-8000-000000003002";
const jobId = "00000000-0000-4000-8000-000000003101";
const aiRunId = "00000000-0000-4000-8000-000000003201";
const leadScoreId = "00000000-0000-4000-8000-000000003301";

const leadOutput: LeadOutput = {
  id: leadId,
  workspaceId: testUser.workspaceId,
  organizationId: null,
  contactId: null,
  source: "form",
  status: "new",
  rawContent: "john.doe@acme.com called from +33612345678 about an urgent boiler replacement.",
  metadata: { urgency: "high", internalNote: "john.doe@acme.com" },
  score: null,
  scoreReason: null,
  receivedAt: "2026-05-01T10:00:00.000Z",
  createdAt: "2026-05-01T10:00:00.000Z",
  updatedAt: "2026-05-01T10:00:00.000Z",
};

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
  };
}

function createTestApp(leadService: LeadService): Hono {
  const app = new Hono();

  app.route(
    "/api/leads",
    createLeadRoutes({
      authService: createFakeAuthService(),
      leadService,
    }),
  );

  return app;
}

function createRouteLeadService(): LeadService {
  return {
    listLeads: vi.fn(async () => ({
      result: "ok" as const,
      leads: [leadOutput],
    })),
    getLead: vi.fn(async (workspaceId: string, id: string) =>
      workspaceId === testUser.workspaceId && id === leadId ? leadOutput : null,
    ),
    createLead: vi.fn(async () => ({ result: "conflict" as const })),
    updateLead: vi.fn(async () => ({ result: "conflict" as const })),
    requestLeadScore: vi.fn(async (workspaceId: string, _actorUserId: string, id: string) => {
      if (workspaceId !== testUser.workspaceId || id !== leadId) {
        return { result: "not_found" as const };
      }

      return {
        result: "ok" as const,
        jobId,
        leadId: id,
      };
    }),
  };
}

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    leftJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(async () => response),
  };

  return builder;
}

function createInsertBuilder(insertedValues: Record<string, unknown>[], responseQueue: unknown[]) {
  return {
    values: vi.fn((values: Record<string, unknown>) => {
      insertedValues.push(values);
      return {
        returning: vi.fn(async () => {
          const response = responseQueue.shift();
          return response ? [response] : [];
        }),
      };
    }),
  };
}

function createMockTx(input: {
  label?: string;
  selectResponses: unknown[][];
  insertResponses: unknown[];
}) {
  const insertedValues: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const selectResponses = [...input.selectResponses];
  const insertResponses = [...input.insertResponses];

  const tx = {
    label: input.label ?? "tx",
    select: vi.fn(() => createSelectBuilder(selectResponses.shift() ?? [])),
    insert: vi.fn(() => createInsertBuilder(insertedValues, insertResponses)),
    update: vi.fn((table: unknown) => {
      void table;

      return {
        set: vi.fn((values: Record<string, unknown>) => {
          updates.push(values);
          return {
            where: vi.fn(async () => []),
          };
        }),
      };
    }),
  };

  return {
    tx,
    insertedValues,
    updates,
  };
}

function leadContextRow(overrides: Record<string, unknown> = {}) {
  return {
    leadId,
    source: "form",
    status: "new",
    rawContent: "john.doe@acme.com and +33612345678 need a heating quote quickly.",
    metadataJson: { urgency: "high", freeform: "john.doe@acme.com" },
    contactRoleTitle: "Facilities manager",
    organizationSector: "heating",
    organizationStatus: "prospect",
    ...overrides,
  };
}

function validProvider(content: string): AiProvider {
  return {
    complete: vi.fn(async () => ({
      content,
      inputTokens: 42,
      outputTokens: 36,
      model: "mistralai/mistral-small-2603",
      provider: "openrouter" as const,
      finishReason: "stop",
      costEstimateMicroUsd: 1,
    })),
  };
}

function validScoreJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    score: 82,
    qualification: "hot",
    summary: "Urgent qualified heating request.",
    rationale: "The lead has immediate need and clear service intent.",
    recommended_action: "Call today and prepare a quote follow-up.",
    confidence: 88,
    ...overrides,
  });
}

function openRouterJsonResponse(input: {
  status?: number;
  finishReason?: string;
  content?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  model?: string;
  body?: Record<string, unknown>;
}) {
  return new Response(
    JSON.stringify(
      input.body ?? {
        choices: [
          {
            finish_reason: input.finishReason ?? "stop",
            message: {
              content: input.content ?? validScoreJson(),
            },
          },
        ],
        model: input.model ?? "mistralai/mistral-small-2603",
        usage: {
          prompt_tokens: input.promptTokens ?? 1000,
          completion_tokens: input.completionTokens ?? 1000,
        },
      },
    ),
    {
      status: input.status ?? 200,
      headers: {
        "content-type": "application/json",
      },
    },
  );
}

function providerInput(overrides: Partial<Parameters<OpenRouterProvider["complete"]>[0]> = {}) {
  return {
    model: "mistralai/mistral-small-2603",
    messages: [{ role: "user" as const, content: "redacted prompt" }],
    maxTokens: 100,
    temperature: 0.1,
    timeoutMs: 15_000,
    ...overrides,
  };
}

describe("OpenRouter provider hardening", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    vi.unstubAllGlobals();
  });

  it("model.allowlist.accepts_mistral", () => {
    expect(resolveAllowedAiModel("mistralai/mistral-small-2603")).toBe("mistralai/mistral-small-2603");
  });

  it("model.allowlist.rejects_gpt5mini before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new OpenRouterProvider().complete(providerInput({ model: "openai/gpt-5-mini" })),
    ).rejects.toThrow("AI_MODEL_NOT_ALLOWED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("provider.finish_reason_stop_success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => openRouterJsonResponse({ finishReason: "stop" })));

    const output = await new OpenRouterProvider().complete(providerInput());

    expect(output).toMatchObject({
      provider: "openrouter",
      finishReason: "stop",
      inputTokens: 1000,
      outputTokens: 1000,
      costEstimateMicroUsd: 750,
    });
  });

  it("provider.finish_reason_length_retries_once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(openRouterJsonResponse({ finishReason: "length" }))
      .mockResolvedValueOnce(openRouterJsonResponse({ finishReason: "stop" }));
    vi.stubGlobal("fetch", fetchMock);

    await new OpenRouterProvider().complete(providerInput({ maxTokens: 100 }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toMatchObject({
      max_tokens: 200,
    });
  });

  it("provider.finish_reason_length_twice_fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(openRouterJsonResponse({ finishReason: "length" }))
        .mockResolvedValueOnce(openRouterJsonResponse({ finishReason: "length" })),
    );

    await expect(new OpenRouterProvider().complete(providerInput())).rejects.toThrow(AiFinishReasonError);
  });

  it("provider.content_filter_fails_without_retry", async () => {
    const fetchMock = vi.fn(async () => openRouterJsonResponse({ finishReason: "content_filter" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new OpenRouterProvider().complete(providerInput())).rejects.toThrow("AI_CONTENT_FILTERED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("provider.http_429_retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(openRouterJsonResponse({ status: 429 }))
      .mockResolvedValueOnce(openRouterJsonResponse({ finishReason: "stop" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new OpenRouterProvider().complete(providerInput())).resolves.toMatchObject({
      finishReason: "stop",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("provider.http_400_no_retry", async () => {
    const fetchMock = vi.fn(async () => openRouterJsonResponse({ status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new OpenRouterProvider().complete(providerInput())).rejects.toThrow(AiProviderHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("provider.timeout_retries", async () => {
    const timeout = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchMock = vi.fn().mockRejectedValue(timeout);
    vi.stubGlobal("fetch", fetchMock);

    await expect(new OpenRouterProvider().complete(providerInput())).rejects.toThrow(AiProviderTimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("provider.invalid_openrouter_response_fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => openRouterJsonResponse({ body: { nope: true } })));

    await expect(new OpenRouterProvider().complete(providerInput())).rejects.toThrow(
      AiProviderInvalidResponseError,
    );
  });

  it("provider.cost_calculation_micro_usd", () => {
    expect(
      calculateAiCostMicroUsd({
        model: "mistralai/mistral-small-2603",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBe(750_000);
  });
});

describe("lead scoring output parser", () => {
  it("accepts strict JSON", () => {
    expect(parseLeadScoringOutput(validScoreJson())).toMatchObject({
      score: 82,
      qualification: "hot",
    });
  });

  it("accepts JSON inside a json code fence", () => {
    expect(parseLeadScoringOutput(`\`\`\`json\n${validScoreJson()}\n\`\`\``)).toMatchObject({
      score: 82,
      qualification: "hot",
    });
  });

  it("accepts one JSON object surrounded by text", () => {
    expect(parseLeadScoringOutput(`Here is the score:\n${validScoreJson()}\nDone.`)).toMatchObject({
      score: 82,
      qualification: "hot",
    });
  });

  it("rejects missing JSON object with AI_OUTPUT_INVALID_JSON", () => {
    expect(() => parseLeadScoringOutput("No structured object here.")).toThrow(AiOutputParseError);
  });

  it("rejects invalid schema with AI_OUTPUT_INVALID_SCHEMA and safe preview", () => {
    expect(() => parseLeadScoringOutput(validScoreJson({ score: 150 }))).toThrow(AiOutputSchemaError);

    try {
      parseLeadScoringOutput(validScoreJson({ score: 150 }));
    } catch (error) {
      expect(error).toBeInstanceOf(AiOutputSchemaError);
      expect((error as AiOutputSchemaError).code).toBe("AI_OUTPUT_INVALID_SCHEMA");
      expect((error as AiOutputSchemaError).rawPreview.length).toBeLessThanOrEqual(1000);
    }
  });
});

describe("AI lead scoring redaction", () => {
  it("removes raw email and phone from redacted input and prompt", () => {
    const redacted = redactLeadForScoring({
      lead: {
        source: "form",
        status: "new",
        rawContent: "john.doe@acme.com wants a callback at +33612345678.",
        metadataJson: {
          urgency: "call +33612345678",
          freeform: "john.doe@acme.com",
        },
      },
      contact: { roleTitle: "Owner" },
      organization: { sector: "heating", status: "prospect" },
    });
    const prompt = buildLeadScoringPrompt(redacted);
    const serialized = JSON.stringify({ redacted, prompt });

    expect(serialized).not.toContain("john.doe@acme.com");
    expect(serialized).not.toContain("+33612345678");
    expect(serialized).toContain("[redacted_email]");
    expect(serialized).toContain("[redacted_phone]");
  });
});

describe("POST /api/leads/:id/score", () => {
  it("returns 401 without session", async () => {
    const app = createTestApp(createRouteLeadService());

    const response = await app.request(`/api/leads/${leadId}/score`, {
      method: "POST",
    });

    expect(response.status).toBe(401);
  });

  it("returns 202 and delegates score_lead job creation without calling a provider", async () => {
    const provider = validProvider(validScoreJson());
    const leadService = createRouteLeadService();
    const app = createTestApp(leadService);

    const response = await app.request(`/api/leads/${leadId}/score`, {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        jobId,
        leadId,
      },
    });
    expect(leadService.requestLeadScore).toHaveBeenCalledWith(testUser.workspaceId, testUser.id, leadId);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it("returns 404 for a cross-workspace lead", async () => {
    const app = createTestApp(createRouteLeadService());

    const response = await app.request(`/api/leads/${otherWorkspaceLeadId}/score`, {
      method: "POST",
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(404);
  });
});

describe("lead score request repository", () => {
  beforeEach(() => {
    vi.mocked(createActivityLog).mockClear();
  });

  it("creates a pending score_lead job and compact activity log", async () => {
    const harness = createMockTx({
      selectResponses: [[{ id: leadId }]],
      insertResponses: [
        {
          id: jobId,
          workspaceId: testUser.workspaceId,
          type: "score_lead",
          payloadJson: { leadId },
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
        },
      ],
    });
    mockDb.tx = harness.tx;

    const result = await requestLeadScore({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      leadId,
    });

    expect(result).toMatchObject({
      result: "ok",
      leadId,
      job: {
        id: jobId,
        type: "score_lead",
        status: "pending",
        payloadJson: { leadId },
      },
    });
    expect(harness.insertedValues[0]).toMatchObject({
      workspaceId: testUser.workspaceId,
      type: "score_lead",
      status: "pending",
      payloadJson: { leadId },
    });
    expect(createActivityLog).toHaveBeenCalledWith(
      harness.tx,
      expect.objectContaining({
        action: "lead.score_requested",
        entityType: "lead",
        entityId: leadId,
        metadataJson: { jobId },
      }),
    );
  });

  it("returns not_found for missing or cross-workspace lead and does not create a job", async () => {
    const harness = createMockTx({
      selectResponses: [[]],
      insertResponses: [],
    });
    mockDb.tx = harness.tx;

    const result = await requestLeadScore({
      workspaceId: otherWorkspaceId,
      actorUserId: testUser.id,
      leadId,
    });

    expect(result).toEqual({ result: "not_found" });
    expect(harness.tx.insert).not.toHaveBeenCalled();
    expect(createActivityLog).not.toHaveBeenCalled();
  });
});

describe("score_lead worker handler", () => {
  beforeEach(() => {
    vi.mocked(createActivityLog).mockClear();
    mockDb.tx = undefined;
    mockDb.txQueue = [];
    mockDb.events = [];
  });

  it("creates an ai_run and lead_score for valid provider JSON without mutating leads", async () => {
    const prepareTx = createMockTx({
      label: "prepare",
      selectResponses: [[leadContextRow()]],
      insertResponses: [
        {
          id: aiRunId,
          workspaceId: testUser.workspaceId,
          status: "running",
        },
      ],
    });
    const successTx = createMockTx({
      label: "success",
      selectResponses: [],
      insertResponses: [
        {
          id: leadScoreId,
          workspaceId: testUser.workspaceId,
          leadId,
          aiRunId,
        },
      ],
    });
    const provider = validProvider(validScoreJson());
    mockDb.txQueue = [prepareTx.tx, successTx.tx];

    await handleScoreLeadJob({
      workspaceId: testUser.workspaceId,
      jobId,
      payload: { leadId },
      provider,
      model: "mistralai/mistral-small-2603",
    });

    expect(successTx.tx.update).toHaveBeenCalledTimes(1);
    expect(successTx.updates[0]).toMatchObject({
      status: "success",
      inputTokens: 42,
      outputTokens: 36,
      finishReason: "stop",
      costEstimateMicroUsd: 28,
    });
    expect(prepareTx.insertedValues[0]).toMatchObject({
      workspaceId: testUser.workspaceId,
      jobId,
      referenceType: "lead",
      referenceId: leadId,
      purpose: "scoring",
      provider: "openrouter",
      status: "running",
    });
    expect(successTx.insertedValues[0]).toMatchObject({
      workspaceId: testUser.workspaceId,
      leadId,
      aiRunId,
      score: 82,
      qualification: "hot",
    });
    expect(createActivityLog).toHaveBeenCalledWith(
      successTx.tx,
      expect.objectContaining({
        action: "lead.scored",
        metadataJson: expect.objectContaining({
          leadScoreId,
          score: 82,
          qualification: "hot",
        }),
      }),
    );
  });

  it("does not hold a transaction during provider call", async () => {
    const prepareTx = createMockTx({
      label: "prepare",
      selectResponses: [[leadContextRow()]],
      insertResponses: [
        {
          id: aiRunId,
          workspaceId: testUser.workspaceId,
          status: "running",
        },
      ],
    });
    const successTx = createMockTx({
      label: "success",
      selectResponses: [],
      insertResponses: [
        {
          id: leadScoreId,
          workspaceId: testUser.workspaceId,
          leadId,
          aiRunId,
        },
      ],
    });
    const provider: AiProvider = {
      complete: vi.fn(async () => {
        mockDb.events.push("provider");
        return {
          content: validScoreJson(),
          inputTokens: 42,
          outputTokens: 36,
          model: "mistralai/mistral-small-2603",
          provider: "openrouter" as const,
          finishReason: "stop",
          costEstimateMicroUsd: 28,
        };
      }),
    };
    mockDb.txQueue = [prepareTx.tx, successTx.tx];

    await handleScoreLeadJob({
      workspaceId: testUser.workspaceId,
      jobId,
      payload: { leadId },
      provider,
      model: "mistralai/mistral-small-2603",
    });

    expect(mockDb.events).toEqual([
      "tx:start:prepare",
      "tx:end:prepare",
      "provider",
      "tx:start:success",
      "tx:end:success",
    ]);
  });

  it("marks ai_run error and does not create lead_score for invalid provider JSON", async () => {
    const prepareTx = createMockTx({
      label: "prepare",
      selectResponses: [[leadContextRow()]],
      insertResponses: [
        {
          id: aiRunId,
          workspaceId: testUser.workspaceId,
          status: "running",
        },
      ],
    });
    const failureTx = createMockTx({
      label: "failure",
      selectResponses: [],
      insertResponses: [],
    });
    mockDb.txQueue = [prepareTx.tx, failureTx.tx];

    await expect(
      handleScoreLeadJob({
        workspaceId: testUser.workspaceId,
        jobId,
        payload: { leadId },
        provider: validProvider("not json"),
        model: "mistralai/mistral-small-2603",
      }),
    ).rejects.toThrow("AI_OUTPUT_INVALID_JSON");

    expect(prepareTx.insertedValues).toHaveLength(1);
    expect(failureTx.insertedValues).toHaveLength(0);
    expect(failureTx.updates[0]).toMatchObject({
      status: "error",
      errorMessage: "AI_OUTPUT_INVALID_JSON",
      outputText: "not json",
      outputJson: { rawPreview: "not json" },
    });
    expect(failureTx.tx.insert).not.toHaveBeenCalled();
  });

  it("marks ai_run error and does not create lead_score for out-of-range score", async () => {
    const prepareTx = createMockTx({
      label: "prepare",
      selectResponses: [[leadContextRow()]],
      insertResponses: [
        {
          id: aiRunId,
          workspaceId: testUser.workspaceId,
          status: "running",
        },
      ],
    });
    const failureTx = createMockTx({
      label: "failure",
      selectResponses: [],
      insertResponses: [],
    });
    mockDb.txQueue = [prepareTx.tx, failureTx.tx];

    await expect(
      handleScoreLeadJob({
        workspaceId: testUser.workspaceId,
        jobId,
        payload: { leadId },
        provider: validProvider(validScoreJson({ score: 150 })),
        model: "mistralai/mistral-small-2603",
      }),
    ).rejects.toThrow("AI_OUTPUT_INVALID_SCHEMA");

    expect(prepareTx.insertedValues).toHaveLength(1);
    expect(failureTx.insertedValues).toHaveLength(0);
    expect(failureTx.updates[0]).toMatchObject({
      status: "error",
      errorMessage: "AI_OUTPUT_INVALID_SCHEMA",
    });
  });

  it("stores a redacted prompt snapshot without raw PII", async () => {
    const prepareTx = createMockTx({
      label: "prepare",
      selectResponses: [[leadContextRow()]],
      insertResponses: [
        {
          id: aiRunId,
          workspaceId: testUser.workspaceId,
          status: "running",
        },
      ],
    });
    const successTx = createMockTx({
      label: "success",
      selectResponses: [],
      insertResponses: [
        {
          id: leadScoreId,
          workspaceId: testUser.workspaceId,
          leadId,
          aiRunId,
        },
      ],
    });
    mockDb.txQueue = [prepareTx.tx, successTx.tx];

    await handleScoreLeadJob({
      workspaceId: testUser.workspaceId,
      jobId,
      payload: { leadId },
      provider: validProvider(validScoreJson()),
      model: "mistralai/mistral-small-2603",
    });

    const promptSnapshot = JSON.stringify(prepareTx.insertedValues[0]?.promptJson);
    const activityLogs = JSON.stringify(vi.mocked(createActivityLog).mock.calls);

    expect(promptSnapshot).not.toContain("john.doe@acme.com");
    expect(promptSnapshot).not.toContain("+33612345678");
    expect(activityLogs).not.toContain("john.doe@acme.com");
    expect(activityLogs).not.toContain("+33612345678");
  });
});
