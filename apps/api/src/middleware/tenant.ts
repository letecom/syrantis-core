import { deleteCookie, getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

import { unauthorized } from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import type { AuthService } from "../services/auth.js";
import { createProductionAuthService } from "../services/auth.js";
import type { AppEnv } from "../types/hono.js";

function deleteSessionCookie(c: Parameters<typeof deleteCookie>[0]) {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict"
  });
}

export function createTenantGuard(authService?: AuthService) {
  const resolvedAuthService = authService ?? createProductionAuthService();

  return createMiddleware<AppEnv>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);

    if (!token) {
      return c.json(unauthorized("NO_SESSION"), 401);
    }

    const user = await resolvedAuthService.getCurrentUser(token);

    if (!user) {
      deleteSessionCookie(c);
      return c.json(unauthorized("INVALID_SESSION"), 401);
    }

    c.set("currentUser", user);
    c.set("userId", user.id);
    c.set("workspaceId", user.workspaceId);

    await next();
  });
}

export const tenantGuard = createTenantGuard();
