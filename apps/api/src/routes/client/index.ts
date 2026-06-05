import { Hono } from "hono";

import { clientCockpitSummaryRoutes } from "./cockpit-summary.js";
import { clientConfigResponsePolicyRoutes } from "./config-response-policy.js";
import { clientDraftQueueRoutes } from "./draft-queue.js";
import { clientInboxRoutes } from "./inbox.js";
import { clientMailQueueRoutes } from "./mail-queue.js";
import { clientResponsePolicyRoutes } from "./response-policy.js";
import { clientResponseProfilesRoutes } from "./response-profiles.js";

export const clientRoutes = new Hono();

clientRoutes.route("/cockpit-summary", clientCockpitSummaryRoutes);
clientRoutes.route("/config/response-policy", clientConfigResponsePolicyRoutes);
clientRoutes.route("/draft-queue", clientDraftQueueRoutes);
clientRoutes.route("/inbox", clientInboxRoutes);
clientRoutes.route("/mail-queue", clientMailQueueRoutes);
clientRoutes.route("/response-policy", clientResponsePolicyRoutes);
clientRoutes.route("/config/response-profiles", clientResponseProfilesRoutes);
