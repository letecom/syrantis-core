import { Hono } from "hono";
import { healthRoutes } from "./health";

export const routes = new Hono();

routes.route("/", healthRoutes);
routes.route("/api", healthRoutes);
