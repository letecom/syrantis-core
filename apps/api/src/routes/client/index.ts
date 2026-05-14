import { Hono } from "hono";

import { clientCockpitSummaryRoutes } from "./cockpit-summary.js";

export const clientRoutes = new Hono();

clientRoutes.route("/cockpit-summary", clientCockpitSummaryRoutes);
