import { readFileSync } from "node:fs";

import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import {
  ClientCockpitSummaryResponseSchema,
  type AuthMe,
  type ClientCockpitSummaryData,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createProductionClientCockpitSummaryRepository } from "../repositories/client-cockpit-summary.js";
import { createClientCockpitSummaryRoutes } from "../routes/client/cockpit-summary.js";
import {
  createClientCockpitSummaryService,
  type ClientCockpitSummaryService,
} from "../services/client-cockpit-summary.js";
import type { AuthService } from "../services/auth.js";
import { testUser, validSessionToken } from "./mocks/auth.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown,
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockDb.tx),
  ),
}));

const now = new Date("2026-05-14T12:00:00.000Z");
const since = new Date("2026-05-13T12:00:00.000Z");
const workspaceId = testUser.workspaceId;
const otherWorkspaceId = "00000000-0000-4000-8000-000000023901";

function validSessionHeaders(extra: Record<string, string> = {}) {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
    ...extra,
  };
}

function authServiceFor(user: AuthMe | null = testUser): AuthService {
  return {
    login: vi.fn(async () => null),
    getCurrentUser: vi.fn(async (token: string) => (token === validSessionToken ? user : null)),
    logout: vi.fn(async () => undefined),
  };
}

function summaryService(overrides: Partial<ClientCockpitSummaryService> = {}): ClientCockpitSummaryService {
  const summary: ClientCockpitSummaryData = {
    generatedAt: now.toISOString(),
    window: {
      since: since.toISOString(),
      hours: 24,
    },
    pipeline: {
      leads24h: 0,
      scoredLeads24h: 0,
      draftsGenerated24h: 0,
      pendingDrafts: 0,
    },
    gmailExport: {
      status: "unknown",
      pendingRequestCount: 0,
      activeLeaseCount: 0,
      staleLeaseCount: 0,
      exported24h: 0,
      lastExportedAt: null,
    },
    gmailIntake: {
      status: "unknown",
      lastIntakeAt: null,
      leadsReceived24h: 0,
    },
    googleSheets: {
      status: "unknown",
    },
    system: {
      queueStatus: "clear",
      pendingReadyJobs: 0,
      runningJobs: 0,
      failedJobs24h: 0,
      oldestPendingJobMinutes: null,
    },
    actions: [
      {
        label: "Open Gmail Export Ops",
        href: "/app/gmail-export",
        kind: "primary",
        reason: null,
      },
      {
        label: "Open Client Install",
        href: "/app/client-install",
        kind: "secondary",
        reason: null,
      },
      {
        label: "Draft Queue",
        href: "/app/client-drafts",
        kind: "disabled",
        reason: "Coming in a later issue.",
      },
    ],
  };

  return {
    getSummary: vi.fn(async () => summary),
    ...overrides,
  };
}

function createCockpitApp(
  service: ClientCockpitSummaryService = summaryService(),
  user: AuthMe | null = testUser,
) {
  const app = new Hono();
  app.route(
    "/api/client/cockpit-summary",
    createClientCockpitSummaryRoutes({
      authService: authServiceFor(user),
      clientCockpitSummaryService: service,
    }),
  );
  return app;
}

function assertNoForbiddenPayload(value: unknown) {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    "fromEmail",
    "toEmail",
    "email",
    "recipient",
    "contactName",
    "subject",
    "body",
    "bodyText",
    "htmlBody",
    "textBody",
    "workspaceId",
    "workspace_id",
    "apiKey",
    "keyHash",
    "plaintextApiKey",
    "Authorization",
    "Bearer",
    "leaseToken",
    "providerMessageId",
    "provider_message_id",
    "metadata_json",
    "payload_json",
    "prompt",
    "output",
    "raw",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe("client cockpit summary route", () => {
  it("returns 401 without session", async () => {
    const service = summaryService();
    const response = await createCockpitApp(service).request("/api/client/cockpit-summary");

    expect(response.status).toBe(401);
    expect(service.getSummary).not.toHaveBeenCalled();
  });

  it("allows admin and founder sessions", async () => {
    for (const role of ["admin", "founder"] as const) {
      const service = summaryService();
      const response = await createCockpitApp(service, { ...testUser, role }).request(
        "/api/client/cockpit-summary",
        { headers: validSessionHeaders() },
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(ClientCockpitSummaryResponseSchema.parse(body)).toEqual(body);
      expect(service.getSummary).toHaveBeenCalledWith(workspaceId);
      assertNoForbiddenPayload(body);
    }
  });

  it("rejects non-admin sessions", async () => {
    const service = summaryService();
    const response = await createCockpitApp(service, { ...testUser, role: "operator" }).request(
      "/api/client/cockpit-summary",
      { headers: validSessionHeaders() },
    );

    expect(response.status).toBe(403);
    expect(service.getSummary).not.toHaveBeenCalled();
  });

  it("ignores client workspace injection and uses the session workspace", async () => {
    const service = summaryService();
    const response = await createCockpitApp(service).request(
      "/api/client/cockpit-summary?workspaceId=00000000-0000-4000-8000-000000023999",
      {
        headers: validSessionHeaders({
          "x-workspace-id": "00000000-0000-4000-8000-000000023998",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(service.getSummary).toHaveBeenCalledWith(workspaceId);
  });
});

describe("client cockpit summary service", () => {
  it("returns the empty state as a valid DTO", async () => {
    const service = createClientCockpitSummaryService(
      {
        getSummaryRows: vi.fn(async () => ({
          leads: [],
          leadScores: [],
          drafts: [],
          backgroundJobs: [],
        })),
      },
      () => now,
    );

    const summary = await service.getSummary(workspaceId);

    expect(summary.pipeline).toEqual({
      leads24h: 0,
      scoredLeads24h: 0,
      draftsGenerated24h: 0,
      pendingDrafts: 0,
    });
    expect(summary.gmailExport.status).toBe("unknown");
    expect(summary.gmailIntake).toEqual({
      status: "unknown",
      lastIntakeAt: null,
      leadsReceived24h: 0,
    });
    expect(summary.system.queueStatus).toBe("clear");
    expect(ClientCockpitSummaryResponseSchema.parse({ success: true, data: summary }).data).toEqual(
      summary,
    );
    assertNoForbiddenPayload({ success: true, data: summary });
  });

  it("aggregates the workspace read model and excludes other tenants", async () => {
    const service = createClientCockpitSummaryService(
      {
        getSummaryRows: vi.fn(async () => ({
          leads: [
            { workspaceId, createdAt: new Date("2026-05-14T11:00:00.000Z") },
            { workspaceId, createdAt: new Date("2026-05-12T11:00:00.000Z") },
            { workspaceId: otherWorkspaceId, createdAt: new Date("2026-05-14T11:30:00.000Z") },
          ],
          leadScores: [
            {
              workspaceId,
              leadId: "00000000-0000-4000-8000-000000023101",
              createdAt: new Date("2026-05-14T10:00:00.000Z"),
            },
            {
              workspaceId,
              leadId: "00000000-0000-4000-8000-000000023101",
              createdAt: new Date("2026-05-14T10:05:00.000Z"),
            },
            {
              workspaceId,
              leadId: "00000000-0000-4000-8000-000000023102",
              createdAt: new Date("2026-05-12T10:00:00.000Z"),
            },
            {
              workspaceId: otherWorkspaceId,
              leadId: "00000000-0000-4000-8000-000000023103",
              createdAt: new Date("2026-05-14T10:00:00.000Z"),
            },
          ],
          drafts: [
            {
              workspaceId,
              status: "draft",
              createdAt: new Date("2026-05-14T09:00:00.000Z"),
              updatedAt: new Date("2026-05-14T09:00:00.000Z"),
              metadataJson: {
                gmailExport: {
                  requestedAt: "2026-05-14T09:00:00.000Z",
                  requestExpiresAt: "2026-05-15T09:00:00.000Z",
                  status: "requested",
                  toEmail: "hidden@example.test",
                  subject: "hidden",
                },
              },
            },
            {
              workspaceId,
              status: "approved",
              createdAt: new Date("2026-05-14T08:00:00.000Z"),
              updatedAt: new Date("2026-05-14T08:00:00.000Z"),
              metadataJson: {
                gmailExport: {
                  leaseToken: "secret-token",
                  leaseExpiresAt: "2026-05-14T12:10:00.000Z",
                  status: "leased",
                },
              },
            },
            {
              workspaceId,
              status: "draft",
              createdAt: new Date("2026-05-12T08:00:00.000Z"),
              updatedAt: new Date("2026-05-12T08:00:00.000Z"),
              metadataJson: {
                gmailExport: {
                  leaseToken: "expired-secret-token",
                  leaseExpiresAt: "2026-05-14T11:00:00.000Z",
                  status: "leased",
                },
              },
            },
            {
              workspaceId,
              status: "draft",
              createdAt: new Date("2026-05-14T07:00:00.000Z"),
              updatedAt: new Date("2026-05-14T07:00:00.000Z"),
              metadataJson: {
                gmailExport: {
                  exportedAt: "2026-05-14T07:30:00.000Z",
                  status: "exported",
                },
              },
            },
            {
              workspaceId,
              status: "archived",
              createdAt: new Date("2026-05-12T07:00:00.000Z"),
              updatedAt: new Date("2026-05-12T07:00:00.000Z"),
              metadataJson: {
                gmailExport: {
                  exportedAt: "2026-05-12T07:30:00.000Z",
                  status: "exported",
                },
              },
            },
            {
              workspaceId: otherWorkspaceId,
              status: "draft",
              createdAt: new Date("2026-05-14T07:00:00.000Z"),
              updatedAt: new Date("2026-05-14T07:00:00.000Z"),
              metadataJson: {
                gmailExport: {
                  leaseToken: "other-token",
                  leaseExpiresAt: "2026-05-14T10:00:00.000Z",
                  status: "leased",
                },
              },
            },
          ],
          backgroundJobs: [
            {
              workspaceId,
              status: "pending",
              runAfter: new Date("2026-05-14T11:20:00.000Z"),
              scheduledAt: null,
              createdAt: new Date("2026-05-14T11:00:00.000Z"),
              updatedAt: new Date("2026-05-14T11:00:00.000Z"),
            },
            {
              workspaceId,
              status: "pending",
              runAfter: new Date("2026-05-14T12:30:00.000Z"),
              scheduledAt: null,
              createdAt: new Date("2026-05-14T11:00:00.000Z"),
              updatedAt: new Date("2026-05-14T11:00:00.000Z"),
            },
            {
              workspaceId,
              status: "running",
              runAfter: new Date("2026-05-14T10:00:00.000Z"),
              scheduledAt: null,
              createdAt: new Date("2026-05-14T10:00:00.000Z"),
              updatedAt: new Date("2026-05-14T10:00:00.000Z"),
            },
            {
              workspaceId,
              status: "failed",
              runAfter: new Date("2026-05-14T09:00:00.000Z"),
              scheduledAt: null,
              createdAt: new Date("2026-05-14T09:00:00.000Z"),
              updatedAt: new Date("2026-05-14T09:10:00.000Z"),
            },
            {
              workspaceId,
              status: "failed",
              runAfter: new Date("2026-05-12T09:00:00.000Z"),
              scheduledAt: null,
              createdAt: new Date("2026-05-12T09:00:00.000Z"),
              updatedAt: new Date("2026-05-12T09:10:00.000Z"),
            },
            {
              workspaceId: otherWorkspaceId,
              status: "failed",
              runAfter: new Date("2026-05-14T09:00:00.000Z"),
              scheduledAt: null,
              createdAt: new Date("2026-05-14T09:00:00.000Z"),
              updatedAt: new Date("2026-05-14T09:10:00.000Z"),
            },
          ],
        })),
      },
      () => now,
    );

    const summary = await service.getSummary(workspaceId);

    expect(summary.pipeline).toEqual({
      leads24h: 1,
      scoredLeads24h: 1,
      draftsGenerated24h: 3,
      pendingDrafts: 3,
    });
    expect(summary.gmailIntake).toEqual({
      status: "activity_seen",
      lastIntakeAt: "2026-05-14T11:00:00.000Z",
      leadsReceived24h: 1,
    });
    expect(summary.gmailExport).toEqual({
      status: "attention_required",
      pendingRequestCount: 1,
      activeLeaseCount: 1,
      staleLeaseCount: 1,
      exported24h: 1,
      lastExportedAt: "2026-05-14T07:30:00.000Z",
    });
    expect(summary.system).toEqual({
      queueStatus: "attention_required",
      pendingReadyJobs: 1,
      runningJobs: 1,
      failedJobs24h: 1,
      oldestPendingJobMinutes: 40,
    });
    assertNoForbiddenPayload({ success: true, data: summary });
  });
});

describe("client cockpit repository safety", () => {
  it("reads only selected aggregate-safe columns and performs no write side effects", async () => {
    const tx = createMockTx([[], [], [], []]);
    mockDb.tx = tx;

    const rows = await createProductionClientCockpitSummaryRepository().getSummaryRows({
      workspaceId,
      since,
    });

    expect(rows).toEqual({
      leads: [],
      leadScores: [],
      drafts: [],
      backgroundJobs: [],
    });
    expect(tx.select).toHaveBeenCalledTimes(4);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("does not call providers, activity logs, or use client workspace input in source", () => {
    const routeSource = readFileSync(
      new URL("../routes/client/cockpit-summary.ts", import.meta.url),
      "utf8",
    );
    const serviceSource = readFileSync(
      new URL("../services/client-cockpit-summary.ts", import.meta.url),
      "utf8",
    );
    const repositorySource = readFileSync(
      new URL("../repositories/client-cockpit-summary.ts", import.meta.url),
      "utf8",
    );
    const combined = [routeSource, serviceSource, repositorySource].join("\n");

    expect(combined).not.toMatch(/fetch\(|GoogleAuth|Resend|sendEmail|provider\.|createActivityLog/);
    expect(routeSource).not.toMatch(/req\.query\(|req\.json\(|req\.header\(/);
    expect(combined).not.toMatch(/insert\(|update\(|delete\(/);
  });
});

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };

  return builder;
}

function createMockTx(selectResponses: unknown[][]) {
  const state = {
    selectResponses: [...selectResponses],
  };

  return {
    select: vi.fn(() => createSelectBuilder(state.selectResponses.shift() ?? [])),
    insert: vi.fn(() => {
      throw new Error("client cockpit summary must not insert");
    }),
    update: vi.fn(() => {
      throw new Error("client cockpit summary must not update");
    }),
    delete: vi.fn(() => {
      throw new Error("client cockpit summary must not delete");
    }),
  };
}
