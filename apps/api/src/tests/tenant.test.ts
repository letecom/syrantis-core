import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import { getCurrentUser, getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard } from "../middleware/tenant.js";
import { createAuthRoutes } from "../routes/auth.js";
import type { AuthService } from "../services/auth.js";
import type { AppEnv } from "../types/hono.js";
import { createFakeAuthService, testUser, validSessionToken } from "./mocks/auth.js";

function createGuardTestApp(authService: AuthService): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use("/protected/*", createTenantGuard(authService));
  app.get("/protected/context", (c) => {
    const currentUser = getCurrentUser(c);

    return c.json({
      success: true,
      data: {
        currentUser,
        userId: c.get("userId"),
        workspaceId: getWorkspaceId(c)
      }
    });
  });

  return app;
}

function createAuthTestApp(authService: AuthService): Hono {
  const app = new Hono();
  app.route("/auth", createAuthRoutes({ authService }));
  return app;
}

describe("tenantGuard", () => {
  it("returns 401 without cookie", async () => {
    const authService = createFakeAuthService();
    const app = createGuardTestApp(authService);

    const response = await app.request("/protected/context");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "NO_SESSION"
    });
    expect(authService.getCurrentUser).not.toHaveBeenCalled();
  });

  it("returns 401 with invalid cookie and clears cookie", async () => {
    const authService = createFakeAuthService();
    const app = createGuardTestApp(authService);

    const response = await app.request("/protected/context", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=invalid-token`
      }
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "INVALID_SESSION"
    });
    expect(authService.getCurrentUser).toHaveBeenCalledWith("invalid-token");

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
  });

  it("sets currentUser, userId, and workspaceId for valid cookie", async () => {
    const authService = createFakeAuthService();
    const app = createGuardTestApp(authService);

    const response = await app.request("/protected/context", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`
      }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        currentUser: testUser,
        userId: testUser.id,
        workspaceId: testUser.workspaceId
      }
    });
    expect(authService.getCurrentUser).toHaveBeenCalledWith(validSessionToken);
  });
});

describe("auth session-check route", () => {
  it("returns 401 without cookie", async () => {
    const authService = createFakeAuthService();
    const app = createAuthTestApp(authService);

    const response = await app.request("/auth/session-check");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: "Unauthorized.",
      code: "NO_SESSION"
    });
  });

  it("returns userId and workspaceId with valid cookie", async () => {
    const authService = createFakeAuthService();
    const app = createAuthTestApp(authService);

    const response = await app.request("/auth/session-check", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${validSessionToken}`
      }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        userId: testUser.id,
        workspaceId: testUser.workspaceId
      }
    });
  });
});
