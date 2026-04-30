import { describe, expect, it, vi } from "vitest";

describe("API app import safety", () => {
  it("imports the Hono app without DATABASE_URL", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;

    try {
      vi.resetModules();
      delete process.env.DATABASE_URL;

      const module = await import("../app.js");

      expect(module.app).toBeDefined();
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    }
  });
});
