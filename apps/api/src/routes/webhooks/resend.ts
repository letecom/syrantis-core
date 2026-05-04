import { Hono } from "hono";

import {
  handleResendWebhookPayload,
  type ResendWebhookServiceResult,
} from "../../services/webhooks/resend-webhook.js";
import { verifyResendWebhookSignature } from "../../services/webhooks/resend-signature.js";

type ResendWebhookRouteDependencies = {
  webhookSecret?: string | undefined;
  handlePayload?: (payload: unknown) => Promise<ResendWebhookServiceResult>;
};

function hasClientWorkspaceHeader(headers: Headers): boolean {
  return Boolean(
    headers.get("workspaceid") ||
      headers.get("workspace-id") ||
      headers.get("workspace_id") ||
      headers.get("x-workspace-id"),
  );
}

function hasClientWorkspaceQuery(query: Record<string, string>): boolean {
  return Object.keys(query).some((key) => key === "workspaceId" || key === "workspace_id");
}

export function createResendWebhookRoutes(dependencies: ResendWebhookRouteDependencies = {}) {
  const routes = new Hono();
  const handlePayload = dependencies.handlePayload ?? handleResendWebhookPayload;

  routes.post("/", async (c) => {
    const webhookSecret = dependencies.webhookSecret ?? process.env.RESEND_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return c.json({ success: false, error: "WEBHOOK_NOT_CONFIGURED" }, 500);
    }

    const rawBody = await c.req.text();
    const verification = verifyResendWebhookSignature({
      secret: webhookSecret,
      rawBody,
      headers: {
        svixId: c.req.header("svix-id"),
        svixTimestamp: c.req.header("svix-timestamp"),
        svixSignature: c.req.header("svix-signature"),
      },
    });

    if (verification.result === "missing_headers") {
      return c.json({ success: false, error: "MISSING_WEBHOOK_HEADERS" }, 400);
    }

    if (verification.result === "invalid_signature") {
      return c.json({ success: false, error: "INVALID_SIGNATURE" }, 401);
    }

    if (verification.result === "invalid_payload") {
      return c.json({ success: false, error: "INVALID_PAYLOAD" }, 400);
    }

    if (hasClientWorkspaceHeader(c.req.raw.headers) || hasClientWorkspaceQuery(c.req.query())) {
      return c.json({ success: false, error: "INVALID_PAYLOAD" }, 400);
    }

    const result = await handlePayload(verification.payload);

    if (result.result === "invalid_payload") {
      return c.json({ success: false, error: "INVALID_PAYLOAD" }, 400);
    }

    if (result.result === "ignored") {
      return c.json({ success: true, ignored: true }, 200);
    }

    if (result.result === "unmatched") {
      return c.json({ success: true, unmatched: true }, 200);
    }

    if (result.result === "unchanged") {
      return c.json({ success: true, unchanged: true }, 200);
    }

    return c.json({ success: true }, 200);
  });

  return routes;
}

export const resendWebhookRoutes = createResendWebhookRoutes();
