import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { AuthMe } from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { createAuthRoutes } from "../routes/auth.js";
import type { AuthService } from "../services/auth.js";

const testUser: AuthMe = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "founder@syrantis.test",
  name: "Founder",
  role: "admin",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  workspaceName: "Syrantis Internal"
};

function createTestApp(authService: AuthService): Hono {
  const app = new Hono();
  app.route("/auth", createAuthRoutes({ authService }));
  return app;
}

function createFakeAuthService(): AuthService {
  const validToken = "test-session-token";

  return {
    login: vi.fn(async (email: string, password: string) => {
      if (email.trim().toLowerCase() !== testUser.email || password !== "valid-password") {
        return null;
      }

      return {
        user: testUser,
        token: validToken
      };
    }),
    getCurrentUser: vi.fn(async (token: string) => (token === validToken ? testUser : null)),
    logout: vi.fn(async () => undefined)
  };
}

describe("auth routes", () => {
  it("rejects invalid credentials with 401", async () => {
    const authService = createFakeAuthService();
    const app = createTestApp(authService);

    const response = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: testUser.email,
        password: "wrong-password"
      })
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Invalid credentials.",
      code: "AUTH_INVALID_CREDENTIALS"
    });
  });

  it("accepts valid credentials and sets the session cookie", async () => {
    const authService = createFakeAuthService();
    const app = createTestApp(authService);

    const response = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: " Founder@Syrantis.Test ",
        password: "valid-password"
      })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: testUser
    });

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=test-session-token`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
  });

  it("returns 401 from me without a session cookie", async () => {
    const authService = createFakeAuthService();
    const app = createTestApp(authService);

    const response = await app.request("/auth/me");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "AUTH_UNAUTHORIZED"
    });
  });

  it("returns the current user with a valid session cookie", async () => {
    const authService = createFakeAuthService();
    const app = createTestApp(authService);

    const response = await app.request("/auth/me", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=test-session-token`
      }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: testUser
    });
  });

  it("clears the session cookie on logout", async () => {
    const authService = createFakeAuthService();
    const app = createTestApp(authService);

    const response = await app.request("/auth/logout", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=test-session-token`
      }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
    expect(authService.logout).toHaveBeenCalledWith("test-session-token");
  });

  it("imports the API app without DATABASE_URL", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;

    try {
      vi.resetModules();
      delete process.env.DATABASE_URL;

      const module = await import("../app.js");

      expect(module.app).toBeDefined();
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });
});
