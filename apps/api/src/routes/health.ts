import { Hono } from "hono";
import { healthResponseSchema } from "@syrantis/shared";

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) => {
  const payload = healthResponseSchema.parse({
    status: "ok",
    service: "syrantis-api",
    timestamp: new Date().toISOString(),
    version: "0.1.0"
  });

  return c.json(payload);
});
