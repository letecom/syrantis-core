import { Hono } from "hono";
import { healthRoutes } from "./health.js";

export const routes = new Hono();

routes.route("/", healthRoutes);
routes.route("/api", healthRoutes);
