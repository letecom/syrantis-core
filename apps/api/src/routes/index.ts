import { Hono } from "hono";
import { authRoutes } from "./auth.js";
import { healthRoutes } from "./health.js";

export const routes = new Hono();

routes.route("/", healthRoutes);
routes.route("/api", healthRoutes);
routes.route("/auth", authRoutes);
