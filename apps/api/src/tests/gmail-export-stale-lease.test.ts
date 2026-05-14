import { readFileSync } from "node:fs";

import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import {
  ClientCockpitSummaryResponseSchema,
  GmailExportStaleLeaseExpireResponseSchema,
  type AuthMe,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createClientCockpitSummaryService } from "../services/client-cockpit-summary.js";
import {
  GMAIL_EXPORT_STALE_LEASE_CONFIRM,
  createGmailExportStaleLeaseService,
  type GmailExportStaleLeaseService,
} from "../services/gmail-export-stale-lease.js";
import type { AuthService } from "../services/auth.js";
import { createGmailExportStaleLeaseRoutes } from "../routes/admin/gmail-export-stale-leases.js";
import { testUser, validSessionToken } from "./mocks/auth.js";

const workspaceId = testUser.workspaceId;
const otherWorkspaceId = "00000000-0000-4000-8000-000000025002";
const actorUserId = testUser.id;
const traceId = "00000000-0000-4000-8000-000000024099";
const now = new Date("2026-05-14T12:00:00.000Z");
const staleLeaseAt = "2026-05-14T11:00:00.000Z";
const activeLeaseAt = "2026-05-14T12:30:00.000Z";
const requestExpiresAt = "2026-05-15T10:00:00.000Z";
const validApiKey = "syr_live_stale_lease_key";

type StoredDraft = {
  id: string;
  workspaceId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  contactName?: string;
  metadataJson: Record<string, unknown>;
};

type ActivityLog = {
  action: string;
  entityType: string;
  entityId: string;
  metadataJson: Record<string, unknown>;
};

function validSessionHeaders(extra: Record<string, string> = {}) {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
    "content-type": "application/json",
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

function draftId(suffix: string) {
  return `00000000-0000-4000-8000-0000000240${suffix}`;
}

function baseDraft(overrides: Partial<StoredDraft> = {}): StoredDraft {
  return {
    id: draftId("01"),
    workspaceId,
    status: "draft",
    createdAt: new Date("2026-05-14T09:00:00.000Z"),
    updatedAt: new Date("2026-05-14T09:00:00.000Z"),
    subject: "Private export subject",
    textBody: "Private export body",
    htmlBody: "<p>Private export body</p>",
    contactName: "Private Contact",
    metadataJson: {
      origin: "ai_draft_generation",
      prompt: "hidden prompt",
      output: "hidden output",
      gmailExport: {
        status: "leased",
        requestedAt: "2026-05-14T10:00:00.000Z",
        requestExpiresAt,
        requestSource: "admin_api",
        leaseToken: "secret-lease-token",
        leaseExpiresAt: staleLeaseAt,
        source: "apps_script",
      },
    },
    ...overrides,
  };
}

function createFakeRepository(drafts: StoredDraft[]) {
  const activityLogs: ActivityLog[] = [];
  const backgroundJobs: unknown[] = [];
  const emailSends: unknown[] = [];
  const approvals: unknown[] = [];

  const repository = {
    listCandidateDrafts: vi.fn(async (requestedWorkspaceId: string) =>
      drafts
        .filter((draft) => draft.workspaceId === requestedWorkspaceId)
        .map((draft) => ({
          draftId: draft.id,
          metadataJson: draft.metadataJson,
        })),
    ),
    expireDraftLease: vi.fn(
      async (input: {
        workspaceId: string;
        actorUserId: string;
        draftId: string;
        nextMetadataJson: Record<string, unknown>;
        diagnosticTraceId: string;
        previousLeaseExpiresAt: string;
      }) => {
        const draft = drafts.find(
          (candidate) =>
            candidate.workspaceId === input.workspaceId && candidate.id === input.draftId,
        );

        if (!draft) {
          return false;
        }

        draft.metadataJson = input.nextMetadataJson;
        activityLogs.push({
          action: "draft.gmail_export_stale_lease_expired",
          entityType: "draft",
          entityId: input.draftId,
          metadataJson: {
            diagnosticTraceId: input.diagnosticTraceId,
            draftId: input.draftId,
            previousLeaseExpiresAt: input.previousLeaseExpiresAt,
            source: "admin_stale_lease_hygiene",
          },
        });

        return true;
      },
    ),
  };

  return { repository, activityLogs, backgroundJobs, emailSends, approvals };
}

function createService(store = createFakeRepository([baseDraft()])) {
  return {
    ...store,
    service: createGmailExportStaleLeaseService(
      store.repository,
      () => now,
      () => traceId,
    ),
  };
}

function createTestApp(
  input: {
    service?: GmailExportStaleLeaseService;
    user?: AuthMe | null;
  } = {},
) {
  const app = new Hono();

  app.route(
    "/api/admin/gmail-export",
    createGmailExportStaleLeaseRoutes({
      authService: authServiceFor(input.user ?? testUser),
      gmailExportStaleLeaseService: input.service ?? createService().service,
    }),
  );

  return app;
}

function gmailExport(draft: StoredDraft): Record<string, unknown> {
  const value = draft.metadataJson.gmailExport;
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function postExpire(
  app: Hono,
  body: Record<string, unknown> | undefined,
  headers: Record<string, string> = validSessionHeaders(),
) {
  const requestInit: RequestInit = {
    method: "POST",
    headers,
  };

  if (body !== undefined) {
    requestInit.body = JSON.stringify(body);
  }

  return app.request("/api/admin/gmail-export/stale-leases/expire", requestInit);
}

function expectNoForbiddenPayload(value: unknown) {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    workspaceId,
    otherWorkspaceId,
    "workspaceId",
    "workspace_id",
    "metadataJson",
    "metadata_json",
    "payloadJson",
    "payload_json",
    "secret-lease-token",
    "leaseToken",
    "client@example.test",
    "email",
    "Private export subject",
    "Private export body",
    "subject",
    "body",
    "textBody",
    "htmlBody",
    "Private Contact",
    "contactName",
    validApiKey,
    "apiKey",
    "providerMessageId",
    "provider_message_id",
    "prompt",
    "output",
    "hidden prompt",
    "hidden output",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe("POST /api/admin/gmail-export/stale-leases/expire auth", () => {
  it("requires a session, allows admin and founder, rejects API key-only auth, and stays tenant scoped", async () => {
    const store = createService(
      createFakeRepository([
        baseDraft({ id: draftId("01"), workspaceId }),
        baseDraft({ id: draftId("02"), workspaceId: otherWorkspaceId }),
      ]),
    );
    const noSession = await postExpire(createTestApp({ service: store.service }), undefined, {});
    const apiKeyOnly = await postExpire(createTestApp({ service: store.service }), undefined, {
      authorization: `Bearer ${validApiKey}`,
    });

    expect(noSession.status).toBe(401);
    expect(apiKeyOnly.status).toBe(401);
    expect(store.repository.listCandidateDrafts).not.toHaveBeenCalled();

    for (const role of ["admin", "founder"] as const) {
      const response = await postExpire(
        createTestApp({ service: store.service, user: { ...testUser, role } }),
        undefined,
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(GmailExportStaleLeaseExpireResponseSchema.parse(body)).toEqual(body);
      expect(body.data.items.map((item: { draftId: string }) => item.draftId)).toEqual([
        draftId("01"),
      ]);
      expectNoForbiddenPayload(body);
    }
  });

  it("rejects non-admin sessions and client-provided workspace identity", async () => {
    const store = createService();
    const nonAdmin = await postExpire(
      createTestApp({ service: store.service, user: { ...testUser, role: "operator" } }),
      undefined,
    );
    const bodyWorkspace = await postExpire(createTestApp({ service: store.service }), {
      workspaceId: otherWorkspaceId,
    });
    const queryWorkspace = await createTestApp({ service: store.service }).request(
      "/api/admin/gmail-export/stale-leases/expire?workspaceId=00000000-0000-4000-8000-000000024999",
      {
        method: "POST",
        headers: validSessionHeaders(),
      },
    );
    const headerWorkspace = await postExpire(createTestApp({ service: store.service }), undefined, {
      ...validSessionHeaders(),
      "x-workspace-id": otherWorkspaceId,
    });

    expect(nonAdmin.status).toBe(403);
    expect(bodyWorkspace.status).toBe(400);
    expect(queryWorkspace.status).toBe(400);
    expect(headerWorkspace.status).toBe(400);
    expect(store.repository.listCandidateDrafts).not.toHaveBeenCalled();
  });
});

describe("Gmail export stale lease hygiene service", () => {
  it("defaults to dry run, previews stale leases, and creates no side effects", async () => {
    const draft = baseDraft();
    const store = createService(createFakeRepository([draft]));
    const response = await postExpire(createTestApp({ service: store.service }), undefined);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      dryRun: true,
      processed: 1,
      expired: 0,
      skipped: 0,
      diagnosticTraceId: traceId,
      items: [
        {
          draftId: draft.id,
          action: "would_expire",
          previousLeaseExpiresAt: staleLeaseAt,
        },
      ],
    });
    expect(gmailExport(draft).leaseToken).toBe("secret-lease-token");
    expect(store.activityLogs).toHaveLength(0);
    expect(store.backgroundJobs).toHaveLength(0);
    expect(store.emailSends).toHaveLength(0);
    expect(store.approvals).toHaveLength(0);
    expectNoForbiddenPayload(body);
  });

  it("requires exact confirmation for real execution", async () => {
    const draft = baseDraft();
    const store = createService(createFakeRepository([draft]));
    const app = createTestApp({ service: store.service });
    const missingConfirm = await postExpire(app, { dryRun: false });
    const wrongConfirm = await postExpire(app, { dryRun: false, confirm: "EXPIRE_LEASES" });

    expect(missingConfirm.status).toBe(400);
    expect(wrongConfirm.status).toBe(400);
    expect(gmailExport(draft).leaseToken).toBe("secret-lease-token");
    expect(store.activityLogs).toHaveLength(0);
  });

  it("expires only stale leases, preserves request state, and logs safe metadata", async () => {
    const stale = baseDraft({ id: draftId("01") });
    const active = baseDraft({
      id: draftId("02"),
      metadataJson: {
        gmailExport: {
          status: "leased",
          leaseToken: "active-secret-token",
          leaseExpiresAt: activeLeaseAt,
        },
      },
    });
    const exported = baseDraft({
      id: draftId("03"),
      metadataJson: {
        gmailExport: {
          status: "exported",
          exportedAt: "2026-05-14T10:00:00.000Z",
          leaseToken: "exported-secret-token",
          leaseExpiresAt: staleLeaseAt,
        },
      },
    });
    const cancelled = baseDraft({
      id: draftId("04"),
      metadataJson: {
        gmailExport: {
          status: "cancelled",
          cancelledAt: "2026-05-14T10:30:00.000Z",
          leaseToken: "cancelled-secret-token",
          leaseExpiresAt: staleLeaseAt,
        },
      },
    });
    const invalid = baseDraft({
      id: draftId("05"),
      metadataJson: {
        gmailExport: {
          status: "leased",
          leaseToken: "invalid-secret-token",
          leaseExpiresAt: "not-a-date",
        },
      },
    });
    const store = createService(
      createFakeRepository([stale, active, exported, cancelled, invalid]),
    );
    const response = await postExpire(createTestApp({ service: store.service }), {
      dryRun: false,
      confirm: GMAIL_EXPORT_STALE_LEASE_CONFIRM,
      maxLimit: 5,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      dryRun: false,
      processed: 5,
      expired: 1,
      skipped: 4,
      items: [
        { draftId: stale.id, action: "expired", previousLeaseExpiresAt: staleLeaseAt },
        { draftId: active.id, action: "skipped_active", previousLeaseExpiresAt: activeLeaseAt },
        { draftId: exported.id, action: "skipped_exported", previousLeaseExpiresAt: staleLeaseAt },
        {
          draftId: cancelled.id,
          action: "skipped_cancelled",
          previousLeaseExpiresAt: staleLeaseAt,
        },
        { draftId: invalid.id, action: "skipped_invalid_metadata", previousLeaseExpiresAt: null },
      ],
    });
    expect(gmailExport(stale)).toMatchObject({
      status: "requested",
      requestedAt: "2026-05-14T10:00:00.000Z",
      requestExpiresAt,
      requestSource: "admin_api",
      leaseToken: null,
      leaseExpiresAt: null,
      source: "apps_script",
    });
    expect(stale.subject).toBe("Private export subject");
    expect(stale.textBody).toBe("Private export body");
    expect(gmailExport(active).leaseToken).toBe("active-secret-token");
    expect(gmailExport(exported).status).toBe("exported");
    expect(gmailExport(cancelled).status).toBe("cancelled");
    expect(store.activityLogs).toHaveLength(1);
    expect(store.activityLogs[0]).toMatchObject({
      action: "draft.gmail_export_stale_lease_expired",
      entityType: "draft",
      entityId: stale.id,
      metadataJson: {
        diagnosticTraceId: traceId,
        draftId: stale.id,
        previousLeaseExpiresAt: staleLeaseAt,
        source: "admin_stale_lease_hygiene",
      },
    });
    expect(Object.keys(store.activityLogs[0]!.metadataJson).sort()).toEqual([
      "diagnosticTraceId",
      "draftId",
      "previousLeaseExpiresAt",
      "source",
    ]);
    expectNoForbiddenPayload(body);
    expectNoForbiddenPayload(store.activityLogs[0]!.metadataJson);
  });

  it("respects maxLimit for real execution", async () => {
    const drafts = [
      baseDraft({ id: draftId("01") }),
      baseDraft({ id: draftId("02") }),
      baseDraft({ id: draftId("03") }),
    ];
    const store = createService(createFakeRepository(drafts));
    const response = await postExpire(createTestApp({ service: store.service }), {
      dryRun: false,
      confirm: GMAIL_EXPORT_STALE_LEASE_CONFIRM,
      maxLimit: 2,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.expired).toBe(2);
    expect(store.activityLogs).toHaveLength(2);
    expect(gmailExport(drafts[0]!).leaseToken).toBeNull();
    expect(gmailExport(drafts[1]!).leaseToken).toBeNull();
    expect(gmailExport(drafts[2]!).leaseToken).toBe("secret-lease-token");
  });

  it("reduces cockpit staleLeaseCount without leaking other cockpit fields", async () => {
    const draft = baseDraft({ id: draftId("01") });
    const store = createService(createFakeRepository([draft]));
    const cockpit = createClientCockpitSummaryService(
      {
        getSummaryRows: vi.fn(async () => ({
          leads: [],
          leadScores: [],
          drafts: [
            {
              workspaceId,
              status: draft.status,
              createdAt: draft.createdAt,
              updatedAt: draft.updatedAt,
              metadataJson: draft.metadataJson,
            },
          ],
          backgroundJobs: [],
        })),
      },
      () => now,
    );

    const before = await cockpit.getSummary(workspaceId);
    expect(before.gmailExport.staleLeaseCount).toBe(1);

    await store.service.expireStaleLeases({
      workspaceId,
      actorUserId,
      dryRun: false,
      maxLimit: 25,
      confirm: GMAIL_EXPORT_STALE_LEASE_CONFIRM,
    });

    const after = await cockpit.getSummary(workspaceId);
    const response = ClientCockpitSummaryResponseSchema.parse({ success: true, data: after });

    expect(after.gmailExport.staleLeaseCount).toBe(0);
    expect(after.gmailExport.activeLeaseCount).toBe(0);
    expect(response.data.gmailExport).toEqual(after.gmailExport);
    expectNoForbiddenPayload(response);
  });

  it("does not import providers or expose unsafe fields in stale lease source", () => {
    const routeSource = readFileSync(
      new URL("../routes/admin/gmail-export-stale-leases.ts", import.meta.url),
      "utf8",
    );
    const serviceSource = readFileSync(
      new URL("../services/gmail-export-stale-lease.ts", import.meta.url),
      "utf8",
    );
    const repositorySource = readFileSync(
      new URL("../repositories/gmail-export-stale-lease.repository.ts", import.meta.url),
      "utf8",
    );
    const contractSource = readFileSync(
      new URL(
        "../../../../packages/shared/src/contracts/gmail-export-stale-lease.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const combined = [routeSource, serviceSource, repositorySource].join("\n");

    expect(combined).not.toMatch(/fetch\(|googleapis|GoogleAuth|Resend|OpenRouter|sendEmail/);
    expect(serviceSource).not.toMatch(/workspaceId.*req|req\..*workspaceId|header\(|query\(/);
    expect(contractSource).not.toMatch(
      /leaseToken|metadataJson|metadata_json|workspaceId|payloadJson|payload_json/,
    );
  });
});
