import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  LeadOutput,
  LeadScoreReadModel,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import { requestLeadScore } from "../repositories/lead-scoring.js";
import { getLatestLeadScore, listLeadScores } from "../repositories/lead-scores.js";
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
import type { LeadScoreService } from "../services/lead-scores.js";
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
const noScoreLeadId = "00000000-0000-4000-8000-000000003099";
const jobId = "00000000-0000-4000-8000-000000003101";
const aiRunId = "00000000-0000-4000-8000-000000003201";
const leadScoreId = "00000000-0000-4000-8000-000000003301";
const leadScoreId2 = "00000000-0000-4000-8000-000000003302";
const leadScoreId3 = "00000000-0000-4000-8000-000000003303";

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

function leadScoreOutput(overrides: Partial<LeadScoreReadModel> = {}): LeadScoreReadModel {
  return {
    id: leadScoreId,
    leadId,
    score: 82,
    qualification: "hot",
    summary: "Urgent qualified workflow request.",
    rationale: "The lead has immediate need and clear service intent.",
    recommendedAction: "Call today and prepare a quote follow-up.",
    confidence: 88,
    model: "mistralai/mistral-small-2603",
    promptTemplateId: "lead-score-v1",
    scoredAt: "2026-05-01T13:00:00.000Z",
    ...overrides,
  };
}

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
  };
}

function createTestApp(leadService: LeadService, leadScoreService?: LeadScoreService): Hono {
  const app = new Hono();

  app.route(
    "/api/leads",
    createLeadRoutes({
      authService: createFakeAuthService(),
      leadService,
      ...(leadScoreService ? { leadScoreService } : {}),
    }),
  );

  return app;
}

function createRouteLeadScoreService(): LeadScoreService {
  const scores = new Map<string, LeadScoreReadModel[]>([
    [leadId, [leadScoreOutput()]],
  ]);

  return {
    getLatestLeadScore: vi.fn(async (workspaceId: string, id: string) => {
      if (workspaceId !== testUser.workspaceId || id === otherWorkspaceLeadId) {
        return { result: "not_found" as const };
      }

      if (id !== leadId && id !== noScoreLeadId) {
        return { result: "not_found" as const };
      }

      return {
        result: "ok" as const,
        score: scores.get(id)?.[0] ?? null,
      };
    }),
    listLeadScores: vi.fn(async (workspaceId: string, id: string, query) => {
      if (workspaceId !== testUser.workspaceId || id === otherWorkspaceLeadId) {
        return { result: "not_found" as const };
      }

      if (id !== leadId && id !== noScoreLeadId) {
        return { result: "not_found" as const };
      }

      const rows = scores.get(id) ?? [];
      const cursor = query.cursor ? new Date(query.cursor) : null;
      const filtered = cursor ? rows.filter((score) => new Date(score.scoredAt) < cursor) : rows;
      const page = filtered.slice(0, query.limit);
      const next = filtered.length > query.limit ? page[page.length - 1]?.scoredAt ?? null : null;

      return {
        result: "ok" as const,
        scores: page,
        nextCursor: next,
      };
    }),
  };
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
    orderBy: vi.fn(() => builder),
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

function leadScoreReadRow(input: {
  id?: string;
  createdAt: string;
  score?: number;
  qualification?: "cold" | "warm" | "hot";
}) {
  return {
    id: input.id ?? leadScoreId,
    leadId,
    score: input.score ?? 82,
    qualification: input.qualification ?? "hot",
    summary: "Urgent qualified workflow request.",
    rationale: "The lead has immediate need and clear service intent.",
    recommendedAction: "Call today and prepare a quote follow-up.",
    confidence: 88,
    model: "mistralai/mistral-small-2603",
    promptTemplateId: "lead-score-v1",
    createdAt: new Date(input.createdAt),
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

function repeatedText(value: string, minLength: number): string {
  return value.repeat(Math.ceil(minLength / value.length));
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

  it("accepts real-style Mistral output with controlled long field normalization", () => {
    const parsed = parseLeadScoringOutput(
      validScoreJson({
        summary: repeatedText("Qualified B2B workflow opportunity. ", 320),
        rationale: repeatedText("Strong workflow intent and clear operational context. ", 650),
        recommended_action: repeatedText("Prepare a concise qualification follow-up. ", 360),
      }),
    );

    expect(parsed.summary.length).toBeLessThanOrEqual(280);
    expect(parsed.rationale.length).toBeLessThanOrEqual(500);
    expect(parsed.recommended_action.length).toBeLessThanOrEqual(240);
    expect(parsed.score).toBe(82);
    expect(parsed.qualification).toBe("hot");
  });

  it("rejects missing required fields", () => {
    const missingAction = JSON.stringify({
      score: 82,
      qualification: "hot",
      summary: "Qualified opportunity.",
      rationale: "Clear workflow fit.",
      confidence: 88,
    });

    expect(() => parseLeadScoringOutput(missingAction)).toThrow(AiOutputSchemaError);
  });

  it("rejects missing JSON object with AI_OUTPUT_INVALID_JSON", () => {
    expect(() => parseLeadScoringOutput("No structured object here.")).toThrow(AiOutputParseError);
  });

  it("rejects score outside range", () => {
    expect(() => parseLeadScoringOutput(validScoreJson({ score: 150 }))).toThrow(AiOutputSchemaError);
  });

  it("rejects invalid qualification", () => {
    expect(() => parseLeadScoringOutput(validScoreJson({ qualification: "burning" }))).toThrow(
      AiOutputSchemaError,
    );
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
  it("uses Syrantis context and no outdated vertical context", () => {
    const prompt = buildLeadScoringPrompt(
      redactLeadForScoring({
        lead: {
          source: "form",
          status: "new",
          rawContent: "Workflow automation request.",
          metadataJson: {},
        },
        contact: null,
        organization: null,
      }),
    );
    const serialized = JSON.stringify(prompt);

    expect(serialized).toContain("Syrantis is a B2B AI orchestration and CRM workflow automation infrastructure platform.");
    expect(serialized).not.toMatch(/plumbing|heating contractor/i);
    expect(serialized).toContain("Return compact JSON only. No markdown. No long paragraphs.");
  });

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
    const app = createTestApp(createRouteLeadService(), createRouteLeadScoreService());

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

describe("GET /api/leads/:id/score", () => {
  it("get.score.success returns the latest public read model without forbidden fields", async () => {
    const app = createTestApp(createRouteLeadService(), createRouteLeadScoreService());

    const response = await app.request(`/api/leads/${leadId}/score`, {
      headers: validSessionHeaders(),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      id: leadScoreId,
      leadId,
      score: 82,
      qualification: "hot",
      recommendedAction: "Call today and prepare a quote follow-up.",
      promptTemplateId: "lead-score-v1",
      scoredAt: "2026-05-01T13:00:00.000Z",
    });
    for (const field of [
      "workspaceId",
      "aiRunId",
      "jobId",
      "promptJson",
      "outputJson",
      "inputPayload",
      "outputPayload",
      "errorMessage",
      "finishReason",
      "costEstimateMicroUsd",
      "costEstimateCents",
      "inputTokens",
      "outputTokens",
    ]) {
      expect(body.data).not.toHaveProperty(field);
    }
  });

  it("get.score.no_score returns null", async () => {
    const app = createTestApp(createRouteLeadService(), createRouteLeadScoreService());

    const response = await app.request(`/api/leads/${noScoreLeadId}/score`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: null,
    });
  });

  it("get.score.lead_not_found returns 404", async () => {
    const app = createTestApp(createRouteLeadService(), createRouteLeadScoreService());

    const response = await app.request(`/api/leads/00000000-0000-4000-8000-000000003404/score`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(404);
  });

  it("get.score.cross_workspace returns 404", async () => {
    const app = createTestApp(createRouteLeadService(), createRouteLeadScoreService());

    const response = await app.request(`/api/leads/${otherWorkspaceLeadId}/score`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(404);
  });
});

describe("GET /api/leads/:id/scores", () => {
  it("get.scores.empty returns an empty list without nextCursor", async () => {
    const app = createTestApp(createRouteLeadService(), createRouteLeadScoreService());

    const response = await app.request(`/api/leads/${noScoreLeadId}/scores`, {
      headers: validSessionHeaders(),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: [],
    });
    expect(body).not.toHaveProperty("nextCursor");
  });

  it("get.scores.limit_max returns 400", async () => {
    const app = createTestApp(createRouteLeadService(), createRouteLeadScoreService());

    const response = await app.request(`/api/leads/${leadId}/scores?limit=100`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(400);
  });

  it("get.scores.invalid_cursor returns 400", async () => {
    const app = createTestApp(createRouteLeadService(), createRouteLeadScoreService());

    const response = await app.request(`/api/leads/${leadId}/scores?cursor=not-a-date`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(400);
  });

  it("get.scores.forbidden_fields omits internal audit and provider fields", async () => {
    const app = createTestApp(createRouteLeadService(), createRouteLeadScoreService());

    const response = await app.request(`/api/leads/${leadId}/scores`, {
      headers: validSessionHeaders(),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    for (const field of [
      "workspaceId",
      "aiRunId",
      "jobId",
      "promptJson",
      "outputJson",
      "inputPayload",
      "outputPayload",
      "errorMessage",
      "finishReason",
      "costEstimateMicroUsd",
      "costEstimateCents",
      "inputTokens",
      "outputTokens",
    ]) {
      expect(body.data[0]).not.toHaveProperty(field);
    }
  });
});

describe("lead score read repository", () => {
  it("get.scores.order returns scores by createdAt desc", async () => {
    const rows = [
      leadScoreReadRow({ id: leadScoreId3, createdAt: "2026-05-01T15:00:00.000Z", score: 90 }),
      leadScoreReadRow({ id: leadScoreId2, createdAt: "2026-05-01T14:00:00.000Z", score: 80 }),
      leadScoreReadRow({ id: leadScoreId, createdAt: "2026-05-01T13:00:00.000Z", score: 70 }),
    ];
    const harness = createMockTx({
      selectResponses: [[{ id: leadId }], rows],
      insertResponses: [],
    });
    mockDb.tx = harness.tx;

    const result = await listLeadScores({
      workspaceId: testUser.workspaceId,
      leadId,
      limit: 20,
    });

    expect(result).toMatchObject({
      result: "ok",
      scores: [
        { id: leadScoreId3, score: 90 },
        { id: leadScoreId2, score: 80 },
        { id: leadScoreId, score: 70 },
      ],
      nextCursor: null,
    });
    expect(harness.tx.insert).not.toHaveBeenCalled();
    expect(harness.tx.update).not.toHaveBeenCalled();
  });

  it("get.scores.pagination returns limit rows and a next cursor", async () => {
    const rows = [
      leadScoreReadRow({ id: leadScoreId3, createdAt: "2026-05-01T15:00:00.000Z", score: 90 }),
      leadScoreReadRow({ id: leadScoreId2, createdAt: "2026-05-01T14:00:00.000Z", score: 80 }),
      leadScoreReadRow({ id: leadScoreId, createdAt: "2026-05-01T13:00:00.000Z", score: 70 }),
    ];
    const firstPage = createMockTx({
      selectResponses: [[{ id: leadId }], rows],
      insertResponses: [],
    });
    mockDb.tx = firstPage.tx;

    const first = await listLeadScores({
      workspaceId: testUser.workspaceId,
      leadId,
      limit: 2,
    });

    expect(first).toMatchObject({
      result: "ok",
      scores: [{ id: leadScoreId3 }, { id: leadScoreId2 }],
      nextCursor: new Date("2026-05-01T14:00:00.000Z"),
    });

    const secondPage = createMockTx({
      selectResponses: [[{ id: leadId }], [rows[2]]],
      insertResponses: [],
    });
    mockDb.tx = secondPage.tx;

    const second = await listLeadScores({
      workspaceId: testUser.workspaceId,
      leadId,
      limit: 2,
      cursor: new Date("2026-05-01T14:00:00.000Z"),
    });

    expect(second).toMatchObject({
      result: "ok",
      scores: [{ id: leadScoreId }],
      nextCursor: null,
    });
  });

  it("returns not_found for a missing or cross-workspace lead", async () => {
    const harness = createMockTx({
      selectResponses: [[]],
      insertResponses: [],
    });
    mockDb.tx = harness.tx;

    await expect(
      getLatestLeadScore({
        workspaceId: testUser.workspaceId,
        leadId,
      }),
    ).resolves.toEqual({ result: "not_found" });
    expect(harness.tx.insert).not.toHaveBeenCalled();
    expect(harness.tx.update).not.toHaveBeenCalled();
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
    expect(provider.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 1000,
        temperature: 0.1,
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
