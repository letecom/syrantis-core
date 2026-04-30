import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";

import { AuthErrorSchema, AuthSuccessSchema, LoginInputSchema } from "@syrantis/shared";

import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS
} from "../lib/session-token.js";
import type { AuthService } from "../services/auth.js";
import { createProductionAuthService } from "../services/auth.js";

const unauthorizedResponse = AuthErrorSchema.parse({
  success: false,
  error: "Unauthorized.",
  code: "AUTH_UNAUTHORIZED"
});

const invalidCredentialsResponse = AuthErrorSchema.parse({
  success: false,
  error: "Invalid credentials.",
  code: "AUTH_INVALID_CREDENTIALS"
});

export type AuthRoutesDependencies = {
  authService?: AuthService;
};

function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "Strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  };
}

export function createAuthRoutes(dependencies: AuthRoutesDependencies = {}) {
  const authRoutes = new Hono();
  const authService = dependencies.authService ?? createProductionAuthService();

  authRoutes.post("/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = LoginInputSchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(invalidCredentialsResponse, 401);
    }

    const result = await authService.login(parsedBody.data.email, parsedBody.data.password);

    if (!result) {
      return c.json(invalidCredentialsResponse, 401);
    }

    setCookie(c, SESSION_COOKIE_NAME, result.token, getCookieOptions());

    return c.json(
      AuthSuccessSchema.parse({
        success: true,
        data: result.user
      })
    );
  });

  authRoutes.get("/me", async (c) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);

    if (!token) {
      return c.json(unauthorizedResponse, 401);
    }

    const user = await authService.getCurrentUser(token);

    if (!user) {
      return c.json(unauthorizedResponse, 401);
    }

    return c.json(
      AuthSuccessSchema.parse({
        success: true,
        data: user
      })
    );
  });

  authRoutes.post("/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);

    if (token) {
      await authService.logout(token);
    }

    deleteCookie(c, SESSION_COOKIE_NAME, {
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict"
    });

    return c.json({ success: true });
  });

  return authRoutes;
}

export const authRoutes = createAuthRoutes();
