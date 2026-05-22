import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import type { AuthMe, ClientResponsePolicyInput } from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createClientConfigResponsePolicyRoutes } from "../routes/client/config-response-policy.js";
import type { AuthService } from "../services/auth.js";
import type { ClientResponsePolicyService } from "../services/client-response-policy.js";
import { testUser, validSessionToken } from "./mocks/auth.js";

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

function storedPolicy(overrides: Partial<ClientResponsePolicyInput> = {}) {
  return {
    language: "fr" as const,
    tone: "warm" as const,
    customToneNotes: "Répondre clairement.",
    signature: "L'équipe Acme",
    defaultGreeting: "Bonjour,",
    defaultClosing: "Bien cordialement,",
    responseStructure: ["Accuser réception", "Proposer la prochaine étape"],
    businessRules: ["Confirmer les créneaux avant de promettre une intervention."],
    forbiddenClaims: ["Ne pas garantir un prix exact avant qualification."],
    escalationRules: ["Transférer les réclamations à un humain."],
    offerNotes: ["Mettre en avant le diagnostic."],
    catalogSummary: "Chauffage et plomberie.",
    exampleReplies: [{ label: "Devis", bodyText: "Bonjour, merci pour votre demande." }],
    ...overrides,
    updatedAt: "2026-05-22T10:00:00.000Z",
    status: "configured" as const,
  };
}

function validClientInput(overrides: Record<string, unknown> = {}) {
  return {
    language: "fr",
    tone: "warm",
    customToneNotes: "Répondre clairement.",
    defaultGreeting: "Bonjour,",
    defaultClosing: "Bien cordialement,",
    signature: "L'équipe Acme",
    structureLines: ["Accuser réception", "Proposer la prochaine étape"],
    businessRules: ["Confirmer les créneaux avant de promettre une intervention."],
    forbiddenClaims: ["Ne pas garantir un prix exact avant qualification."],
    escalationRules: ["Transférer les réclamations à un humain."],
    offerNotes: ["Mettre en avant le diagnostic."],
    catalogSummary: "Chauffage et plomberie.",
    exampleReplies: [{ label: "Devis", body: "Bonjour, merci pour votre demande." }],
    ...overrides,
  };
}

function routeService() {
  return {
    getClientResponsePolicy: vi.fn(async () =>
      storedPolicy({
        // Extra fields must never leak through the dedicated client DTO.
        workspaceId: "forbidden-workspace",
        rawMetadata: { hidden: true },
        providerMessageId: "forbidden-provider",
        prompt: "forbidden-prompt",
        output: "forbidden-output",
        apiKey: "forbidden-key",
        token: "forbidden-token",
        secret: "forbidden-secret",
      } as Partial<ClientResponsePolicyInput>),
    ),
    putClientResponsePolicy: vi.fn(
      async (_workspaceId: string, _actorUserId: string, input: ClientResponsePolicyInput) => ({
        policy: storedPolicy(input),
        created: false,
        changedFields: ["tone"],
      }),
    ),
  } satisfies ClientResponsePolicyService;
}

function createTestApp(user: AuthMe = { ...testUser, role: "client" }, service = routeService()) {
  const app = new Hono();
  app.route(
    "/api/client/config/response-policy",
    createClientConfigResponsePolicyRoutes({
      authService: authServiceFor(user),
      clientResponsePolicyService: service,
    }),
  );

  return { app, service };
}

describe("client config response policy route", () => {
  it("returns 401 without session for GET and PUT", async () => {
    const { app, service } = createTestApp();

    const get = await app.request("/api/client/config/response-policy");
    const put = await app.request("/api/client/config/response-policy", {
      method: "PUT",
      body: JSON.stringify(validClientInput()),
    });

    expect(get.status).toBe(401);
    expect(put.status).toBe(401);
    expect(service.getClientResponsePolicy).not.toHaveBeenCalled();
    expect(service.putClientResponsePolicy).not.toHaveBeenCalled();
  });

  it("allows client, admin, and founder sessions to GET the client-safe config", async () => {
    for (const role of ["client", "admin", "founder"] as const) {
      const { app, service } = createTestApp({ ...testUser, role });

      const response = await app.request("/api/client/config/response-policy", {
        headers: validSessionHeaders(),
      });

      expect(response.status).toBe(200);
      expect(service.getClientResponsePolicy).toHaveBeenCalledWith(testUser.workspaceId);
      expect(await response.json()).toMatchObject({
        success: true,
        data: {
          policy: {
            configured: true,
            structureLines: ["Accuser réception", "Proposer la prochaine étape"],
            exampleReplies: [{ label: "Devis", body: "Bonjour, merci pour votre demande." }],
          },
        },
      });
    }
  });

  it("blocks operator sessions", async () => {
    const { app, service } = createTestApp({ ...testUser, role: "operator" });

    const response = await app.request("/api/client/config/response-policy", {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(403);
    expect(service.getClientResponsePolicy).not.toHaveBeenCalled();
  });

  it("lets a client PUT a full valid object through the existing service", async () => {
    const { app, service } = createTestApp();

    const response = await app.request("/api/client/config/response-policy", {
      method: "PUT",
      headers: validSessionHeaders(),
      body: JSON.stringify(validClientInput({ tone: "premium" })),
    });

    expect(response.status).toBe(200);
    expect(service.putClientResponsePolicy).toHaveBeenCalledWith(
      testUser.workspaceId,
      testUser.id,
      expect.objectContaining({
        tone: "premium",
        responseStructure: ["Accuser réception", "Proposer la prochaine étape"],
        exampleReplies: [{ label: "Devis", bodyText: "Bonjour, merci pour votre demande." }],
      }),
    );
  });

  it("rejects workspace identity, unknown fields, and forbidden client fields", async () => {
    for (const input of [
      validClientInput({ workspaceId: testUser.workspaceId }),
      validClientInput({ unexpected: true }),
      validClientInput({ role: "admin" }),
      validClientInput({ apiKey: "hidden" }),
      validClientInput({ token: "hidden" }),
      validClientInput({ secret: "hidden" }),
      validClientInput({ prompt: "hidden" }),
      validClientInput({ output: "hidden" }),
      validClientInput({ providerId: "hidden" }),
    ]) {
      const { app, service } = createTestApp();
      const response = await app.request("/api/client/config/response-policy", {
        method: "PUT",
        headers: validSessionHeaders(),
        body: JSON.stringify(input),
      });

      expect(response.status).toBe(400);
      expect(service.putClientResponsePolicy).not.toHaveBeenCalled();
    }
  });

  it("rejects workspace identity from query or headers", async () => {
    for (const request of [
      createTestApp().app.request("/api/client/config/response-policy?workspaceId=bad", {
        headers: validSessionHeaders(),
      }),
      createTestApp().app.request("/api/client/config/response-policy", {
        headers: validSessionHeaders({ "x-workspace-id": testUser.workspaceId }),
      }),
    ]) {
      const response = await request;
      expect(response.status).toBe(400);
    }
  });

  it("enforces field lengths, array sizes, and example reply limits", async () => {
    for (const input of [
      validClientInput({ signature: "x".repeat(1001) }),
      validClientInput({ structureLines: Array.from({ length: 9 }, (_, index) => `line ${index}`) }),
      validClientInput({ businessRules: ["x".repeat(501)] }),
      validClientInput({
        exampleReplies: Array.from({ length: 6 }, (_, index) => ({
          label: `Example ${index}`,
          body: "Bonjour",
        })),
      }),
      validClientInput({ exampleReplies: [{ label: "Long", body: "x".repeat(1501) }] }),
    ]) {
      const { app, service } = createTestApp();
      const response = await app.request("/api/client/config/response-policy", {
        method: "PUT",
        headers: validSessionHeaders(),
        body: JSON.stringify(input),
      });

      expect(response.status).toBe(400);
      expect(service.putClientResponsePolicy).not.toHaveBeenCalled();
    }
  });

  it("never returns tenant, admin DTO, provider, or generation internals", async () => {
    const { app } = createTestApp();

    const response = await app.request("/api/client/config/response-policy", {
      headers: validSessionHeaders(),
    });

    expect(response.status).toBe(200);
    const serialized = JSON.stringify(await response.json());
    for (const forbidden of [
      "workspaceId",
      "rawMetadata",
      "providerMessageId",
      "prompt",
      "output",
      "apiKey",
      "token",
      "secret",
      "status",
      "responseStructure",
      "bodyText",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("does not import providers, workers, or outbound clients", () => {
    const source = readFileSync(
      new URL("../routes/client/config-response-policy.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/OpenRouter|fetch\(|Gmail|googleapis|Resend|worker/i);
  });
});
