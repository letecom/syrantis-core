import { Hono } from "hono";
import { authRoutes } from "./auth.js";
import { healthRoutes } from "./health.js";
import { taskRoutes } from "./tasks.js";

export const routes = new Hono();

routes.route("/", healthRoutes);
routes.route("/api", healthRoutes);
routes.route("/api/tasks", taskRoutes);
routes.route("/auth", authRoutes);
