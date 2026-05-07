import { Hono } from "hono";

import {
  ApiErrorSchema,
  EmailSendListQuerySchema,
  EmailSendListSuccessSchema,
  EmailSendPushbackReplaySuccessSchema,
  EmailSendSuccessSchema,
  PushbackStatusSuccessSchema,
  forbidden,
} from "@syrantis/shared";

import { getWorkspaceId } from "../lib/tenant.js";
import { createTenantGuard, tenantGuard } from "../middleware/tenant.js";
import type { AuthService } from "../services/auth.js";
import {
  createProductionEmailSendService,
  type EmailSendService,
} from "../services/email-sends.js";
import {
  createProductionEmailSendPushbackReplayService,
  type EmailSendPushbackReplayService,
} from "../services/email-send-pushback-replay.js";
import {
  createProductionPushbackStatusService,
  type PushbackStatusService,
} from "../services/pushback-status.js";
import type { AppEnv } from "../types/hono.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const invalidRequestResponse = ApiErrorSchema.parse({
  success: false,
  error: "Invalid request.",
  code: "INVALID_REQUEST",
});

const emailSendNotFoundResponse = ApiErrorSchema.parse({
  success: false,
  error: "Email send not found.",
  code: "EMAIL_SEND_NOT_FOUND",
});

export type EmailSendRoutesDependencies = {
  authService?: AuthService;
  emailSendService?: EmailSendService;
  pushbackReplayService?: EmailSendPushbackReplayService;
  pushbackStatusService?: PushbackStatusService;
};

function hasClientWorkspaceId(value: unknown): boolean {
  return typeof value === "object" && value !== null && "workspaceId" in value;
}

function parseId(value: string): string | null {
  return uuidPattern.test(value) ? value : null;
}

function isAdminRole(role: string): boolean {
  return role === "admin" || role === "founder";
}

export function createEmailSendRoutes(dependencies: EmailSendRoutesDependencies = {}) {
  const routes = new Hono<AppEnv>();
  const guard = dependencies.authService
    ? createTenantGuard(dependencies.authService)
    : tenantGuard;
  const emailSendService = dependencies.emailSendService ?? createProductionEmailSendService();
  const pushbackReplayService =
    dependencies.pushbackReplayService ?? createProductionEmailSendPushbackReplayService();
  const pushbackStatusService =
    dependencies.pushbackStatusService ?? createProductionPushbackStatusService();

  routes.use("*", guard);

  routes.get("/", async (c) => {
    const query = c.req.query();

    if (hasClientWorkspaceId(query)) {
      return c.json(invalidRequestResponse, 400);
    }

    const parsedQuery = EmailSendListQuerySchema.safeParse(query);

    if (!parsedQuery.success) {
      return c.json(invalidRequestResponse, 400);
    }

    const emailSends = await emailSendService.listEmailSends(getWorkspaceId(c), parsedQuery.data);

    return c.json(
      EmailSendListSuccessSchema.parse({
        success: true,
        data: emailSends,
      }),
    );
  });

  routes.get("/:id", async (c) => {
    const emailSendId = parseId(c.req.param("id"));

    if (!emailSendId || hasClientWorkspaceId(c.req.query())) {
      return c.json(invalidRequestResponse, 400);
    }

    const emailSend = await emailSendService.getEmailSend(getWorkspaceId(c), emailSendId);

    if (!emailSend) {
      return c.json(emailSendNotFoundResponse, 404);
    }

    return c.json(
      EmailSendSuccessSchema.parse({
        success: true,
        data: emailSend,
      }),
    );
  });

  routes.get("/:id/pushback-status", async (c) => {
    const emailSendId = parseId(c.req.param("id"));

    if (!emailSendId || hasClientWorkspaceId(c.req.query())) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const result = await pushbackStatusService.getEmailSendPushbackStatus(
      getWorkspaceId(c),
      emailSendId,
    );

    if (result.result === "not_found") {
      return c.json(emailSendNotFoundResponse, 404);
    }

    return c.json(
      PushbackStatusSuccessSchema.parse({
        success: true,
        data: result.status,
      }),
    );
  });

  routes.post("/:id/pushback-replay", async (c) => {
    const emailSendId = parseId(c.req.param("id"));

    if (!emailSendId || hasClientWorkspaceId(c.req.query())) {
      return c.json(invalidRequestResponse, 400);
    }

    if (!isAdminRole(c.get("currentUser").role)) {
      return c.json(forbidden("ADMIN_REQUIRED"), 403);
    }

    const result = await pushbackReplayService.replayPushback(getWorkspaceId(c), emailSendId);

    if (!result) {
      return c.json(emailSendNotFoundResponse, 404);
    }

    return c.json(
      EmailSendPushbackReplaySuccessSchema.parse({
        success: true,
        data: {
          emailSendId,
          result: result.result,
          diagnosticTraceId: result.diagnosticTraceId,
          ...(result.result === "succeeded" ? {} : { errorCode: result.errorCode }),
        },
      }),
    );
  });

  return routes;
}

export const emailSendRoutes = createEmailSendRoutes();
