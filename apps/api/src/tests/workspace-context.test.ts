import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { AuthMe, WorkspaceContextInput, WorkspaceContextProfile } from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createWorkspaceContextRoutes } from "../routes/workspace-context.js";
import type { AuthService } from "../services/auth.js";
import type {
  WorkspaceContextService,
  WorkspaceContextServicePutResult,
} from "../services/workspace-context.js";
import { testUser, validSessionToken } from "./mocks/auth.js";

const otherWorkspaceId = "00000000-0000-4000-8000-000000000099";
const createdAt = "2026-05-12T10:00:00.000Z";
const updatedAt = "2026-05-12T10:05:00.000Z";

type StoredWorkspaceContextProfile = WorkspaceContextProfile & {
  workspaceId: string;
  createdBy: string | null;
  updatedBy: string | null;
};

function uuidFromNumber(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function createFakeAuthService(user: AuthMe = testUser): AuthService {
  return {
    login: vi.fn(async () => ({ user, token: validSessionToken })),
    getCurrentUser: vi.fn(async (token: string) => (token === validSessionToken ? user : null)),
    logout: vi.fn(async () => undefined),
  };
}

function validInput(overrides: Partial<WorkspaceContextInput> = {}): WorkspaceContextInput {
  return {
    companyName: "Syrantis Demo",
    sector: "Plomberie",
    language: "fr",
    timezone: "Europe/Paris",
    companySummary: "Artisans chauffage et plomberie.",
    offers: [
      {
        name: "Depannage chaudiere",
        description: "Intervention rapide.",
        category: "Chauffage",
      },
    ],
    serviceAreas: [
      {
        region: "Ile-de-France",
        country: "FR",
        restrictions: null,
      },
    ],
    idealCustomerProfile: {
      industries: ["batiment"],
      companySize: "5-25",
      roles: ["dirigeant"],
      painPoints: ["retards devis"],
      description: "PME terrain.",
    },
    badFitSignals: [{ signal: "Projet hors zone", severity: "medium" }],
    qualificationRules: [{ rule: "Urgence claire", criteria: "Besoin date", weight: "important" }],
    commonObjections: [
      {
        objection: "Trop cher",
        suggestedResponse: "Mettre en avant la rapidite.",
      },
    ],
    proofPoints: [{ type: "statistic", content: "Temps de reponse moyen bas.", source: null }],
    tone: "Direct et professionnel.",
    ctaPreference: "Proposer un appel.",
    forbiddenClaims: ["Garantie absolue de resultat"],
    handoffRules: {
      requireHumanFor: ["Litige"],
      escalationContact: "ops@syrantis.test",
      autoRespondThreshold: "hot",
    },
    ...overrides,
  };
}

function safeProfile(profile: StoredWorkspaceContextProfile): WorkspaceContextProfile {
  const {
    workspaceId: _workspaceId,
    createdBy: _createdBy,
    updatedBy: _updatedBy,
    ...safe
  } = profile;
  void _workspaceId;
  void _createdBy;
  void _updatedBy;
  return safe;
}

function changedFields(
  existing: WorkspaceContextProfile,
  input: WorkspaceContextInput,
): Array<keyof WorkspaceContextInput> {
  const fields = Object.keys(input) as Array<keyof WorkspaceContextInput>;
  return fields.filter((field) => JSON.stringify(existing[field]) !== JSON.stringify(input[field]));
}

function createFakeWorkspaceContextService() {
  const profiles = new Map<string, StoredWorkspaceContextProfile>();
  const activityLogs: Array<{
    action: string;
    entityType: string;
    entityId: string;
    metadataJson: Record<string, unknown>;
  }> = [];
  let nextProfileId = 700;

  const service: WorkspaceContextService & {
    activityLogs: typeof activityLogs;
    storedProfiles: typeof profiles;
  } = {
    activityLogs,
    storedProfiles: profiles,
    getWorkspaceContext: vi.fn(async (workspaceId: string) => {
      const profile = [...profiles.values()].find((value) => value.workspaceId === workspaceId);
      return profile ? safeProfile(profile) : null;
    }),
    putWorkspaceContext: vi.fn(
      async (
        workspaceId: string,
        userId: string,
        input: WorkspaceContextInput,
      ): Promise<WorkspaceContextServicePutResult> => {
        const existing = [...profiles.values()].find((value) => value.workspaceId === workspaceId);

        if (!existing) {
          const profile: StoredWorkspaceContextProfile = {
            ...input,
            profileId: uuidFromNumber(nextProfileId),
            workspaceId,
            createdBy: userId,
            updatedBy: userId,
            createdAt,
            updatedAt: createdAt,
          };
          nextProfileId += 1;
          profiles.set(profile.profileId, profile);
          activityLogs.push({
            action: "workspace_context.created",
            entityType: "workspace_context_profile",
            entityId: profile.profileId,
            metadataJson: {
              profileId: profile.profileId,
              changedFields: ["*"],
              source: "admin_api",
            },
          });
          return { profile: safeProfile(profile), created: true, changedFields: ["*"] };
        }

        const changed = changedFields(existing, input);
        const profile: StoredWorkspaceContextProfile = {
          ...existing,
          ...input,
          updatedBy: userId,
          updatedAt,
        };
        profiles.set(profile.profileId, profile);
        activityLogs.push({
          action: "workspace_context.updated",
          entityType: "workspace_context_profile",
          entityId: profile.profileId,
          metadataJson: {
            profileId: profile.profileId,
            changedFields: changed,
            source: "admin_api",
          },
        });
        return { profile: safeProfile(profile), created: false, changedFields: changed };
      },
    ),
  };

  return service;
}

function createTestApp(
  authService: AuthService,
  workspaceContextService: WorkspaceContextService,
): Hono {
  const app = new Hono();
  app.route(
    "/api/workspace-context",
    createWorkspaceContextRoutes({
      authService,
      workspaceContextService,
    }),
  );
  return app;
}

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

async function putContext(app: Hono, body: unknown = validInput()) {
  return app.request("/api/workspace-context", {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
}

function expectSafeProfile(value: Record<string, unknown>) {
  expect(value).toHaveProperty("profileId");
  expect(value).not.toHaveProperty("workspaceId");
  expect(value).not.toHaveProperty("workspace_id");
  expect(value).not.toHaveProperty("createdBy");
  expect(value).not.toHaveProperty("updatedBy");
}

function expectNoContextValues(value: unknown) {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    testUser.workspaceId,
    "Syrantis Demo",
    "Plomberie",
    "Artisans chauffage et plomberie.",
    "Depannage chaudiere",
    "Direct et professionnel.",
    "Proposer un appel.",
    "Garantie absolue de resultat",
    "ops@syrantis.test",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

describe("workspace context routes", () => {
  it("returns 401 for GET and PUT without session", async () => {
    const app = createTestApp(createFakeAuthService(), createFakeWorkspaceContextService());

    const getResponse = await app.request("/api/workspace-context");
    const putResponse = await app.request("/api/workspace-context", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validInput()),
    });

    expect(getResponse.status).toBe(401);
    expect(putResponse.status).toBe(401);
  });

  it("forbids non-admin sessions", async () => {
    const app = createTestApp(
      createFakeAuthService({ ...testUser, role: "operator" }),
      createFakeWorkspaceContextService(),
    );

    const response = await app.request("/api/workspace-context", {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(403);
  });

  it("returns null when no context exists and does not create an activity log", async () => {
    const service = createFakeWorkspaceContextService();
    const app = createTestApp(createFakeAuthService(), service);

    const response = await app.request("/api/workspace-context", {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        profile: null,
      },
    });
    expect(service.activityLogs).toEqual([]);
  });

  it("creates a profile and returns it safely on GET", async () => {
    const service = createFakeWorkspaceContextService();
    const app = createTestApp(createFakeAuthService(), service);

    const putResponse = await putContext(app);
    const putJson = await putResponse.json();

    expect(putResponse.status).toBe(200);
    expectSafeProfile(putJson.data.profile);
    expect(putJson.data.profile.companyName).toBe("Syrantis Demo");
    expect(putJson.data.profile.offers).toHaveLength(1);

    const getResponse = await app.request("/api/workspace-context", {
      headers: validSessionHeaders(),
    });
    const getJson = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getJson.data.profile).toEqual(putJson.data.profile);
    expectSafeProfile(getJson.data.profile);
  });

  it("updates an existing profile in-place and records safe activity logs", async () => {
    const service = createFakeWorkspaceContextService();
    const app = createTestApp(createFakeAuthService(), service);

    const createResponse = await putContext(app);
    const createJson = await createResponse.json();
    const updateResponse = await putContext(
      app,
      validInput({
        sector: "Chauffage",
        tone: "Calme et precis.",
        offers: [
          {
            name: "Audit chauffage",
            description: null,
            category: "Conseil",
          },
        ],
      }),
    );
    const updateJson = await updateResponse.json();

    expect(updateResponse.status).toBe(200);
    expect(updateJson.data.profile.profileId).toBe(createJson.data.profile.profileId);
    expect(service.storedProfiles.size).toBe(1);
    expect(service.activityLogs.map((log) => log.action)).toEqual([
      "workspace_context.created",
      "workspace_context.updated",
    ]);
    expect(service.activityLogs[1]?.metadataJson).toEqual({
      profileId: createJson.data.profile.profileId,
      changedFields: ["sector", "offers", "tone"],
      source: "admin_api",
    });
    expectNoContextValues(service.activityLogs);
  });

  it("rejects unknown fields, oversized fields, too many items, and forbidden keys", async () => {
    const app = createTestApp(createFakeAuthService(), createFakeWorkspaceContextService());

    const unknownResponse = await putContext(app, { ...validInput(), unknownField: true });
    const oversizedCompanyResponse = await putContext(app, {
      ...validInput(),
      companyName: "x".repeat(121),
    });
    const tooManyOffersResponse = await putContext(app, {
      ...validInput(),
      offers: Array.from({ length: 21 }, (_, index) => ({ name: `Offer ${index}` })),
    });
    const oversizedNestedResponse = await putContext(app, {
      ...validInput(),
      offers: [{ name: "Offer", description: "x".repeat(701) }],
    });
    const forbiddenKeyResponse = await putContext(app, {
      ...validInput(),
      apiKey: "not-accepted",
    });

    expect(unknownResponse.status).toBe(400);
    expect(oversizedCompanyResponse.status).toBe(400);
    expect(tooManyOffersResponse.status).toBe(400);
    expect(oversizedNestedResponse.status).toBe(400);
    expect(forbiddenKeyResponse.status).toBe(400);
  });

  it("rejects total workspace context payloads larger than 50KB", async () => {
    const app = createTestApp(createFakeAuthService(), createFakeWorkspaceContextService());
    const largeInput = validInput({
      commonObjections: Array.from({ length: 20 }, (_, index) => ({
        objection: `Objection ${index} ${"x".repeat(480)}`,
        suggestedResponse: "y".repeat(1000),
      })),
      proofPoints: Array.from({ length: 20 }, () => ({
        type: "other",
        content: "z".repeat(1000),
        source: "s".repeat(300),
      })),
    });

    const response = await putContext(app, largeInput);

    expect(response.status).toBe(400);
  });

  it("keeps cross-workspace context invisible", async () => {
    const service = createFakeWorkspaceContextService();
    const app = createTestApp(createFakeAuthService(), service);

    service.storedProfiles.set("other", {
      ...validInput({ companyName: "Other Workspace" }),
      profileId: uuidFromNumber(999),
      workspaceId: otherWorkspaceId,
      createdBy: testUser.id,
      updatedBy: testUser.id,
      createdAt,
      updatedAt,
    });

    const response = await app.request("/api/workspace-context", {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        profile: null,
      },
    });
  });

  it("rejects workspace injection in body, query, and headers", async () => {
    const app = createTestApp(createFakeAuthService(), createFakeWorkspaceContextService());

    const bodyResponse = await putContext(app, {
      ...validInput(),
      workspaceId: testUser.workspaceId,
    });
    const queryResponse = await app.request(
      `/api/workspace-context?workspaceId=${testUser.workspaceId}`,
      {
        headers: validSessionHeaders(),
      },
    );
    const headerResponse = await app.request("/api/workspace-context", {
      headers: {
        ...validSessionHeaders(),
        "x-workspace-id": testUser.workspaceId,
      },
    });

    expect(bodyResponse.status).toBe(400);
    expect(queryResponse.status).toBe(400);
    expect(headerResponse.status).toBe(400);
  });

  it("does not allow Bearer/public API key access", async () => {
    const app = createTestApp(createFakeAuthService(), createFakeWorkspaceContextService());

    const response = await app.request("/api/workspace-context", {
      headers: {
        authorization: "Bearer syr_live_public_test",
      },
    });

    expect(response.status).toBe(401);
  });
});
