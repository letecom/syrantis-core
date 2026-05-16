import { Hono } from "hono";

import { clientCockpitSummaryRoutes } from "./cockpit-summary.js";
import { clientDraftQueueRoutes } from "./draft-queue.js";
import { clientMailQueueRoutes } from "./mail-queue.js";
import { clientResponsePolicyRoutes } from "./response-policy.js";

export const clientRoutes = new Hono();

clientRoutes.route("/cockpit-summary", clientCockpitSummaryRoutes);
clientRoutes.route("/draft-queue", clientDraftQueueRoutes);
clientRoutes.route("/mail-queue", clientMailQueueRoutes);
clientRoutes.route("/response-policy", clientResponsePolicyRoutes);
