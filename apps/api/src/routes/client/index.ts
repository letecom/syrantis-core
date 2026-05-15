import { Hono } from "hono";

import { clientCockpitSummaryRoutes } from "./cockpit-summary.js";
import { clientDraftQueueRoutes } from "./draft-queue.js";

export const clientRoutes = new Hono();

clientRoutes.route("/cockpit-summary", clientCockpitSummaryRoutes);
clientRoutes.route("/draft-queue", clientDraftQueueRoutes);
