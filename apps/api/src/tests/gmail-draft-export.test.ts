import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import type {
  GmailExportConfirmService,
  GmailExportConfirmServiceResult,
} from "../services/gmail-export-confirm.js";
import type { GmailExportPendingService } from "../services/gmail-export-pending.js";
import { createDraftGmailExportRoutes } from "../routes/drafts-gmail-export.js";

const workspaceId = "00000000-0000-4000-8000-000000023501";
const otherWorkspaceId = "00000000-0000-4000-8000-000000023502";
const apiKeyId = "00000000-0000-4000-8000-000000023503";
const validApiKey = "syr_live_valid_gmail_export_key";
const revokedApiKey = "syr_live_revoked_gmail_export_key";
const draftId = "00000000-0000-4000-8000-000000023511";
const secondDraftId = "00000000-0000-4000-8000-000000023512";
const otherWorkspaceDraftId = "00000000-0000-4000-8000-000000023513";
const leadId = "00000000-0000-4000-8000-000000023521";
const contactId = "00000000-0000-4000-8000-000000023531";
const now = new Date("2026-05-13T18:00:00.000Z");

type StoredDraft = {
  id: string;
  workspaceId: string;
  leadId: string | null;
  status: string;
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  metadataJson: Record<string, unknown>;
  providerMessageId?: string;
  prompt?: string;
  output?: string;
  score?: number;
};

type StoredLead = {
  id: string;
  workspaceId: string;
  contactId: string | null;
};

type StoredContact = {
  id: string;
  workspaceId: string;
  email: string | null;
};

type ActivityLog = {
  action: string;
  entityType: string;
  entityId: string;
  metadataJson: Record<string, unknown>;
};

function bearer(value: string) {
  return {
    authorization: `Bearer ${value}`,
    "content-type": "application/json",
  };
}

function compact(value: unknown): string {
  return JSON.stringify(value);
}

function expectNoResponseLeak(value: unknown) {
  const serialized = compact(value);

  for (const forbidden of [
    workspaceId,
    otherWorkspaceId,
    contactId,
    "metadataJson",
    "metadata",
    "provider-message-secret",
    "providerMessageId",
    "prompt-secret",
    "output-secret",
    "score",
    validApiKey,
    "apiKey",
    "keyHash",
    "plaintextApiKey",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

function expectNoActivityLeak(value: unknown) {
  const serialized = compact(value);

  for (const forbidden of [
    "client@example.test",
    "Subject to export",
    "Private body to export.",
    "lease-token",
    workspaceId,
    contactId,
    validApiKey,
    "apiKey",
    "keyHash",
    "plaintextApiKey",
    "provider-message-secret",
    "prompt-secret",
    "output-secret",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

function baseDraft(overrides: Partial<StoredDraft> = {}): StoredDraft {
  return {
    id: draftId,
    workspaceId,
    leadId,
    status: "draft",
    subject: "Subject to export",
    textBody: "Private body to export.",
    htmlBody: "<p>Private HTML body.</p>",
    metadataJson: {
      origin: "ai_draft_generation",
      aiRunId: "00000000-0000-4000-8000-000000023599",
      promptTemplateId: "draft-email-v1",
      gmailExport: {
        status: "requested",
        requestedAt: "2026-05-13T17:00:00.000Z",
        requestExpiresAt: "2026-05-14T17:00:00.000Z",
        requestSource: "admin_api",
        cancelledAt: null,
      },
    },
    providerMessageId: "provider-message-secret",
    prompt: "prompt-secret",
    output: "output-secret",
    score: 94,
    ...overrides,
  };
}

function baseLead(overrides: Partial<StoredLead> = {}): StoredLead {
  return {
    id: leadId,
    workspaceId,
    contactId,
    ...overrides,
  };
}

function baseContact(overrides: Partial<StoredContact> = {}): StoredContact {
  return {
    id: contactId,
    workspaceId,
    email: "client@example.test",
    ...overrides,
  };
}

function createFakeGmailExportServices(
  input: {
    drafts?: StoredDraft[];
    leads?: StoredLead[];
    contacts?: StoredContact[];
    currentTime?: Date;
  } = {},
) {
  const drafts = new Map((input.drafts ?? [baseDraft()]).map((draft) => [draft.id, draft]));
  const leads = new Map((input.leads ?? [baseLead()]).map((lead) => [lead.id, lead]));
  const contacts = new Map(
    (input.contacts ?? [baseContact()]).map((contact) => [contact.id, contact]),
  );
  const activityLogs: ActivityLog[] = [];
  const emailSends: unknown[] = [];
  const approvals: unknown[] = [];
  const currentTime = input.currentTime ?? now;
  let leaseCounter = 1;

  function isEmailValidEnough(email: string | null): email is string {
    const trimmed = email?.trim();
    return Boolean(trimmed) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed ?? "");
  }

  function isExported(draft: StoredDraft): boolean {
    const gmailExport = draft.metadataJson.gmailExport;
    return (
      typeof gmailExport === "object" &&
      gmailExport !== null &&
      "exportedAt" in gmailExport &&
      Boolean((gmailExport as Record<string, unknown>).exportedAt)
    );
  }

  function leaseExpiresAt(draft: StoredDraft): Date | null {
    const gmailExport = draft.metadataJson.gmailExport;

    if (typeof gmailExport !== "object" || gmailExport === null) {
      return null;
    }

    const value = (gmailExport as Record<string, unknown>).leaseExpiresAt;
    if (typeof value !== "string") {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function hasActiveLease(draft: StoredDraft): boolean {
    const gmailExport = draft.metadataJson.gmailExport;

    return (
      typeof gmailExport === "object" &&
      gmailExport !== null &&
      typeof (gmailExport as Record<string, unknown>).leaseToken === "string" &&
      Boolean(leaseExpiresAt(draft) && leaseExpiresAt(draft)! > currentTime)
    );
  }

  function hasActiveRequest(draft: StoredDraft): boolean {
    const gmailExport = draft.metadataJson.gmailExport;

    if (typeof gmailExport !== "object" || gmailExport === null) {
      return false;
    }

    const requestExpiresAt = (gmailExport as Record<string, unknown>).requestExpiresAt;
    const parsedRequestExpiresAt =
      typeof requestExpiresAt === "string" ? new Date(requestExpiresAt) : null;

    return (
      typeof (gmailExport as Record<string, unknown>).requestedAt === "string" &&
      Boolean(parsedRequestExpiresAt && parsedRequestExpiresAt > currentTime) &&
      (gmailExport as Record<string, unknown>).status !== "cancelled" &&
      (gmailExport as Record<string, unknown>).status !== "exported" &&
      !(gmailExport as Record<string, unknown>).cancelledAt &&
      !(gmailExport as Record<string, unknown>).exportedAt
    );
  }

  const pendingService: GmailExportPendingService = {
    getPendingGmailExports: vi.fn(async (requestedWorkspaceId, query) => {
      const items = [];

      for (const draft of drafts.values()) {
        if (items.length >= query.limit) {
          break;
        }

        const lead = draft.leadId ? leads.get(draft.leadId) : null;
        const contact = lead?.contactId ? contacts.get(lead.contactId) : null;

        if (
          draft.workspaceId !== requestedWorkspaceId ||
          draft.status !== "draft" ||
          !draft.subject?.trim() ||
          !draft.textBody?.trim() ||
          !draft.leadId ||
          !lead ||
          lead.workspaceId !== requestedWorkspaceId ||
          !lead.contactId ||
          !contact ||
          contact.workspaceId !== requestedWorkspaceId ||
          !isEmailValidEnough(contact.email) ||
          isExported(draft) ||
          !hasActiveRequest(draft) ||
          hasActiveLease(draft)
        ) {
          continue;
        }

        const leaseToken = `lease-token-${String(leaseCounter).padStart(4, "0")}-abcdefghijkl`;
        leaseCounter += 1;
        const expiresAt = new Date(currentTime.getTime() + 10 * 60 * 1000).toISOString();
        const previousGmailExport =
          typeof draft.metadataJson.gmailExport === "object" &&
          draft.metadataJson.gmailExport !== null
            ? (draft.metadataJson.gmailExport as Record<string, unknown>)
            : {};

        draft.metadataJson = {
          ...draft.metadataJson,
          gmailExport: {
            ...previousGmailExport,
            status: "leased",
            leaseToken,
            leaseExpiresAt: expiresAt,
            exportedAt: null,
            source: "apps_script",
          },
        };

        items.push({
          draftId: draft.id,
          leadId: draft.leadId,
          toEmail: contact.email.trim(),
          subject: draft.subject,
          bodyText: draft.textBody,
          leaseToken,
          leaseExpiresAt: expiresAt,
        });
      }

      return items;
    }),
  };

  const confirmService: GmailExportConfirmService = {
    confirmGmailExport: vi.fn(
      async (
        requestedWorkspaceId,
        requestedDraftId,
        leaseToken,
      ): Promise<GmailExportConfirmServiceResult> => {
        const draft = drafts.get(requestedDraftId);

        if (!draft || draft.workspaceId !== requestedWorkspaceId) {
          return { result: "not_found" };
        }

        const gmailExport =
          typeof draft.metadataJson.gmailExport === "object" &&
          draft.metadataJson.gmailExport !== null
            ? (draft.metadataJson.gmailExport as Record<string, unknown>)
            : {};

        if (typeof gmailExport.exportedAt === "string") {
          return {
            result: "ok",
            data: {
              draftId: draft.id,
              status: "exported",
              alreadyExported: true,
              exportedAt: gmailExport.exportedAt,
            },
          };
        }

        if (typeof gmailExport.leaseToken !== "string") {
          return { result: "conflict", code: "GMAIL_EXPORT_LEASE_MISSING" };
        }

        if (gmailExport.leaseToken !== leaseToken) {
          return { result: "conflict", code: "GMAIL_EXPORT_LEASE_MISMATCH" };
        }

        const expiresAt = leaseExpiresAt(draft);

        if (!expiresAt || expiresAt <= currentTime) {
          return { result: "conflict", code: "GMAIL_EXPORT_LEASE_EXPIRED" };
        }

        const exportedAt = currentTime.toISOString();
        draft.metadataJson = {
          ...draft.metadataJson,
          gmailExport: {
            ...gmailExport,
            status: "exported",
            leaseToken: null,
            leaseExpiresAt: null,
            exportedAt,
            source: "apps_script",
          },
        };
        activityLogs.push({
          action: "draft.gmail_exported",
          entityType: "draft",
          entityId: draft.id,
          metadataJson: {
            draftId: draft.id,
            leadId: draft.leadId,
            source: "apps_script",
            exportedAt,
          },
        });

        return {
          result: "ok",
          data: {
            draftId: draft.id,
            status: "exported",
            alreadyExported: false,
            exportedAt,
          },
        };
      },
    ),
  };

  return {
    pendingService,
    confirmService,
    drafts,
    activityLogs,
    emailSends,
    approvals,
  };
}

function createTestApp(services = createFakeGmailExportServices()) {
  const app = new Hono();

  app.route(
    "/api/drafts",
    createDraftGmailExportRoutes({
      authenticateApiKey: vi.fn(async (authorizationHeader?: string | null) => {
        const match = /^Bearer\s+(.+)$/.exec(authorizationHeader ?? "");
        const key = match?.[1] ?? "";

        if (key !== validApiKey) {
          return null;
        }

        return {
          id: apiKeyId,
          workspaceId,
        };
      }),
      gmailExportPendingService: services.pendingService,
      gmailExportConfirmService: services.confirmService,
    }),
  );

  return { app, services };
}

async function getPending(services = createFakeGmailExportServices(), limit?: number) {
  const { app } = createTestApp(services);
  const suffix = limit === undefined ? "" : `?limit=${limit}`;
  const response = await app.request(`/api/drafts/gmail-export-pending${suffix}`, {
    headers: bearer(validApiKey),
  });

  return { response, services };
}

async function leasedFixture() {
  const services = createFakeGmailExportServices();
  const pending = await getPending(services);
  const body = await pending.response.json();
  return {
    services,
    item: body.data[0] as { draftId: string; leaseToken: string },
  };
}

describe("Gmail draft export API-key routes", () => {
  it("GET pending returns 401 without an API key", async () => {
    const { app } = createTestApp();
    const response = await app.request("/api/drafts/gmail-export-pending");

    expect(response.status).toBe(401);
  });

  it("GET pending rejects invalid or revoked API keys", async () => {
    const { app } = createTestApp();

    for (const key of ["not-a-key", revokedApiKey]) {
      const response = await app.request("/api/drafts/gmail-export-pending", {
        headers: bearer(key),
      });

      expect(response.status).toBe(401);
    }
  });

  it("GET pending returns only drafts in the API key workspace", async () => {
    const services = createFakeGmailExportServices({
      drafts: [
        baseDraft(),
        baseDraft({
          id: otherWorkspaceDraftId,
          workspaceId: otherWorkspaceId,
          leadId: "00000000-0000-4000-8000-000000023522",
        }),
      ],
      leads: [
        baseLead(),
        baseLead({
          id: "00000000-0000-4000-8000-000000023522",
          workspaceId: otherWorkspaceId,
          contactId: "00000000-0000-4000-8000-000000023532",
        }),
      ],
      contacts: [
        baseContact(),
        baseContact({
          id: "00000000-0000-4000-8000-000000023532",
          workspaceId: otherWorkspaceId,
        }),
      ],
    });

    const { response } = await getPending(services);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].draftId).toBe(draftId);
    expectNoResponseLeak(body);
  });

  it("GET pending excludes exported drafts", async () => {
    const services = createFakeGmailExportServices({
      drafts: [
        baseDraft({
          metadataJson: {
            origin: "ai_draft_generation",
            gmailExport: {
              status: "exported",
              exportedAt: "2026-05-13T17:00:00.000Z",
              source: "apps_script",
            },
          },
        }),
      ],
    });

    const { response } = await getPending(services);
    const body = await response.json();

    expect(body.data).toEqual([]);
  });

  it("GET pending excludes drafts without an explicit active request", async () => {
    const services = createFakeGmailExportServices({
      drafts: [
        baseDraft({
          metadataJson: {
            origin: "ai_draft_generation",
          },
        }),
      ],
    });

    const { response } = await getPending(services);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("GET pending excludes expired and cancelled requests", async () => {
    const services = createFakeGmailExportServices({
      drafts: [
        baseDraft({
          id: draftId,
          metadataJson: {
            gmailExport: {
              status: "requested",
              requestedAt: "2026-05-12T18:00:00.000Z",
              requestExpiresAt: "2026-05-13T17:59:59.000Z",
              requestSource: "admin_api",
            },
          },
        }),
        baseDraft({
          id: secondDraftId,
          metadataJson: {
            gmailExport: {
              status: "cancelled",
              requestedAt: "2026-05-13T17:00:00.000Z",
              requestExpiresAt: "2026-05-14T17:00:00.000Z",
              requestSource: "admin_api",
              cancelledAt: "2026-05-13T17:30:00.000Z",
            },
          },
        }),
      ],
    });

    const { response } = await getPending(services);

    expect((await response.json()).data).toEqual([]);
  });

  it("GET pending excludes active leases", async () => {
    const services = createFakeGmailExportServices({
      drafts: [
        baseDraft({
          metadataJson: {
            gmailExport: {
              status: "leased",
              leaseToken: "active-lease-token-abcdefghijkl",
              leaseExpiresAt: "2026-05-13T18:05:00.000Z",
              exportedAt: null,
            },
          },
        }),
      ],
    });

    const { response } = await getPending(services);
    const body = await response.json();

    expect(body.data).toEqual([]);
  });

  it("GET pending re-leases expired leases", async () => {
    const services = createFakeGmailExportServices({
      drafts: [
        baseDraft({
          metadataJson: {
            keepMe: true,
            gmailExport: {
              status: "leased",
              requestedAt: "2026-05-13T17:00:00.000Z",
              requestExpiresAt: "2026-05-14T17:00:00.000Z",
              requestSource: "admin_api",
              leaseToken: "expired-lease-token-abcdefghijkl",
              leaseExpiresAt: "2026-05-13T17:00:00.000Z",
              exportedAt: null,
            },
          },
        }),
      ],
    });

    const { response } = await getPending(services);
    const body = await response.json();
    const metadata = services.drafts.get(draftId)!.metadataJson;

    expect(body.data).toHaveLength(1);
    expect(body.data[0].leaseToken).not.toBe("expired-lease-token-abcdefghijkl");
    expect(metadata).toMatchObject({
      keepMe: true,
      gmailExport: {
        status: "leased",
        requestedAt: "2026-05-13T17:00:00.000Z",
        requestExpiresAt: "2026-05-14T17:00:00.000Z",
        requestSource: "admin_api",
        leaseExpiresAt: "2026-05-13T18:10:00.000Z",
        exportedAt: null,
        source: "apps_script",
      },
    });
  });

  it("GET pending respects default limit 5 and max limit 10", async () => {
    const drafts = Array.from({ length: 12 }, (_, index) =>
      baseDraft({
        id: `00000000-0000-4000-8000-${String(23540 + index).padStart(12, "0")}`,
      }),
    );
    const services = createFakeGmailExportServices({ drafts });
    const freshDrafts = Array.from({ length: 12 }, (_, index) =>
      baseDraft({
        id: `00000000-0000-4000-8000-${String(23640 + index).padStart(12, "0")}`,
      }),
    );
    const defaultResponse = await getPending(services);
    const cappedResponse = await getPending(
      createFakeGmailExportServices({ drafts: freshDrafts }),
      10,
    );

    expect((await defaultResponse.response.json()).data).toHaveLength(5);
    expect((await cappedResponse.response.json()).data).toHaveLength(10);
  });

  it("GET pending requires draft.status='draft'", async () => {
    const services = createFakeGmailExportServices({
      drafts: [baseDraft({ status: "approved" })],
    });

    const { response } = await getPending(services);

    expect((await response.json()).data).toEqual([]);
  });

  it("GET pending requires subject and text body", async () => {
    const services = createFakeGmailExportServices({
      drafts: [
        baseDraft({ id: draftId, subject: " " }),
        baseDraft({ id: secondDraftId, textBody: null }),
      ],
    });

    const { response } = await getPending(services);

    expect((await response.json()).data).toEqual([]);
  });

  it("GET pending requires lead_id and contact email", async () => {
    const services = createFakeGmailExportServices({
      drafts: [
        baseDraft({ id: draftId, leadId: null }),
        baseDraft({ id: secondDraftId, leadId: "00000000-0000-4000-8000-000000023522" }),
      ],
      leads: [baseLead({ id: "00000000-0000-4000-8000-000000023522" })],
      contacts: [baseContact({ email: null })],
    });

    const { response } = await getPending(services);

    expect((await response.json()).data).toEqual([]);
  });

  it("GET pending writes leaseToken and leaseExpiresAt to metadata_json.gmailExport", async () => {
    const { response, services } = await getPending();
    const body = await response.json();
    const gmailExport = services.drafts.get(draftId)!.metadataJson.gmailExport as Record<
      string,
      unknown
    >;

    expect(body.data[0]).toMatchObject({
      draftId,
      leadId,
      toEmail: "client@example.test",
      subject: "Subject to export",
      bodyText: "Private body to export.",
      leaseExpiresAt: "2026-05-13T18:10:00.000Z",
    });
    expect(gmailExport.leaseToken).toBe(body.data[0].leaseToken);
    expect(gmailExport.leaseExpiresAt).toBe("2026-05-13T18:10:00.000Z");
    expect(gmailExport.requestedAt).toBe("2026-05-13T17:00:00.000Z");
    expect(gmailExport.requestExpiresAt).toBe("2026-05-14T17:00:00.000Z");
    expect(gmailExport.requestSource).toBe("admin_api");
  });

  it("POST confirm returns 401 without an API key", async () => {
    const { app } = createTestApp();
    const response = await app.request(`/api/drafts/${draftId}/gmail-export-confirmed`, {
      method: "POST",
      body: JSON.stringify({ leaseToken: "lease-token-0001-abcdefghijkl" }),
    });

    expect(response.status).toBe(401);
  });

  it("POST confirm rejects invalid or revoked API keys", async () => {
    const { app } = createTestApp();

    for (const key of ["not-a-key", revokedApiKey]) {
      const response = await app.request(`/api/drafts/${draftId}/gmail-export-confirmed`, {
        method: "POST",
        headers: bearer(key),
        body: JSON.stringify({ leaseToken: "lease-token-0001-abcdefghijkl" }),
      });

      expect(response.status).toBe(401);
    }
  });

  it("POST confirm succeeds with a valid lease", async () => {
    const { services, item } = await leasedFixture();
    const { app } = createTestApp(services);
    const response = await app.request(`/api/drafts/${item.draftId}/gmail-export-confirmed`, {
      method: "POST",
      headers: bearer(validApiKey),
      body: JSON.stringify({ leaseToken: item.leaseToken }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        draftId,
        status: "exported",
        alreadyExported: false,
        exportedAt: "2026-05-13T18:00:00.000Z",
      },
    });
  });

  it("POST confirm sets exportedAt, clears lease fields, and preserves metadata", async () => {
    const { services, item } = await leasedFixture();
    const { app } = createTestApp(services);

    await app.request(`/api/drafts/${item.draftId}/gmail-export-confirmed`, {
      method: "POST",
      headers: bearer(validApiKey),
      body: JSON.stringify({ leaseToken: item.leaseToken }),
    });

    expect(services.drafts.get(draftId)!.metadataJson).toMatchObject({
      origin: "ai_draft_generation",
      aiRunId: "00000000-0000-4000-8000-000000023599",
      promptTemplateId: "draft-email-v1",
      gmailExport: {
        status: "exported",
        leaseToken: null,
        leaseExpiresAt: null,
        exportedAt: "2026-05-13T18:00:00.000Z",
        source: "apps_script",
      },
    });
  });

  it("POST confirm already exported returns 200 alreadyExported=true", async () => {
    const services = createFakeGmailExportServices({
      drafts: [
        baseDraft({
          metadataJson: {
            origin: "ai_draft_generation",
            gmailExport: {
              status: "exported",
              leaseToken: null,
              leaseExpiresAt: null,
              exportedAt: "2026-05-13T17:00:00.000Z",
              source: "apps_script",
            },
          },
        }),
      ],
    });
    const { app } = createTestApp(services);
    const response = await app.request(`/api/drafts/${draftId}/gmail-export-confirmed`, {
      method: "POST",
      headers: bearer(validApiKey),
      body: JSON.stringify({ leaseToken: "wrong-lease-token-abcdefghijkl" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.alreadyExported).toBe(true);
    expect(body.data.exportedAt).toBe("2026-05-13T17:00:00.000Z");
  });

  it("POST confirm wrong lease returns 409", async () => {
    const { services, item } = await leasedFixture();
    const { app } = createTestApp(services);
    const response = await app.request(`/api/drafts/${item.draftId}/gmail-export-confirmed`, {
      method: "POST",
      headers: bearer(validApiKey),
      body: JSON.stringify({ leaseToken: "wrong-lease-token-abcdefghijkl" }),
    });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("GMAIL_EXPORT_LEASE_MISMATCH");
  });

  it("POST confirm expired lease returns 409", async () => {
    const services = createFakeGmailExportServices({
      drafts: [
        baseDraft({
          metadataJson: {
            gmailExport: {
              status: "leased",
              leaseToken: "expired-lease-token-abcdefghijkl",
              leaseExpiresAt: "2026-05-13T17:00:00.000Z",
              exportedAt: null,
            },
          },
        }),
      ],
    });
    const { app } = createTestApp(services);
    const response = await app.request(`/api/drafts/${draftId}/gmail-export-confirmed`, {
      method: "POST",
      headers: bearer(validApiKey),
      body: JSON.stringify({ leaseToken: "expired-lease-token-abcdefghijkl" }),
    });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("GMAIL_EXPORT_LEASE_EXPIRED");
  });

  it("POST confirm cross-workspace returns safe not found", async () => {
    const services = createFakeGmailExportServices({
      drafts: [baseDraft({ id: otherWorkspaceDraftId, workspaceId: otherWorkspaceId })],
    });
    const { app } = createTestApp(services);
    const response = await app.request(
      `/api/drafts/${otherWorkspaceDraftId}/gmail-export-confirmed`,
      {
        method: "POST",
        headers: bearer(validApiKey),
        body: JSON.stringify({ leaseToken: "lease-token-0001-abcdefghijkl" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ success: false, error: "Draft not found.", code: "DRAFT_NOT_FOUND" });
  });

  it("confirm creates only a safe activity log", async () => {
    const { services, item } = await leasedFixture();
    const { app } = createTestApp(services);

    await app.request(`/api/drafts/${item.draftId}/gmail-export-confirmed`, {
      method: "POST",
      headers: bearer(validApiKey),
      body: JSON.stringify({ leaseToken: item.leaseToken }),
    });

    expect(services.activityLogs).toEqual([
      {
        action: "draft.gmail_exported",
        entityType: "draft",
        entityId: draftId,
        metadataJson: {
          draftId,
          leadId,
          source: "apps_script",
          exportedAt: "2026-05-13T18:00:00.000Z",
        },
      },
    ]);
    expectNoActivityLeak(services.activityLogs);
  });

  it("does not create email_sends or approvals", async () => {
    const { services, item } = await leasedFixture();
    const { app } = createTestApp(services);

    await app.request(`/api/drafts/${item.draftId}/gmail-export-confirmed`, {
      method: "POST",
      headers: bearer(validApiKey),
      body: JSON.stringify({ leaseToken: item.leaseToken }),
    });

    expect(services.emailSends).toHaveLength(0);
    expect(services.approvals).toHaveLength(0);
  });

  it("does not mutate draft subject, body, or status", async () => {
    const { services, item } = await leasedFixture();
    const { app } = createTestApp(services);

    await app.request(`/api/drafts/${item.draftId}/gmail-export-confirmed`, {
      method: "POST",
      headers: bearer(validApiKey),
      body: JSON.stringify({ leaseToken: item.leaseToken }),
    });

    expect(services.drafts.get(draftId)).toMatchObject({
      status: "draft",
      subject: "Subject to export",
      textBody: "Private body to export.",
      htmlBody: "<p>Private HTML body.</p>",
    });
  });

  it("rejects workspace identifiers from client input", async () => {
    const { app } = createTestApp();
    const getResponse = await app.request(
      `/api/drafts/gmail-export-pending?workspaceId=${workspaceId}`,
      {
        headers: bearer(validApiKey),
      },
    );
    const postResponse = await app.request(`/api/drafts/${draftId}/gmail-export-confirmed`, {
      method: "POST",
      headers: bearer(validApiKey),
      body: JSON.stringify({ leaseToken: "lease-token-0001-abcdefghijkl", workspaceId }),
    });

    expect(getResponse.status).toBe(422);
    expect(postResponse.status).toBe(422);
  });

  it("does not introduce Gmail send, provider calls, worker changes, or model changes", async () => {
    const routeSource = readFileSync(
      new URL("../routes/drafts-gmail-export.ts", import.meta.url),
      "utf8",
    );
    const repositorySource = readFileSync(
      new URL("../repositories/drafts-gmail-export.ts", import.meta.url),
      "utf8",
    );
    const generateDraftSource = readFileSync(
      new URL("../services/generate-ai-draft-job-handler.ts", import.meta.url),
      "utf8",
    );
    const scoringSource = readFileSync(
      new URL("../services/score-lead-job-handler.ts", import.meta.url),
      "utf8",
    );
    const pricingSource = readFileSync(
      new URL("../services/ai/pricing.ts", import.meta.url),
      "utf8",
    );
    const gmailExportSource = `${routeSource}\n${repositorySource}`;

    expect(gmailExportSource).not.toContain("GmailApp");
    expect(gmailExportSource).not.toContain("approvals");
    expect(gmailExportSource).not.toContain("OpenRouter");
    expect(gmailExportSource).not.toContain("insert(emailSends");
    expect(gmailExportSource).not.toContain("insert(approvals");
    expect(generateDraftSource).toContain("resolveAllowedAiDraftModel");
    expect(scoringSource).toContain("resolveAllowedAiModel");
    expect(pricingSource).toContain("AI_DRAFT_MODEL");
    expect(pricingSource).toContain("AI_MODEL");
  });
});
