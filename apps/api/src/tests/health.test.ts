import { describe, expect, it } from "vitest";

import { healthResponseSchema } from "@syrantis/shared";
import { app } from "../app.js";

describe("health routes", () => {
  it("returns a contract-valid root health response", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);

    const payload = healthResponseSchema.parse(await response.json());

    expect(payload.status).toBe("ok");
    expect(payload.service).toBe("syrantis-api");
    expect(payload.timestamp).toEqual(expect.any(String));
    expect(Date.parse(payload.timestamp)).not.toBeNaN();
    expect(payload.version).toEqual(expect.any(String));
    expect(payload.version.length).toBeGreaterThan(0);
  });

  it("accepts valid health payloads and rejects invalid status values", () => {
    const validPayload = {
      status: "ok",
      service: "syrantis-api",
      timestamp: new Date().toISOString(),
      version: "0.1.0"
    };

    expect(healthResponseSchema.safeParse(validPayload).success).toBe(true);
    expect(healthResponseSchema.safeParse({ ...validPayload, status: "error" }).success).toBe(false);
  });
});
