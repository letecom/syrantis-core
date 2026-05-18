import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  InboundMessageIntakeResponseSchema,
  type InboundMessageIntakeRequest,
} from "@syrantis/shared";

import { createActivityLog } from "../repositories/activity-logs.js";
import { createInboundMessageIntake } from "../repositories/inbound-message-intake.js";
import { createAdminIntakeRoutes } from "../routes/admin-intake.js";
import { createInboundMessageIntakeRoutes } from "../routes/inbound-message-intake.js";
import type {
  InboundMessageIntakeRepository,
  InboundMessageIntakeService,
  InboundMessageIntakeServiceResult,
} from "../services/inbound-message-intake.js";
import { createProductionInboundMessageIntakeService } from "../services/inbound-message-intake.js";
import { createLeadContactContextService } from "../services/lead-contact-context.js";
import { FixedWindowRateLimiter } from "../services/rate-limit.js";
import type { AdminIntakeService } from "../services/admin-intake.js";
import type { AuthService } from "../services/auth.js";
import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { testUser, validSessionToken } from "./mocks/auth.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown,
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockDb.tx),
  ),
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async (_tx: unknown, input: Record<string, unknown>) => ({
    id: "00000000-0000-4000-8000-000000023299",
    ...input,
  })),
}));

const workspaceId = "00000000-0000-4000-8000-000000000001";
const validApiKey = "syr_live_valid_inbound_key";
const revokedApiKey = "syr_live_revoked_inbound_key";
const leadId = "00000000-0000-4000-8000-000000023201";
const replayLeadId = "00000000-0000-4000-8000-000000023202";
const jobId = "00000000-0000-4000-8000-000000023203";
const replayJobId = "00000000-0000-4000-8000-000000023204";
const diagnosticTraceId = "00000000-0000-4000-8000-000000023205";
const contactId = "00000000-0000-4000-8000-000000023209";
const secondLeadId = "00000000-0000-4000-8000-000000023210";
const createdAt = new Date("2026-05-09T10:00:00.000Z");

const defaultClassification = {
  classification: "leadable" as const,
  category: "quote_request",
  action: "create_lead" as const,
  confidence: "high" as const,
  reasonCode: "quote_intent",
  diagnosticTraceId,
  suggestedLabels: [],
  classificationId: "00000000-0000-4000-8000-000000023298",
};

function uuidFromNumber(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function bearer(value: string) {
  return {
    authorization: `Bearer ${value}`,
    "content-type": "application/json",
  };
}

function validPayload(
  overrides: Partial<InboundMessageIntakeRequest> = {},
): InboundMessageIntakeRequest {
  return {
    fromEmail: "lead@example.com",
    bodyText: "Need urgent boiler help.",
    source: "api",
    ...overrides,
  };
}

function expectSafeSerialized(value: unknown) {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    workspaceId,
    validApiKey,
    "Bearer",
    "lead@example.com",
    "Need urgent boiler help.",
    "Need urgent boiler quote",
    "Jean Client",
    "fromEmail",
    "bodyText",
    "htmlBody",
    "attachments",
    "prompt",
    "token",
    "apiKey",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

function expectNoUnsafeNormalizedJson(value: unknown) {
  expect(value).not.toHaveProperty("fromEmail");
  expect(value).not.toHaveProperty("email");
  expect(value).not.toHaveProperty("contactEmail");
  expect(value).not.toHaveProperty("senderEmail");
}

function createResponse(input: { id: string; jobId: string | null; isReplay: boolean }) {
  return InboundMessageIntakeResponseSchema.parse({
    success: true,
    data: {
      result: input.isReplay ? "idempotent_replay" : "created",
      intakeAction: "created_lead",
      leadId: input.id,
      scoringJobId: input.jobId,
      diagnosticTraceId,
      classification: {
        category: defaultClassification.category,
        action: defaultClassification.action,
        confidence: defaultClassification.confidence,
        reasonCode: defaultClassification.reasonCode,
      },
    },
  }).data;
}

function createFakeInboundService() {
  const leads: Array<Record<string, unknown>> = [];
  const jobs: Array<Record<string, unknown>> = [];
  const activityLogs: Array<Record<string, unknown>> = [];
  const externalIds = new Map<string, { leadId: string; jobId: string }>();
  const rateCounts = new Map<string, number>();
  let nextLeadId = 301;
  let nextJobId = 401;

  const service: InboundMessageIntakeService & {
    leads: typeof leads;
    jobs: typeof jobs;
    activityLogs: typeof activityLogs;
  } = {
    leads,
    jobs,
    activityLogs,
    receiveInboundMessage: vi.fn(async (input): Promise<InboundMessageIntakeServiceResult> => {
      const count = rateCounts.get(input.apiKey.id) ?? 0;
      if (count >= 10) {
        return { result: "rate_limited", retryAfterSeconds: 60 };
      }
      rateCounts.set(input.apiKey.id, count + 1);

      if (input.payload.externalId && externalIds.has(input.payload.externalId)) {
        const existing = externalIds.get(input.payload.externalId)!;
        return {
          result: "idempotent_replay",
          data: createResponse({
            id: existing.leadId,
            jobId: existing.jobId,
            isReplay: true,
          }),
        };
      }

      const id = uuidFromNumber(nextLeadId);
      const currentJobId = uuidFromNumber(nextJobId);
      nextLeadId += 1;
      nextJobId += 1;

      leads.push({
        id,
        contactId: uuidFromNumber(501),
        source: "public_inbound_message",
        rawContent: input.payload.bodyText,
      });
      jobs.push({
        id: currentJobId,
        type: "score_lead",
        status: "pending",
        payloadJson: {
          leadId: id,
          diagnosticTraceId,
          source: "public_inbound_message",
        },
      });
      activityLogs.push({
        action: "public_inbound_message.created",
        entityType: "lead",
        entityId: id,
        metadataJson: {
          source: "public_inbound_message",
          apiSource: input.payload.source ?? "api",
          hasExternalId: Boolean(input.payload.externalId),
          diagnosticTraceId,
          leadId: id,
          scoringJobId: currentJobId,
          hasBody: true,
          subjectLength: input.payload.subject?.length ?? 0,
          bodyLength: input.payload.bodyText.length,
        },
      });

      if (input.payload.externalId) {
        externalIds.set(input.payload.externalId, { leadId: id, jobId: currentJobId });
      }

      return {
        result: "created",
        data: createResponse({
          id,
          jobId: currentJobId,
          isReplay: false,
        }),
      };
    }),
  };

  return service;
}

function createTestApp(service = createFakeInboundService()) {
  const app = new Hono();
  app.route(
    "/api/intake",
    createInboundMessageIntakeRoutes({
      authenticateApiKey: vi.fn(async (authorizationHeader?: string | null) => {
        const match = /^Bearer\s+(.+)$/.exec(authorizationHeader ?? "");
        const key = match?.[1] ?? "";

        if (key !== validApiKey) {
          return null;
        }

        return {
          id: "00000000-0000-4000-8000-000000023207",
          workspaceId,
        };
      }),
      inboundMessageIntakeService: service,
    }),
  );
  return { app, service };
}

async function postInbound(
  app: Hono,
  body: unknown,
  headers: Record<string, string> = bearer(validApiKey),
) {
  return app.request("/api/intake/inbound-message", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(async () => response),
  };

  return builder;
}

function createUpdateBuilder() {
  const builder = {
    set: vi.fn(() => builder),
    where: vi.fn(async () => []),
  };

  return builder;
}

function createInsertBuilder(insertedValues: Record<string, unknown>[], responseQueue: unknown[]) {
  return {
    values: vi.fn((values: Record<string, unknown>) => {
      insertedValues.push(values);

      const insertStep: {
        onConflictDoNothing: ReturnType<typeof vi.fn>;
        returning: ReturnType<typeof vi.fn>;
      } = {
        onConflictDoNothing: vi.fn(() => insertStep),
        returning: vi.fn(async () => {
          const response = responseQueue.shift();
          return response ? [response] : [];
        }),
      };

      return insertStep;
    }),
  };
}

function createMockTx(input: { selectResponses: unknown[][]; insertResponses: unknown[] }) {
  const insertedValues: Record<string, unknown>[] = [];
  const selectResponses = [...input.selectResponses];
  const insertResponses = [...input.insertResponses];

  const tx = {
    update: vi.fn(() => createUpdateBuilder()),
    select: vi.fn(() => createSelectBuilder(selectResponses.shift() ?? [])),
    insert: vi.fn(() => createInsertBuilder(insertedValues, insertResponses)),
  };

  return {
    tx,
    insertedValues,
  };
}

function jobRow(id = jobId) {
  return {
    id,
    workspaceId,
    type: "score_lead",
    payloadJson: { leadId, diagnosticTraceId, source: "public_inbound_message" },
    status: "pending",
    attempts: 0,
    maxAttempts: 3,
    runAfter: createdAt,
    scheduledAt: null,
    lockedAt: null,
    lockedBy: null,
    completedAt: null,
    failedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function mailItemRow(id = "00000000-0000-4000-8000-000000023297") {
  return {
    id,
  };
}

function classificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000023298",
    classification: "leadable",
    category: "quote_request",
    action: "create_lead",
    confidence: "high",
    reasonCode: "quote_intent",
    diagnosticTraceId,
    suggestedLabels: [],
    leadId: null,
    ...overrides,
  };
}

function contactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: contactId,
    email: "lead@example.com",
    ...overrides,
  };
}

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
    "content-type": "application/json",
  };
}

function authServiceFor(): AuthService {
  return {
    login: vi.fn(async () => null),
    getCurrentUser: vi.fn(async (token: string) => (token === validSessionToken ? testUser : null)),
    logout: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.tx = undefined;
});

describe("public inbound message intake route", () => {
  it("returns 401 without Authorization", async () => {
    const { app } = createTestApp();

    const response = await postInbound(app, validPayload(), { "content-type": "application/json" });

    expect(response.status).toBe(401);
  });

  it("returns 401 for malformed Authorization", async () => {
    const { app } = createTestApp();

    const response = await postInbound(app, validPayload(), {
      authorization: validApiKey,
      "content-type": "application/json",
    });

    expect(response.status).toBe(401);
  });

  it("returns 401 for invalid Bearer key", async () => {
    const { app } = createTestApp();

    const response = await postInbound(app, validPayload(), bearer("syr_live_bad"));

    expect(response.status).toBe(401);
  });

  it("returns generic 401 for a revoked Bearer key and does not call intake", async () => {
    const service = createFakeInboundService();
    const app = new Hono();
    app.route(
      "/api/intake",
      createInboundMessageIntakeRoutes({
        authenticateApiKey: vi.fn(async (authorizationHeader?: string | null) => {
          const match = /^Bearer\s+(.+)$/.exec(authorizationHeader ?? "");
          return match?.[1] === revokedApiKey ? null : null;
        }),
        inboundMessageIntakeService: service,
      }),
    );

    const response = await postInbound(app, validPayload(), bearer(revokedApiKey));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "UNAUTHORIZED",
    });
    expect(service.receiveInboundMessage).not.toHaveBeenCalled();
  });

  it("rejects workspaceId in the body", async () => {
    const { app } = createTestApp();

    const response = await postInbound(app, { ...validPayload(), workspaceId });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("rejects htmlBody or attachments", async () => {
    const { app } = createTestApp();

    const htmlResponse = await postInbound(app, { ...validPayload(), htmlBody: "<p>no</p>" });
    const attachmentsResponse = await postInbound(app, { ...validPayload(), attachments: [] });

    expect(htmlResponse.status).toBe(422);
    expect(attachmentsResponse.status).toBe(422);
  });

  it("rejects unknown fields", async () => {
    const { app } = createTestApp();

    const response = await postInbound(app, { ...validPayload(), unknownField: true });

    expect(response.status).toBe(422);
  });

  it("rejects missing fromEmail", async () => {
    const { app } = createTestApp();

    const response = await postInbound(app, { bodyText: "Need help." });

    expect(response.status).toBe(422);
  });

  it("rejects invalid fromEmail", async () => {
    const { app } = createTestApp();

    const response = await postInbound(app, validPayload({ fromEmail: "not-email" }));

    expect(response.status).toBe(422);
  });

  it("rejects missing bodyText", async () => {
    const { app } = createTestApp();

    const response = await postInbound(app, { fromEmail: "lead@example.com" });

    expect(response.status).toBe(422);
  });

  it("rejects bodyText over 10000 characters", async () => {
    const { app } = createTestApp();

    const response = await postInbound(app, validPayload({ bodyText: "x".repeat(10001) }));

    expect(response.status).toBe(422);
  });

  it("creates a minimal valid public inbound message", async () => {
    const { app, service } = createTestApp();

    const response = await postInbound(app, validPayload());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(InboundMessageIntakeResponseSchema.parse(body)).toEqual(body);
    expect(body.data).toMatchObject({
      result: "created",
      intakeAction: "created_lead",
      leadId: expect.any(String),
      scoringJobId: expect.any(String),
    });
    expect(service.leads).toHaveLength(1);
    expect(service.leads[0]).toMatchObject({ source: "public_inbound_message" });
    expectSafeSerialized(body);
  });

  it("creates a complete valid public inbound message", async () => {
    const { app } = createTestApp();

    const response = await postInbound(
      app,
      validPayload({
        source: "make",
        externalId: "message-123",
        contactName: "Jean Client",
        subject: "Need urgent boiler quote",
        receivedAt: "2026-05-09T09:00:00.000Z",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({
      result: "created",
      intakeAction: "created_lead",
      leadId: expect.any(String),
      scoringJobId: expect.any(String),
      classification: {
        category: "quote_request",
        action: "create_lead",
      },
    });
    expectSafeSerialized(body);
  });

  it("creates a pending score_lead job with no PII in payload", async () => {
    const { app, service } = createTestApp();

    await postInbound(
      app,
      validPayload({ subject: "Need urgent boiler quote", contactName: "Jean Client" }),
    );

    expect(service.jobs).toHaveLength(1);
    expect(service.jobs[0]).toMatchObject({
      type: "score_lead",
      status: "pending",
    });
    expectSafeSerialized(service.jobs[0]?.payloadJson);
  });

  it("writes safe activity metadata with no PII", async () => {
    const { app, service } = createTestApp();

    await postInbound(
      app,
      validPayload({ subject: "Need urgent boiler quote", contactName: "Jean Client" }),
    );

    expect(service.activityLogs).toHaveLength(1);
    expect(service.activityLogs[0]).toMatchObject({
      action: "public_inbound_message.created",
      entityType: "lead",
    });
    expectSafeSerialized(service.activityLogs[0]?.metadataJson);
  });

  it("returns 200 for duplicate externalId and does not create a second lead or job", async () => {
    const { app, service } = createTestApp();
    const payload = validPayload({ externalId: "external-message-1" });

    const firstResponse = await postInbound(app, payload);
    const replayResponse = await postInbound(app, payload);
    const replayBody = await replayResponse.json();

    expect(firstResponse.status).toBe(201);
    expect(replayResponse.status).toBe(200);
    expect(replayBody.data).toMatchObject({
      result: "idempotent_replay",
      intakeAction: "created_lead",
    });
    expect(service.leads).toHaveLength(1);
    expect(service.jobs).toHaveLength(1);
  });

  it("creates two leads when externalId is absent", async () => {
    const { app, service } = createTestApp();

    const firstResponse = await postInbound(app, validPayload());
    const secondResponse = await postInbound(app, validPayload());

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(service.leads).toHaveLength(2);
  });

  it("returns 429 after 10 requests per minute", async () => {
    const { app } = createTestApp();

    for (let index = 0; index < 10; index += 1) {
      const response = await postInbound(app, validPayload({ externalId: `rate-${index}` }));
      expect(response.status).toBe(201);
    }

    const limitedResponse = await postInbound(app, validPayload({ externalId: "rate-10" }));

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers.get("Retry-After")).toBe("60");
  });

  it("keeps the 023I admin intake route functional", async () => {
    const adminIntakeService: AdminIntakeService = {
      createTestEmail: vi.fn(async () => ({
        diagnosticTraceId,
        testLabel: null,
        lead: {
          id: leadId,
          source: "inbound_email_test" as const,
          hasBody: true,
          subjectPresent: false,
          contactNamePresent: false,
          createdAt: createdAt.toISOString(),
        },
        scoringJob: {
          id: jobId,
          status: "pending" as const,
          jobType: "score_lead" as const,
          enqueuedAt: createdAt.toISOString(),
        },
        workerBaseline: {
          failedJobsBefore: 5,
        },
        createdAt: createdAt.toISOString(),
        processingNote:
          "Synthetic inbound email test lead created and score_lead job enqueued. Run the worker once to process scoring.",
      })),
    };
    const app = new Hono();
    app.route(
      "/api/admin/intake",
      createAdminIntakeRoutes({
        authService: authServiceFor(),
        adminIntakeService,
      }),
    );

    const response = await app.request("/api/admin/intake/test-email", {
      method: "POST",
      headers: validSessionHeaders(),
      body: JSON.stringify({ fromEmail: "lead@example.com", bodyText: "Need help." }),
    });

    expect(response.status).toBe(201);
  });
});

describe("public inbound message repository", () => {
  it("creates a normalized contact, linked lead, pending score_lead job, and safe activity log", async () => {
    const harness = createMockTx({
      selectResponses: [[], []],
      insertResponses: [
        classificationRow(),
        contactRow({ email: "lead@example.com" }),
        { id: leadId, contactId, createdAt },
        jobRow(),
        mailItemRow(),
      ],
    });
    mockDb.tx = harness.tx;

    const result = await createInboundMessageIntake({
      workspaceId,
      apiKeyId: "00000000-0000-4000-8000-000000023206",
      diagnosticTraceId,
      data: validPayload({
        source: "zapier",
        externalId: "external-1",
        subject: "Need urgent boiler quote",
        contactName: "Jean Client",
        fromEmail: " Lead@Example.COM ",
      }),
    });

    expect(result.result).toBe("created");
    if (!result.lead) {
      throw new Error("Expected created intake to return a lead.");
    }
    expect(result.lead.id).toBe(leadId);
    expect(result.lead.contactId).toBe(contactId);
    expect(result.job).toMatchObject({
      id: jobId,
      type: "score_lead",
      status: "pending",
      payloadJson: {
        leadId,
        diagnosticTraceId,
        source: "public_inbound_message",
      },
    });
    expect(harness.insertedValues[0]).toMatchObject({
      workspaceId,
      externalId: "external-1",
      classification: "leadable",
      category: "urgent_service_request",
    });
    expect(harness.insertedValues[1]).toMatchObject({
      workspaceId,
      email: "lead@example.com",
      metadataJson: {
        origin: "public_inbound_message",
      },
    });
    expect(harness.insertedValues[2]).toMatchObject({
      workspaceId,
      contactId,
      source: "email",
      status: "new",
      normalizedJson: expect.objectContaining({
        source: "public_inbound_message",
        origin: "public_inbound_message",
        apiSource: "zapier",
        externalId: "external-1",
        diagnosticTraceId,
        intakeClassification: expect.objectContaining({
          category: "urgent_service_request",
          action: "create_lead",
        }),
        hasBody: true,
        subjectPresent: true,
        contactNamePresent: true,
        subjectLength: 24,
        bodyLength: 24,
      }),
    });
    expectNoUnsafeNormalizedJson(harness.insertedValues[2]?.normalizedJson);
    expect(String(harness.insertedValues[2]?.rawContent)).toContain(
      "Public inbound message captured for the Client Inbox Domain.",
    );
    expect(String(harness.insertedValues[2]?.rawContent)).not.toContain("lead@example.com");
    expect(String(harness.insertedValues[2]?.rawContent)).not.toContain(
      "Need urgent boiler help.",
    );
    expect(harness.insertedValues[3]).toMatchObject({
      workspaceId,
      type: "score_lead",
      status: "pending",
      payloadJson: {
        leadId,
        diagnosticTraceId,
        source: "public_inbound_message",
      },
    });
    expectSafeSerialized(harness.insertedValues[3]?.payloadJson);
    expect(harness.insertedValues[4]).toMatchObject({
      workspaceId,
      classificationId: "00000000-0000-4000-8000-000000023298",
      leadId,
      contactId,
      externalId: "external-1",
      source: "zapier",
      direction: "inbound",
      fromDisplay: "Jean Client",
      fromEmail: " Lead@Example.COM ",
      subject: "Need urgent boiler quote",
      bodyText: "Need urgent boiler help.",
      hasAttachments: false,
      attachmentsJson: [],
    });
    expect(createActivityLog).toHaveBeenCalledWith(
      harness.tx,
      expect.objectContaining({
        workspaceId,
        actorUserId: null,
        action: "public_inbound_message.created",
        entityType: "lead",
        entityId: leadId,
      }),
    );

    const metadata = vi.mocked(createActivityLog).mock.calls[0]?.[1].metadataJson ?? {};
    expect(metadata).toMatchObject({
      source: "public_inbound_message",
      apiSource: "zapier",
      hasExternalId: true,
      diagnosticTraceId,
      leadId,
      scoringJobId: jobId,
      category: "urgent_service_request",
      action: "create_lead",
      reasonCode: "urgent_service_intent",
      confidence: "high",
      hasBody: true,
      subjectLength: 24,
      bodyLength: 24,
    });
    expectSafeSerialized(metadata);
    expect(harness.tx.update).toHaveBeenCalled();
  });

  it("reuses an existing same-workspace contact by normalized fromEmail", async () => {
    const harness = createMockTx({
      selectResponses: [[], [contactRow({ email: "Lead@Example.com" })]],
      insertResponses: [
        classificationRow(),
        { id: secondLeadId, contactId, createdAt },
        jobRow(),
        mailItemRow(),
      ],
    });
    mockDb.tx = harness.tx;

    const result = await createInboundMessageIntake({
      workspaceId,
      apiKeyId: "00000000-0000-4000-8000-000000023206",
      diagnosticTraceId,
      data: validPayload({
        fromEmail: " lead@example.com ",
        subject: "Need urgent boiler quote",
        contactName: "Jean Client",
      }),
    });

    expect(result).toMatchObject({
      result: "created",
      lead: {
        id: secondLeadId,
        contactId,
      },
    });
    expect(harness.insertedValues).toHaveLength(4);
    expect(harness.insertedValues[0]).toMatchObject({
      workspaceId,
      classification: "leadable",
    });
    expect(harness.insertedValues[1]).toMatchObject({
      workspaceId,
      contactId,
      source: "email",
      normalizedJson: expect.objectContaining({
        source: "public_inbound_message",
        contactNamePresent: true,
        subjectPresent: true,
      }),
    });
    expectNoUnsafeNormalizedJson(harness.insertedValues[1]?.normalizedJson);
    expect(harness.insertedValues[2]).toMatchObject({
      type: "score_lead",
    });
    expect(harness.insertedValues[3]).toMatchObject({
      workspaceId,
      leadId: secondLeadId,
      contactId,
      fromEmail: " lead@example.com ",
      bodyText: "Need urgent boiler help.",
    });
  });

  it("returns an idempotent replay without inserting a new lead or job", async () => {
    const harness = createMockTx({
      selectResponses: [
        [classificationRow({ leadId: replayLeadId })],
        [{ id: replayLeadId, contactId, createdAt }],
        [jobRow(replayJobId)],
      ],
      insertResponses: [mailItemRow()],
    });
    mockDb.tx = harness.tx;

    const result = await createInboundMessageIntake({
      workspaceId,
      apiKeyId: "00000000-0000-4000-8000-000000023206",
      diagnosticTraceId,
      data: validPayload({ externalId: "external-1" }),
    });

    expect(result).toMatchObject({
      result: "idempotent_replay",
      lead: {
        id: replayLeadId,
        contactId,
      },
      job: {
        id: replayJobId,
        type: "score_lead",
      },
      classification: {
        category: "quote_request",
      },
    });
    expect(harness.insertedValues).toHaveLength(1);
    expect(harness.insertedValues[0]).toMatchObject({
      workspaceId,
      classificationId: "00000000-0000-4000-8000-000000023298",
      leadId: replayLeadId,
      contactId,
      bodyText: "Need urgent boiler help.",
    });
    expect(createActivityLog).not.toHaveBeenCalled();
  });

  it("ignores newsletter intake without creating a lead or score job", async () => {
    const ignoredClassification = classificationRow({
      classification: "ignored",
      category: "newsletter",
      action: "ignore",
      confidence: "high",
      reasonCode: "bulk_or_unsubscribe_signal",
      suggestedLabels: ["Syrantis/Ignored"],
    });
    const harness = createMockTx({
      selectResponses: [[]],
      insertResponses: [ignoredClassification, mailItemRow()],
    });
    mockDb.tx = harness.tx;

    const result = await createInboundMessageIntake({
      workspaceId,
      apiKeyId: "00000000-0000-4000-8000-000000023206",
      diagnosticTraceId,
      data: validPayload({
        fromEmail: "newsletter@example.com",
        subject: "Newsletter",
        bodyText: "Promo du mois. Se desabonner.",
        externalId: "ignored-1",
      }),
    });

    expect(result).toMatchObject({
      result: "ignored",
      lead: null,
      job: null,
      classification: {
        category: "newsletter",
        action: "ignore",
      },
    });
    expect(harness.insertedValues).toHaveLength(2);
    expect(harness.insertedValues[1]).toMatchObject({
      workspaceId,
      classificationId: "00000000-0000-4000-8000-000000023298",
      leadId: null,
      contactId: null,
      fromEmail: "newsletter@example.com",
      subject: "Newsletter",
      bodyText: "Promo du mois. Se desabonner.",
    });
    expect(createActivityLog).toHaveBeenCalledWith(
      harness.tx,
      expect.objectContaining({
        action: "public_inbound_message.ignored",
        entityType: "lead",
        entityId: null,
      }),
    );
    expectSafeSerialized(vi.mocked(createActivityLog).mock.calls[0]?.[1].metadataJson);
  });

  it("returns idempotent_ignored for a duplicate ignored classification", async () => {
    const harness = createMockTx({
      selectResponses: [
        [
          classificationRow({
            classification: "ignored",
            category: "newsletter",
            action: "ignore",
            confidence: "high",
            reasonCode: "bulk_or_unsubscribe_signal",
            suggestedLabels: ["Syrantis/Ignored"],
            leadId: null,
          }),
        ],
      ],
      insertResponses: [mailItemRow()],
    });
    mockDb.tx = harness.tx;

    const result = await createInboundMessageIntake({
      workspaceId,
      apiKeyId: "00000000-0000-4000-8000-000000023206",
      diagnosticTraceId,
      data: validPayload({ externalId: "ignored-1" }),
    });

    expect(result).toMatchObject({
      result: "idempotent_ignored",
      lead: null,
      job: null,
    });
    expect(harness.insertedValues).toHaveLength(1);
    expect(harness.insertedValues[0]).toMatchObject({
      workspaceId,
      leadId: null,
      contactId: null,
      bodyText: "Need urgent boiler help.",
    });
    expect(createActivityLog).not.toHaveBeenCalled();
  });

  it("handles a concurrent duplicate created classification without duplicate lead or job inserts", async () => {
    const harness = createMockTx({
      selectResponses: [[], [classificationRow({ leadId: replayLeadId })], [jobRow(replayJobId)]],
      insertResponses: [undefined, mailItemRow()],
    });
    mockDb.tx = harness.tx;

    const result = await createInboundMessageIntake({
      workspaceId,
      apiKeyId: "00000000-0000-4000-8000-000000023206",
      diagnosticTraceId,
      data: validPayload({ externalId: "external-1" }),
    });

    expect(result).toMatchObject({
      result: "idempotent_replay",
      lead: { id: replayLeadId },
      job: { id: replayJobId },
    });
    expect(harness.insertedValues).toHaveLength(2);
    expect(harness.insertedValues[1]).toMatchObject({
      workspaceId,
      leadId: replayLeadId,
      bodyText: "Need urgent boiler help.",
    });
  });

  it("propagates job enqueue failure before writing activity metadata", async () => {
    const harness = createMockTx({
      selectResponses: [[], []],
      insertResponses: [classificationRow(), contactRow(), { id: leadId, contactId, createdAt }],
    });
    mockDb.tx = harness.tx;

    await expect(
      createInboundMessageIntake({
        workspaceId,
        apiKeyId: "00000000-0000-4000-8000-000000023206",
        diagnosticTraceId,
        data: validPayload(),
      }),
    ).rejects.toThrow("Failed to enqueue score_lead job.");

    expect(createActivityLog).not.toHaveBeenCalled();
  });
});

describe("public inbound message intake service rate limit", () => {
  it("uses API key id counters before falling back to workspace id", async () => {
    const repository = {
      create: vi.fn(async () => ({
        result: "created" as const,
        lead: { id: leadId, contactId, createdAt },
        job: jobRow(),
        classification: defaultClassification,
      })),
    };
    const service = createProductionInboundMessageIntakeService(
      repository,
      new FixedWindowRateLimiter(),
    );

    for (let index = 0; index < 10; index += 1) {
      await expect(
        service.receiveInboundMessage({
          apiKey: { id: "00000000-0000-4000-8000-000000023207", workspaceId },
          payload: validPayload({ externalId: `service-rate-${index}` }),
        }),
      ).resolves.toMatchObject({ result: "created" });
    }

    await expect(
      service.receiveInboundMessage({
        apiKey: { id: "00000000-0000-4000-8000-000000023207", workspaceId },
        payload: validPayload({ externalId: "service-rate-10" }),
      }),
    ).resolves.toMatchObject({ result: "rate_limited", retryAfterSeconds: 60 });

    await expect(
      service.receiveInboundMessage({
        apiKey: { id: "00000000-0000-4000-8000-000000023208", workspaceId },
        payload: validPayload({ externalId: "service-rate-independent" }),
      }),
    ).resolves.toMatchObject({ result: "created" });
  });
});

describe("public inbound contact linking regression", () => {
  it("lets 023Q contact context find a prior public inbound lead through contact_id", async () => {
    const contactsByEmail = new Map<string, { id: string; email: string }>();
    const createdLeads: Array<{ id: string; contactId: string; createdAt: Date }> = [];
    const repository: InboundMessageIntakeRepository = {
      create: vi.fn(async (input) => {
        const email = input.data.fromEmail.trim().toLowerCase();
        let contact = contactsByEmail.get(email);

        if (!contact) {
          contact = { id: contactId, email };
          contactsByEmail.set(email, contact);
        }

        const lead = {
          id: uuidFromNumber(23220 + createdLeads.length),
          contactId: contact.id,
          createdAt: new Date(`2026-05-09T10:0${createdLeads.length}:00.000Z`),
        };
        createdLeads.push(lead);

        return {
          result: "created" as const,
          lead,
          job: jobRow(uuidFromNumber(23320 + createdLeads.length)),
          classification: defaultClassification,
        };
      }),
    };
    const intakeService = createProductionInboundMessageIntakeService(
      repository,
      new FixedWindowRateLimiter(),
    );

    await intakeService.receiveInboundMessage({
      apiKey: { id: "00000000-0000-4000-8000-000000023207", workspaceId },
      payload: validPayload({ fromEmail: " Lead@Example.COM ", externalId: "real-shape-a" }),
    });
    const second = await intakeService.receiveInboundMessage({
      apiKey: { id: "00000000-0000-4000-8000-000000023207", workspaceId },
      payload: validPayload({ fromEmail: "lead@example.com", externalId: "real-shape-b" }),
    });

    expect(second.result).toBe("created");
    expect(createdLeads).toHaveLength(2);
    expect(new Set(createdLeads.map((lead) => lead.contactId))).toEqual(new Set([contactId]));

    const currentLead = createdLeads[1]!;
    const contextService = createLeadContactContextService({
      now: () => new Date("2026-05-09T11:00:00.000Z"),
      repository: {
        findSource: vi.fn(async () => ({
          id: currentLead.id,
          safeContactId: currentLead.contactId,
          contactEmail: "lead@example.com",
          normalizedJsonFromEmail: null,
          normalizedJsonEmail: null,
        })),
        findAggregate: vi.fn(async () => ({
          previousLeadCount: 1,
          previousDraftCount: 0,
          previousOutboundCount: 0,
          lastPriorLeadAt: createdLeads[0]!.createdAt,
          lastOutboundAt: null,
          lastOutboundDeliveryStatus: null,
          hasPriorBounce: false,
          hasPriorComplaint: false,
        })),
      },
    });

    const context = await contextService.getContactContext(workspaceId, currentLead.id);

    expect(context).toMatchObject({
      result: "ok",
      context: {
        contactKeyPresent: true,
        matchedBy: "contact_id",
        previousLeadCount: 1,
        hasPriorContext: true,
        warnings: ["repeated_inbound_recent"],
      },
    });
    expectSafeSerialized(context);
  });
});
