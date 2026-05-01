import { Hono } from "hono";
import { activityLogRoutes } from "./activity-logs.js";
import { approvalRoutes } from "./approvals.js";
import { authRoutes } from "./auth.js";
import { contactRoutes } from "./contacts.js";
import { healthRoutes } from "./health.js";
import { leadRoutes } from "./leads.js";
import { organizationRoutes } from "./organizations.js";
import { taskRoutes } from "./tasks.js";

export const routes = new Hono();

routes.route("/", healthRoutes);
routes.route("/api", healthRoutes);
routes.route("/api/activity-logs", activityLogRoutes);
routes.route("/api/approvals", approvalRoutes);
routes.route("/api/contacts", contactRoutes);
routes.route("/api/leads", leadRoutes);
routes.route("/api/organizations", organizationRoutes);
routes.route("/api/tasks", taskRoutes);
routes.route("/auth", authRoutes);
