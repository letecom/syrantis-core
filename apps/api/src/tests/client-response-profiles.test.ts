import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import type {
  AuthMe,
  ClientResponseProfileCreate,
  ClientResponseProfileUpdate,
} from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createClientResponseProfilesRoutes } from "../routes/client/response-profiles.js";
import type { WorkspaceResponseProfileRow } from "../repositories/client-response-profiles.js";
import type { AuthService } from "../services/auth.js";
import type { ClientResponseProfilesService } from "../services/client-response-profiles.js";
import { testUser, validSessionToken } from "./mocks/auth.js";

const otherWorkspaceId = "99999999-9999-4999-8999-999999999999";
const firstProfileId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const secondProfileId = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

function validSessionHeaders(extra: Record<string, string> = {}) {
  return {
    cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`,
    "content-type": "application/json",
    ...extra,
  };
}

function authServiceFor(user: AuthMe): AuthService {
  return {
    login: vi.fn(async () => null),
    getCurrentUser: vi.fn(async (token: string) => (token === validSessionToken ? user : null)),
    logout: vi.fn(async () => undefined),
  };
}

function validProfileInput(overrides: Record<string, unknown> = {}): ClientResponseProfileCreate {
  return {
    name: "Léa SAV",
    senderName: "Léa",
    roleLabel: "SAV",
    description: "Demandes de suivi.",
    tone: "empathetic",
    styleNotes: "Répondre avec calme.",
    authorityLevel: "standard",
    appliesToCategories: ["sav"],
    specificRules: ["Confirmer le dossier."],
    escalationRules: ["Escalader les litiges."],
    forbiddenClaims: ["Ne pas promettre de remise."],
    isDefault: false,
    sortOrder: 0,
    ...overrides,
  };
}

function rowFromInput(input: {
  id: string;
  workspaceId: string;
  profile: ClientResponseProfileCreate | ClientResponseProfileUpdate;
  isDefault: boolean;
  isActive?: boolean;
}): WorkspaceResponseProfileRow {
  const now = new Date("2026-05-22T10:00:00.000Z");
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    name: input.profile.name,
    senderName: input.profile.senderName,
    roleLabel: input.profile.roleLabel,
    description: input.profile.description ?? null,
    tone: input.profile.tone,
    styleNotes: input.profile.styleNotes ?? null,
    authorityLevel: input.profile.authorityLevel,
    appliesToCategories: input.profile.appliesToCategories,
    specificRules: input.profile.specificRules,
    escalationRules: input.profile.escalationRules,
    forbiddenClaims: input.profile.forbiddenClaims,
    isDefault: input.isDefault,
    isActive: input.isActive ?? true,
    sortOrder: input.profile.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now,
  };
}

function createInMemoryService(
  initialProfiles: WorkspaceResponseProfileRow[] = [],
): ClientResponseProfilesService & {
  profiles: WorkspaceResponseProfileRow[];
  calls: { workspaceId: string; actorUserId?: string; action: string }[];
} {
  const state = {
    profiles: [...initialProfiles],
    calls: [] as { workspaceId: string; actorUserId?: string; action: string }[],
  };

  return {
    get profiles() {
      return state.profiles;
    },
    get calls() {
      return state.calls;
    },
    async listProfiles(workspaceId) {
      state.calls.push({ workspaceId, action: "list" });
      return state.profiles
        .filter((profile) => profile.workspaceId === workspaceId && profile.isActive)
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder || left.createdAt.getTime() - right.createdAt.getTime(),
        );
    },
    async createProfile(workspaceId, actorUserId, input) {
      state.calls.push({ workspaceId, actorUserId, action: "create" });
      const isDefault =
        input.isDefault === true ||
        !state.profiles.some(
          (profile) => profile.workspaceId === workspaceId && profile.isActive && profile.isDefault,
        );

      if (isDefault) {
        state.profiles = state.profiles.map((profile) =>
          profile.workspaceId === workspaceId && profile.isActive
            ? { ...profile, isDefault: false }
            : profile,
        );
      }

      const profile = rowFromInput({
        id: state.profiles.length === 0 ? firstProfileId : secondProfileId,
        workspaceId,
        profile: input,
        isDefault,
      });
      state.profiles.push(profile);
      return { profile, changedFields: ["name"] };
    },
    async updateProfile(workspaceId, actorUserId, id, input) {
      state.calls.push({ workspaceId, actorUserId, action: "update" });
      const existing = state.profiles.find(
        (profile) => profile.workspaceId === workspaceId && profile.id === id && profile.isActive,
      );

      if (!existing) {
        return { result: "not_found" };
      }

      if (input.isDefault) {
        state.profiles = state.profiles.map((profile) =>
          profile.workspaceId === workspaceId && profile.isActive
            ? { ...profile, isDefault: profile.id === id }
            : profile,
        );
      } else if (
        !state.profiles.some(
          (profile) =>
            profile.workspaceId === workspaceId &&
            profile.id !== id &&
            profile.isActive &&
            profile.isDefault,
        )
      ) {
        return { result: "conflict", code: "DEFAULT_PROFILE_REQUIRED" };
      }

      const updated = rowFromInput({
        id,
        workspaceId,
        profile: input,
        isDefault: input.isDefault,
      });
      state.profiles = state.profiles.map((profile) => (profile.id === id ? updated : profile));
      return { result: "success", profile: updated, changedFields: ["name"] };
    },
    async deactivateProfile(workspaceId, actorUserId, id) {
      state.calls.push({ workspaceId, actorUserId, action: "deactivate" });
      const existing = state.profiles.find(
        (profile) => profile.workspaceId === workspaceId && profile.id === id && profile.isActive,
      );

      if (!existing) {
        return { result: "not_found" };
      }

      const active = state.profiles.filter(
        (profile) => profile.workspaceId === workspaceId && profile.isActive,
      );

      if (existing.isDefault) {
        return { result: "conflict", code: "DEFAULT_PROFILE_DEACTIVATION_BLOCKED" };
      }

      if (active.length <= 1) {
        return { result: "conflict", code: "LAST_ACTIVE_PROFILE_DEACTIVATION_BLOCKED" };
      }

      const deactivated = { ...existing, isActive: false, isDefault: false };
      state.profiles = state.profiles.map((profile) => (profile.id === id ? deactivated : profile));
      return { result: "success", profile: deactivated, changedFields: ["isActive"] };
    },
  };
}

function createTestApp(
  user: AuthMe = { ...testUser, role: "client" },
  service = createInMemoryService(),
) {
  const app = new Hono();
  app.route(
    "/api/client/config/response-profiles",
    createClientResponseProfilesRoutes({
      authService: authServiceFor(user),
      clientResponseProfilesService: service,
    }),
  );

  return { app, service };
}

describe("client response profiles route", () => {
  it("returns 401 without session for GET, POST, PUT, and DELETE", async () => {
    const { app, service } = createTestApp();

    const get = await app.request("/api/client/config/response-profiles");
    const post = await app.request("/api/client/config/response-profiles", {
      method: "POST",
      body: JSON.stringify(validProfileInput()),
    });
    const put = await app.request(`/api/client/config/response-profiles/${firstProfileId}`, {
      method: "PUT",
      body: JSON.stringify(validProfileInput({ isDefault: true })),
    });
    const deletion = await app.request(`/api/client/config/response-profiles/${firstProfileId}`, {
      method: "DELETE",
    });

    expect(get.status).toBe(401);
    expect(post.status).toBe(401);
    expect(put.status).toBe(401);
    expect(deletion.status).toBe(401);
    expect(service.calls).toEqual([]);
  });

  it("allows client, admin, and founder sessions to list profiles", async () => {
    for (const role of ["client", "admin", "founder"] as const) {
      const service = createInMemoryService([
        rowFromInput({
          id: firstProfileId,
          workspaceId: testUser.workspaceId,
          profile: validProfileInput({ isDefault: true }),
          isDefault: true,
        }),
      ]);
      const { app } = createTestApp({ ...testUser, role }, service);

      const response = await app.request("/api/client/config/response-profiles", {
        headers: validSessionHeaders(),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        success: true,
        data: { profiles: [{ id: firstProfileId, name: "Léa SAV", isDefault: true }] },
      });
      expect(service.calls.at(-1)).toMatchObject({ workspaceId: testUser.workspaceId });
    }
  });

  it("blocks operator sessions", async () => {
    const { app, service } = createTestApp({ ...testUser, role: "operator" });

    const response = await app.request("/api/client/config/response-profiles", {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(403);
    expect(service.calls).toEqual([]);
  });

  it("creates the first profile as default and switches default on later create", async () => {
    const { app, service } = createTestApp();

    const first = await app.request("/api/client/config/response-profiles", {
      method: "POST",
      headers: validSessionHeaders(),
      body: JSON.stringify(validProfileInput({ isDefault: false })),
    });
    const second = await app.request("/api/client/config/response-profiles", {
      method: "POST",
      headers: validSessionHeaders(),
      body: JSON.stringify(validProfileInput({ name: "Paul Expérience client", isDefault: true })),
    });

    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ data: { profile: { isDefault: true } } });
    expect(second.status).toBe(201);
    expect(await second.json()).toMatchObject({
      data: { profile: { name: "Paul Expérience client", isDefault: true } },
    });
    expect(service.profiles.filter((profile) => profile.isDefault)).toHaveLength(1);
  });

  it("updates profiles and switches default transactionally through PUT", async () => {
    const service = createInMemoryService([
      rowFromInput({
        id: firstProfileId,
        workspaceId: testUser.workspaceId,
        profile: validProfileInput({ isDefault: true }),
        isDefault: true,
      }),
      rowFromInput({
        id: secondProfileId,
        workspaceId: testUser.workspaceId,
        profile: validProfileInput({ name: "Paul", isDefault: false, sortOrder: 1 }),
        isDefault: false,
      }),
    ]);
    const { app } = createTestApp(undefined, service);

    const response = await app.request(`/api/client/config/response-profiles/${secondProfileId}`, {
      method: "PUT",
      headers: validSessionHeaders(),
      body: JSON.stringify(validProfileInput({ name: "Paul Expérience client", isDefault: true })),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { profile: { id: secondProfileId, name: "Paul Expérience client", isDefault: true } },
    });
    expect(service.profiles.filter((profile) => profile.isDefault)).toHaveLength(1);
    expect(service.profiles.find((profile) => profile.id === firstProfileId)?.isDefault).toBe(false);
  });

  it("soft-deactivates non-default profiles and blocks default or last active deactivation", async () => {
    const service = createInMemoryService([
      rowFromInput({
        id: firstProfileId,
        workspaceId: testUser.workspaceId,
        profile: validProfileInput({ isDefault: true }),
        isDefault: true,
      }),
      rowFromInput({
        id: secondProfileId,
        workspaceId: testUser.workspaceId,
        profile: validProfileInput({ name: "Paul", isDefault: false, sortOrder: 1 }),
        isDefault: false,
      }),
    ]);
    const { app } = createTestApp(undefined, service);

    const defaultDelete = await app.request(`/api/client/config/response-profiles/${firstProfileId}`, {
      method: "DELETE",
      headers: validSessionHeaders(),
    });
    const nonDefaultDelete = await app.request(
      `/api/client/config/response-profiles/${secondProfileId}`,
      {
        method: "DELETE",
        headers: validSessionHeaders(),
      },
    );
    const lastActiveDelete = await app.request(
      `/api/client/config/response-profiles/${firstProfileId}`,
      {
        method: "DELETE",
        headers: validSessionHeaders(),
      },
    );
    const list = await app.request("/api/client/config/response-profiles", {
      headers: validSessionHeaders(),
    });
    const listBody = await list.json();

    expect(defaultDelete.status).toBe(409);
    expect(nonDefaultDelete.status).toBe(200);
    expect(lastActiveDelete.status).toBe(409);
    expect(listBody).toMatchObject({ data: { profiles: [{ id: firstProfileId }] } });
    expect(JSON.stringify(listBody)).not.toContain(secondProfileId);
  });

  it("returns 404 for missing or cross-workspace profile updates and deactivation", async () => {
    const service = createInMemoryService([
      rowFromInput({
        id: firstProfileId,
        workspaceId: otherWorkspaceId,
        profile: validProfileInput({ isDefault: true }),
        isDefault: true,
      }),
    ]);
    const { app } = createTestApp(undefined, service);

    const put = await app.request(`/api/client/config/response-profiles/${firstProfileId}`, {
      method: "PUT",
      headers: validSessionHeaders(),
      body: JSON.stringify(validProfileInput({ isDefault: true })),
    });
    const deletion = await app.request(`/api/client/config/response-profiles/${firstProfileId}`, {
      method: "DELETE",
      headers: validSessionHeaders(),
    });

    expect(put.status).toBe(404);
    expect(deletion.status).toBe(404);
  });

  it("rejects tenant input, forbidden fields, max lengths, and oversized arrays", async () => {
    const forbiddenInputs = [
      validProfileInput({ workspaceId: testUser.workspaceId }),
      validProfileInput({ prompt: "hidden" }),
      validProfileInput({ systemPrompt: "hidden" }),
      validProfileInput({ output: "hidden" }),
      validProfileInput({ providerId: "hidden" }),
      validProfileInput({ modelId: "hidden" }),
      validProfileInput({ apiKey: "hidden" }),
      validProfileInput({ token: "hidden" }),
      validProfileInput({ secret: "hidden" }),
      validProfileInput({ raw: { hidden: true } }),
      validProfileInput({ metadata: { hidden: true } }),
      validProfileInput({ name: "x".repeat(101) }),
      validProfileInput({ senderName: "x".repeat(101) }),
      validProfileInput({ roleLabel: "x".repeat(121) }),
      validProfileInput({ description: "x".repeat(501) }),
      validProfileInput({ styleNotes: "x".repeat(1001) }),
      validProfileInput({ appliesToCategories: Array.from({ length: 13 }, (_, index) => `c${index}`) }),
      validProfileInput({ specificRules: ["x".repeat(201)] }),
      validProfileInput({ escalationRules: [""] }),
      validProfileInput({ forbiddenClaims: [" "] }),
    ];

    for (const input of forbiddenInputs) {
      const { app, service } = createTestApp();
      const response = await app.request("/api/client/config/response-profiles", {
        method: "POST",
        headers: validSessionHeaders(),
        body: JSON.stringify(input),
      });

      expect(response.status).toBe(400);
      expect(service.calls).toEqual([]);
    }

    for (const request of [
      createTestApp().app.request("/api/client/config/response-profiles?workspaceId=bad", {
        headers: validSessionHeaders(),
      }),
      createTestApp().app.request("/api/client/config/response-profiles", {
        headers: validSessionHeaders({ "x-workspace-id": testUser.workspaceId }),
      }),
    ]) {
      expect((await request).status).toBe(400);
    }
  });

  it("never returns tenant, provider, generation, or raw material", async () => {
    const service = createInMemoryService([
      {
        ...rowFromInput({
          id: firstProfileId,
          workspaceId: testUser.workspaceId,
          profile: validProfileInput({ isDefault: true }),
          isDefault: true,
        }),
        providerId: "forbidden-provider",
        prompt: "forbidden-prompt",
        output: "forbidden-output",
        apiKey: "forbidden-key",
      } as WorkspaceResponseProfileRow,
    ]);
    const { app } = createTestApp(undefined, service);

    const response = await app.request("/api/client/config/response-profiles", {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    const serialized = JSON.stringify(await response.json());
    for (const forbidden of [
      "workspaceId",
      "providerId",
      "prompt",
      "output",
      "apiKey",
      "token",
      "secret",
      "metadata",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("does not import providers, workers, or outbound clients", () => {
    for (const path of [
      "../routes/client/response-profiles.ts",
      "../services/client-response-profiles.ts",
      "../repositories/client-response-profiles.ts",
    ]) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source).not.toMatch(/OpenRouter|fetch\(|Gmail|googleapis|Resend|worker/i);
    }
  });
});
