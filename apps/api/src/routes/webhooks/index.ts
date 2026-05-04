import { Hono } from "hono";

import { resendWebhookRoutes } from "./resend.js";

export const webhookRoutes = new Hono();

webhookRoutes.route("/resend", resendWebhookRoutes);
