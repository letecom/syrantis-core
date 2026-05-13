import { readFileSync } from "node:fs";

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthMe, LeadContactContextDto } from "@syrantis/shared";

import { withWorkspaceDb } from "../lib/db.js";
import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import {
  findLeadContactContextAggregate,
  findLeadContactContextSource,
  type ContactContextMatchKey,
  type LeadContactContextAggregateRow,
  type LeadContactContextSourceRow,
} from "../repositories/lead-contact-context.js";
import { createLeadRoutes } from "../routes/leads.js";
import type { AuthService } from "../services/auth.js";
import {
  createLeadContactContextService,
  type LeadContactContextRepository,
  type LeadContactContextService,
} from "../services/lead-contact-context.js";
import type { LeadService } from "../services/leads.js";
import { testUser, validSessionToken } from "./mocks/auth.js";

const mockDb = vi.hoisted(() => ({
  tx: undefined as unknown,
}));

vi.mock("../lib/db.js", () => ({
  withWorkspaceDb: vi.fn(async (_workspaceId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockDb.tx),
  ),
}));

const workspaceId = testUser.workspaceId;
const leadId = "00000000-0000-4000-8000-000000023001";
const otherWorkspaceLeadId = "00000000-0000-4000-8000-000000023003";
const contactId = "00000000-0000-4000-8000-000000023004";
const now = new Date("2026-05-13T12:00:00.000Z");

function validSessionHeaders() {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
  };
}

function authServiceFor(user: AuthMe | null = testUser): AuthService {
  return {
    login: vi.fn(async () => null),
    getCurrentUser: vi.fn(async (token: string) => (token === validSessionToken ? user : null)),
    logout: vi.fn(async () => undefined),
  };
}

function fakeLeadService(): LeadService {
  return {
    listLeads: vi.fn(),
    getLead: vi.fn(),
    createLead: vi.fn(),
    updateLead: vi.fn(),
    requestLeadScore: vi.fn(),
  } as unknown as LeadService;
}

function aggregate(
  overrides: Partial<LeadContactContextAggregateRow> = {},
): LeadContactContextAggregateRow {
  return {
    previousLeadCount: 0,
    previousDraftCount: 0,
    previousOutboundCount: 0,
    lastPriorLeadAt: null,
    lastOutboundAt: null,
    lastOutboundDeliveryStatus: null,
    hasPriorBounce: false,
    hasPriorComplaint: false,
    ...overrides,
  };
}

function source(overrides: Partial<LeadContactContextSourceRow> = {}): LeadContactContextSourceRow {
  return {
    id: leadId,
    safeContactId: null,
    contactEmail: null,
    normalizedJsonFromEmail: "client@example.test",
    normalizedJsonEmail: null,
    ...overrides,
  };
}

function repositoryWith(input: {
  source?: LeadContactContextSourceRow | null;
  aggregate?: LeadContactContextAggregateRow;
}): LeadContactContextRepository {
  return {
    findSource: vi.fn(async () => (Object.hasOwn(input, "source") ? input.source! : source())),
    findAggregate: vi.fn(async () => input.aggregate ?? aggregate()),
  };
}

async function readContext(repository: LeadContactContextRepository) {
  const service = createLeadContactContextService({
    repository,
    now: () => now,
  });
  const result = await service.getContactContext(workspaceId, leadId);

  expect(result.result).toBe("ok");

  if (result.result !== "ok") {
    throw new Error("Expected ok contact context result.");
  }

  return result.context;
}

function assertSafePayload(value: unknown) {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    workspaceId,
    "workspaceId",
    "contactEmail",
    "contactName",
    "fromEmail",
    "client@example.test",
    "subject",
    "bodyText",
    "bodySummary",
    "htmlBody",
    "normalized_json",
    "normalizedJson",
    "metadata_json",
    "metadataJson",
    "provider_message_id",
    "providerMessageId",
    "apiKey",
    "token",
    "prompt",
    "rawOutput",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

function contactContextDto(overrides: Partial<LeadContactContextDto> = {}): LeadContactContextDto {
  return {
    leadId,
    contactKeyPresent: true,
    matchedBy: "email",
    hasPriorContext: false,
    previousLeadCount: 0,
    previousDraftCount: 0,
    previousOutboundCount: 0,
    lastPriorLeadAt: null,
    lastOutboundAt: null,
    lastOutboundDeliveryStatus: null,
    warnings: [],
    ...overrides,
  };
}

function serviceResult(context: LeadContactContextDto | null): LeadContactContextService {
  return {
    getContactContext: vi.fn(async (_workspaceId: string, requestedLeadId: string) => {
      if (requestedLeadId === otherWorkspaceLeadId || !context) {
        return { result: "not_found" as const };
      }

      return { result: "ok" as const, context };
    }),
  };
}

function createContactContextApp(input: {
  service: LeadContactContextService;
  user?: AuthMe | null;
}) {
  const app = new Hono();
  app.route(
    "/api/leads",
    createLeadRoutes({
      authService: authServiceFor(input.user ?? testUser),
      leadService: fakeLeadService(),
      leadContactContextService: input.service,
    }),
  );
  return app;
}

function createSelectBuilder(response: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    leftJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };

  return builder;
}

function createMockTx(input: { selectResponses?: unknown[][]; executeRows?: unknown[] } = {}) {
  const state = {
    selectResponses: [...(input.selectResponses ?? [])],
    executeRows: input.executeRows ?? [],
  };

  return {
    state,
    select: vi.fn(() => createSelectBuilder(state.selectResponses.shift() ?? [])),
    execute: vi.fn(async () => ({ rows: state.executeRows })),
    insert: vi.fn(() => {
      throw new Error("contact context read model must not insert");
    }),
    update: vi.fn(() => {
      throw new Error("contact context read model must not update");
    }),
    delete: vi.fn(() => {
      throw new Error("contact context read model must not delete");
    }),
  };
}

describe("lead contact context service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a no-contact-key DTO without aggregate reads when no usable key exists", async () => {
    const repository = repositoryWith({
      source: source({
        safeContactId: null,
        contactEmail: null,
        normalizedJsonFromEmail: "not an email",
        normalizedJsonEmail: " ",
      }),
    });

    const context = await readContext(repository);

    expect(context).toEqual(
      contactContextDto({
        contactKeyPresent: false,
        matchedBy: null,
        warnings: ["no_contact_key"],
      }),
    );
    expect(repository.findAggregate).not.toHaveBeenCalled();
  });

  it("uses a safe same-workspace contact id before email fallback", async () => {
    const repository = repositoryWith({
      source: source({
        safeContactId: contactId,
        contactEmail: "Contact@Example.Test",
        normalizedJsonFromEmail: "other@example.test",
      }),
      aggregate: aggregate(),
    });

    const context = await readContext(repository);

    expect(context.contactKeyPresent).toBe(true);
    expect(context.matchedBy).toBe("contact_id");
    expect(repository.findAggregate).toHaveBeenCalledWith({
      workspaceId,
      leadId,
      key: {
        matchedBy: "contact_id",
        contactId,
        email: "contact@example.test",
      },
    });
  });

  it("finds repeated public inbound context through a shared linked contact_id", async () => {
    const repository = repositoryWith({
      source: source({
        safeContactId: contactId,
        contactEmail: "Lead@Example.Test",
        normalizedJsonFromEmail: null,
        normalizedJsonEmail: null,
      }),
      aggregate: aggregate({
        previousLeadCount: 1,
        lastPriorLeadAt: new Date("2026-05-13T10:00:00.000Z"),
      }),
    });

    const context = await readContext(repository);

    expect(context).toEqual(
      contactContextDto({
        matchedBy: "contact_id",
        hasPriorContext: true,
        previousLeadCount: 1,
        lastPriorLeadAt: "2026-05-13T10:00:00.000Z",
        warnings: ["repeated_inbound_recent"],
      }),
    );
    expect(repository.findAggregate).toHaveBeenCalledWith({
      workspaceId,
      leadId,
      key: {
        matchedBy: "contact_id",
        contactId,
        email: "lead@example.test",
      },
    });
  });

  it("normalizes whitelisted email keys case-insensitively without plus alias canonicalization", async () => {
    const repository = repositoryWith({
      source: source({
        normalizedJsonFromEmail: " Client+Site@Example.Test ",
        normalizedJsonEmail: "fallback@example.test",
      }),
    });

    const context = await readContext(repository);

    expect(context.matchedBy).toBe("email");
    expect(repository.findAggregate).toHaveBeenCalledWith({
      workspaceId,
      leadId,
      key: {
        matchedBy: "email",
        email: "client+site@example.test",
      },
    });
  });

  it("assembles prior context counts, delivery status, and deterministic warnings", async () => {
    const repository = repositoryWith({
      source: source({ normalizedJsonFromEmail: " INFO@example.test " }),
      aggregate: aggregate({
        previousLeadCount: 2,
        previousDraftCount: 1,
        previousOutboundCount: 3,
        lastPriorLeadAt: new Date("2026-05-12T12:00:00.000Z"),
        lastOutboundAt: new Date("2026-05-10T12:00:00.000Z"),
        lastOutboundDeliveryStatus: "complained",
        hasPriorBounce: true,
        hasPriorComplaint: true,
      }),
    });

    const context = await readContext(repository);

    expect(context).toEqual(
      contactContextDto({
        hasPriorContext: true,
        previousLeadCount: 2,
        previousDraftCount: 1,
        previousOutboundCount: 3,
        lastPriorLeadAt: "2026-05-12T12:00:00.000Z",
        lastOutboundAt: "2026-05-10T12:00:00.000Z",
        lastOutboundDeliveryStatus: "complained",
        warnings: [
          "shared_inbox_possible",
          "repeated_inbound_recent",
          "recently_contacted",
          "prior_bounce",
          "prior_complaint",
        ],
      }),
    );
  });

  it.each(["contact", "info", "support", "sales", "admin", "hello", "bonjour", "accueil"])(
    "warns for shared inbox local part %s",
    async (localPart) => {
      const context = await readContext(
        repositoryWith({
          source: source({ normalizedJsonFromEmail: `${localPart}@example.test` }),
        }),
      );

      expect(context.warnings).toContain("shared_inbox_possible");
    },
  );

  it("keeps current-lead-only aggregate output empty and safe", async () => {
    const context = await readContext(repositoryWith({ aggregate: aggregate() }));

    expect(context).toEqual(contactContextDto());
    assertSafePayload(context);
  });

  it("returns not_found when the lead is unknown or cross-workspace", async () => {
    const service = createLeadContactContextService({
      repository: repositoryWith({ source: null }),
      now: () => now,
    });

    await expect(service.getContactContext(workspaceId, leadId)).resolves.toEqual({
      result: "not_found",
    });
  });
});

describe("lead contact context repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads only safe source fields through withWorkspaceDb", async () => {
    const tx = createMockTx({
      selectResponses: [
        [
          source({
            safeContactId: contactId,
            contactEmail: "Client@Example.Test",
            normalizedJsonFromEmail: "client@example.test",
            normalizedJsonEmail: "fallback@example.test",
          }),
        ],
      ],
    });
    mockDb.tx = tx;

    const result = await findLeadContactContextSource({ workspaceId, leadId });

    expect(result).toEqual({
      id: leadId,
      safeContactId: contactId,
      contactEmail: "Client@Example.Test",
      normalizedJsonFromEmail: "client@example.test",
      normalizedJsonEmail: "fallback@example.test",
    });
    expect(withWorkspaceDb).toHaveBeenCalledWith(workspaceId, expect.any(Function));
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("returns null when the current lead is absent or invisible under the workspace", async () => {
    const tx = createMockTx({ selectResponses: [[]] });
    mockDb.tx = tx;

    await expect(findLeadContactContextSource({ workspaceId, leadId })).resolves.toBeNull();
  });

  it("maps aggregate counts and delivery proof fields without mutating tables", async () => {
    const tx = createMockTx({
      executeRows: [
        {
          previous_lead_count: "1",
          previous_draft_count: 2,
          previous_outbound_count: "3",
          last_prior_lead_at: "2026-05-11T12:00:00.000Z",
          last_outbound_at: new Date("2026-05-12T12:00:00.000Z"),
          last_outbound_delivery_status: "delivered",
          has_prior_bounce: true,
          has_prior_complaint: false,
        },
      ],
    });
    mockDb.tx = tx;
    const key: ContactContextMatchKey = {
      matchedBy: "email",
      email: "client@example.test",
    };

    const result = await findLeadContactContextAggregate({ workspaceId, leadId, key });

    expect(result).toEqual({
      previousLeadCount: 1,
      previousDraftCount: 2,
      previousOutboundCount: 3,
      lastPriorLeadAt: new Date("2026-05-11T12:00:00.000Z"),
      lastOutboundAt: new Date("2026-05-12T12:00:00.000Z"),
      lastOutboundDeliveryStatus: "delivered",
      hasPriorBounce: true,
      hasPriorComplaint: false,
    });
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });
});

describe("GET /api/leads/:id/contact-context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without a session", async () => {
    const service = serviceResult(contactContextDto());
    const app = createContactContextApp({ service });

    const response = await app.request(`/api/leads/${leadId}/contact-context`);

    expect(response.status).toBe(401);
    expect(service.getContactContext).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid UUID", async () => {
    const service = serviceResult(contactContextDto());
    const app = createContactContextApp({ service });

    const response = await app.request("/api/leads/not-a-uuid/contact-context", {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(400);
    expect(service.getContactContext).not.toHaveBeenCalled();
  });

  it("returns 400 for workspace injection through query or headers", async () => {
    const service = serviceResult(contactContextDto());
    const app = createContactContextApp({ service });

    const queryResponse = await app.request(
      `/api/leads/${leadId}/contact-context?workspaceId=${workspaceId}`,
      { headers: validSessionHeaders() },
    );
    const snakeQueryResponse = await app.request(
      `/api/leads/${leadId}/contact-context?workspace_id=${workspaceId}`,
      { headers: validSessionHeaders() },
    );
    const headerResponse = await app.request(`/api/leads/${leadId}/contact-context`, {
      headers: {
        ...validSessionHeaders(),
        "x-workspace-id": workspaceId,
      },
    });

    expect(queryResponse.status).toBe(400);
    expect(snakeQueryResponse.status).toBe(400);
    expect(headerResponse.status).toBe(400);
    expect(service.getContactContext).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin session", async () => {
    const service = serviceResult(contactContextDto());
    const app = createContactContextApp({
      service,
      user: {
        ...testUser,
        role: "operator",
      },
    });

    const response = await app.request(`/api/leads/${leadId}/contact-context`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: "Forbidden.",
      code: "ADMIN_REQUIRED",
    });
    expect(service.getContactContext).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown and cross-workspace leads", async () => {
    const unknownApp = createContactContextApp({ service: serviceResult(null) });
    const crossWorkspaceApp = createContactContextApp({
      service: serviceResult(contactContextDto()),
    });

    const unknownResponse = await unknownApp.request(`/api/leads/${leadId}/contact-context`, {
      headers: validSessionHeaders(),
    });
    const crossWorkspaceResponse = await crossWorkspaceApp.request(
      `/api/leads/${otherWorkspaceLeadId}/contact-context`,
      {
        headers: validSessionHeaders(),
      },
    );

    expect(unknownResponse.status).toBe(404);
    expect(crossWorkspaceResponse.status).toBe(404);
    expect(await unknownResponse.json()).toEqual({
      success: false,
      error: "Lead not found.",
      code: "LEAD_NOT_FOUND",
    });
  });

  it("returns the safe contact context envelope for the session workspace", async () => {
    const context = contactContextDto({
      previousLeadCount: 1,
      hasPriorContext: true,
      lastPriorLeadAt: "2026-05-12T12:00:00.000Z",
      warnings: ["repeated_inbound_recent"],
    });
    const service = serviceResult(context);
    const app = createContactContextApp({ service });

    const response = await app.request(`/api/leads/${leadId}/contact-context`, {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: context,
    });
    expect(service.getContactContext).toHaveBeenCalledWith(workspaceId, leadId);
  });

  it("does not allow Bearer or public API-key access", async () => {
    const service = serviceResult(contactContextDto());
    const app = createContactContextApp({ service });

    const response = await app.request(`/api/leads/${leadId}/contact-context`, {
      headers: {
        authorization: "Bearer syr_live_public_test",
      },
    });

    expect(response.status).toBe(401);
    expect(service.getContactContext).not.toHaveBeenCalled();
  });

  it("does not import providers, AI, workers, activity writers, migrations, or unsafe DTO fields", () => {
    const route = readFileSync("src/routes/leads.ts", "utf8");
    const service = readFileSync("src/services/lead-contact-context.ts", "utf8");
    const repository = readFileSync("src/repositories/lead-contact-context.ts", "utf8");
    const combined = [route, service, repository].join("\n");

    for (const forbidden of [
      "ai-provider",
      "openai",
      "google-sheets",
      "resend",
      "worker",
      "createActivityLog",
      "enqueue",
      "providerMessageId",
      "provider_message_id",
      "leadScores",
      "rawOutput",
      "prompt",
    ]) {
      expect(combined).not.toContain(forbidden);
    }
  });
});
