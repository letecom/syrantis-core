import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AdminIntakeTestEmailResponseSchema,
  type AdminIntakeTestEmailRequest,
  type AuthMe,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import { createAdminIntakeTestEmail } from "../repositories/admin-intake.js";
import { createAdminIntakeRoutes } from "../routes/admin-intake.js";
import {
  createProductionAdminIntakeService,
  type AdminIntakeService,
} from "../services/admin-intake.js";
import type { AuthService } from "../services/auth.js";
import { testUser, validSessionToken } from "./mocks/auth.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown,
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) => fn(mockDb.tx)),
}));

vi.mock("../repositories/activity-logs.js", () => ({
  createActivityLog: vi.fn(async (_tx: unknown, input: Record<string, unknown>) => ({
    id: "00000000-0000-4000-8000-000000023199",
    ...input,
  })),
}));

const leadId = "00000000-0000-4000-8000-000000023101";
const jobId = "00000000-0000-4000-8000-000000023102";
const diagnosticTraceId = "00000000-0000-4000-8000-000000023103";
const createdAt = new Date("2026-05-08T10:00:00.000Z");

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
    "content-type": "application/json",
  };
}

function authServiceFor(user: AuthMe | null = testUser): AuthService {
  return {
    login: vi.fn(async () => null),
    getCurrentUser: vi.fn(async (token: string) => (token === validSessionToken ? user : null)),
    logout: vi.fn(async () => undefined),
  };
}

function responseData() {
  return {
    diagnosticTraceId,
    testLabel: "smoke-023I",
    lead: {
      id: leadId,
      source: "inbound_email_test" as const,
      hasBody: true,
      subjectPresent: true,
      contactNamePresent: true,
      createdAt: createdAt.toISOString(),
    },
    scoringJob: {
      id: jobId,
      status: "pending" as const,
      jobType: "score_lead" as const,
      enqueuedAt: createdAt.toISOString(),
    },
    workerBaseline: {
      failedJobsBefore: 2,
    },
    createdAt: createdAt.toISOString(),
    processingNote:
      "Synthetic inbound email test lead created and score_lead job enqueued. Run the worker once to process scoring.",
  };
}

function createService() {
  const calls: Array<{
    workspaceId: string;
    actorUserId: string;
    data: AdminIntakeTestEmailRequest;
  }> = [];

  const service: AdminIntakeService & { calls: typeof calls } = {
    calls,
    createTestEmail: vi.fn(async (input) => {
      calls.push(input);
      return responseData();
    }),
  };

  return service;
}

function createTestApp(user: AuthMe | null = testUser, service = createService()) {
  const app = new Hono();
  app.route(
    "/api/admin/intake",
    createAdminIntakeRoutes({
      authService: authServiceFor(user),
      adminIntakeService: service,
    }),
  );
  return { app, service };
}

async function postTestEmail(app: Hono, body: unknown, headers = validSessionHeaders()) {
  return app.request("/api/admin/intake/test-email", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(async () => response),
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
  selectResponses: unknown[][];
  insertResponses: unknown[];
}) {
  const insertedValues: Record<string, unknown>[] = [];
  const selectResponses = [...input.selectResponses];
  const insertResponses = [...input.insertResponses];

  const tx = {
    select: vi.fn(() => createSelectBuilder(selectResponses.shift() ?? [])),
    insert: vi.fn(() => createInsertBuilder(insertedValues, insertResponses)),
  };

  return {
    tx,
    insertedValues,
  };
}

function jobRow() {
  return {
    id: jobId,
    workspaceId: testUser.workspaceId,
    type: "score_lead",
    payloadJson: { leadId },
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

function expectSafeSerialized(value: unknown) {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    testUser.workspaceId,
    "lead@example.com",
    "john@example.com",
    "Need urgent boiler quote",
    "My boiler is leaking",
    "Jean Client",
    "bodyText",
    "fromEmail",
    "prompt",
    "provider_message_id",
    "payload_json",
    "rawPayload",
    "rawProvider",
    "rawGoogle",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.tx = undefined;
});

describe("admin intake test-email route", () => {
  it("returns 401 without a session cookie", async () => {
    const { app } = createTestApp();

    const response = await app.request("/api/admin/intake/test-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromEmail: "lead@example.com" }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 403 for non-admin and non-founder users", async () => {
    const { app } = createTestApp({ ...testUser, role: "operator" });

    const response = await postTestEmail(app, { fromEmail: "lead@example.com" });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: "Forbidden.",
      code: "ADMIN_REQUIRED",
    });
  });

  it("rejects invalid fromEmail", async () => {
    const { app } = createTestApp();

    const response = await postTestEmail(app, { fromEmail: "not-email" });

    expect(response.status).toBe(422);
  });

  it("rejects missing fromEmail", async () => {
    const { app } = createTestApp();

    const response = await postTestEmail(app, {});

    expect(response.status).toBe(422);
  });

  it("rejects subject over 500 characters", async () => {
    const { app } = createTestApp();

    const response = await postTestEmail(app, {
      fromEmail: "lead@example.com",
      subject: "x".repeat(501),
    });

    expect(response.status).toBe(422);
  });

  it("rejects bodyText over 10000 characters", async () => {
    const { app } = createTestApp();

    const response = await postTestEmail(app, {
      fromEmail: "lead@example.com",
      bodyText: "x".repeat(10001),
    });

    expect(response.status).toBe(422);
  });

  it("rejects client-provided workspace identifiers", async () => {
    const { app } = createTestApp();

    const response = await postTestEmail(app, {
      fromEmail: "lead@example.com",
      workspaceId: testUser.workspaceId,
    });

    expect(response.status).toBe(400);
  });

  it("valid minimal payload returns 201 and delegates trusted workspace context", async () => {
    const { app, service } = createTestApp();

    const response = await postTestEmail(app, { fromEmail: "lead@example.com" });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(AdminIntakeTestEmailResponseSchema.parse(body)).toEqual(body);
    expect(service.calls[0]).toMatchObject({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      data: { fromEmail: "lead@example.com" },
    });
  });

  it("valid full payload returns 201 with diagnostic trace and safe DTO", async () => {
    const { app } = createTestApp();

    const response = await postTestEmail(app, {
      fromEmail: "john@example.com",
      subject: "Need urgent boiler quote",
      bodyText: "My boiler is leaking",
      contactName: "Jean Client",
      testLabel: "smoke-023I",
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.diagnosticTraceId).toBe(diagnosticTraceId);
    expect(body.data.lead).toMatchObject({
      id: leadId,
      source: "inbound_email_test",
      hasBody: true,
      subjectPresent: true,
      contactNamePresent: true,
    });
    expect(body.data.scoringJob).toMatchObject({
      id: jobId,
      status: "pending",
      jobType: "score_lead",
    });
    expect(body.data.workerBaseline.failedJobsBefore).toBe(2);
    expectSafeSerialized(body);
  });
});

describe("admin intake repository", () => {
  it("creates a lead in the current workspace, a pending score_lead job, and one safe activity log", async () => {
    const harness = createMockTx({
      selectResponses: [[{ value: 3 }]],
      insertResponses: [
        {
          id: leadId,
          createdAt,
        },
        jobRow(),
      ],
    });
    mockDb.tx = harness.tx;

    const result = await createAdminIntakeTestEmail({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      diagnosticTraceId,
      data: {
        fromEmail: "john@example.com",
        subject: "Need urgent boiler quote",
        bodyText: "My boiler is leaking",
        contactName: "Jean Client",
        testLabel: "smoke-023I",
      },
    });

    expect(result.failedJobsBefore).toBe(3);
    expect(result.lead.id).toBe(leadId);
    expect(result.job).toMatchObject({
      id: jobId,
      type: "score_lead",
      status: "pending",
      payloadJson: { leadId },
    });
    expect(harness.insertedValues[0]).toMatchObject({
      workspaceId: testUser.workspaceId,
      source: "email",
      status: "new",
      normalizedJson: expect.objectContaining({
        source: "inbound_email_test",
        origin: "inbound_email_test",
        testLabel: "smoke-023I",
        diagnosticTraceId,
        hasBody: true,
        subjectPresent: true,
        contactNamePresent: true,
        subjectLength: 24,
        bodyLength: 20,
      }),
    });
    expect(String(harness.insertedValues[0]?.rawContent)).toContain("My boiler is leaking");
    expect(harness.insertedValues[1]).toMatchObject({
      workspaceId: testUser.workspaceId,
      type: "score_lead",
      payloadJson: { leadId },
      status: "pending",
    });
    expect(harness.insertedValues[1]).not.toHaveProperty("fromEmail");
    expect(harness.insertedValues[1]).not.toHaveProperty("bodyText");
    expect(createActivityLog).toHaveBeenCalledTimes(1);
    expect(createActivityLog).toHaveBeenCalledWith(
      harness.tx,
      expect.objectContaining({
        workspaceId: testUser.workspaceId,
        actorUserId: testUser.id,
        action: "inbound_test.created",
        entityType: "lead",
        entityId: leadId,
        metadataJson: {
          source: "inbound_email_test",
          testLabel: "smoke-023I",
          diagnosticTraceId,
          hasBody: true,
          subjectLength: 24,
          bodyLength: 20,
        },
      }),
    );

    const metadata = vi.mocked(createActivityLog).mock.calls[0]?.[1].metadataJson ?? {};
    expect(metadata).not.toHaveProperty("fromEmail");
    expect(metadata).not.toHaveProperty("subject");
    expect(metadata).not.toHaveProperty("bodyText");
    expect(metadata).not.toHaveProperty("contactName");
    expect(metadata).not.toHaveProperty("workspaceId");
    expect(metadata).not.toHaveProperty("prompt");
    expectSafeSerialized({ metadata, jobPayload: harness.insertedValues[1]?.payloadJson });
  });
});

describe("admin intake service", () => {
  it("maps repository output to a safe response with worker baseline", async () => {
    const repository = {
      createTestEmail: vi.fn(async () => ({
        failedJobsBefore: 4,
        lead: {
          id: leadId,
          createdAt,
        },
        job: jobRow(),
      })),
    };
    const service = createProductionAdminIntakeService(repository);

    const result = await service.createTestEmail({
      workspaceId: testUser.workspaceId,
      actorUserId: testUser.id,
      data: {
        fromEmail: "john@example.com",
        subject: "Need urgent boiler quote",
        bodyText: "My boiler is leaking",
        contactName: "Jean Client",
      },
    });

    expect(result.diagnosticTraceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.workerBaseline.failedJobsBefore).toBe(4);
    expect(result.lead.source).toBe("inbound_email_test");
    expect(result.scoringJob).toMatchObject({
      id: jobId,
      status: "pending",
      jobType: "score_lead",
    });
    expectSafeSerialized(result);
  });
});
