import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";

import type { AuthMe } from "@syrantis/shared";

import { SESSION_COOKIE_NAME } from "../lib/session-token.js";
import type { AuthService } from "../services/auth.js";
import { createProductionAuthService } from "../services/auth.js";

export type SessionVariables = {
  currentUser: AuthMe | null;
  userId: string | null;
  workspaceId: string | null;
};

export function createSessionMiddleware(authService: AuthService = createProductionAuthService()) {
  return createMiddleware<{ Variables: SessionVariables }>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    const currentUser = token ? await authService.getCurrentUser(token) : null;

    c.set("currentUser", currentUser);
    c.set("userId", currentUser?.id ?? null);
    c.set("workspaceId", currentUser?.workspaceId ?? null);

    await next();
  });
}
