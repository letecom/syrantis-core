import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runMigrateCli } from "./migrate-cli.js";
import type { MigrationFileVerificationResult } from "./verify-migration-files/types.js";

const successResult: MigrationFileVerificationResult = {
  success: true,
  checkedSqlFiles: 1,
  checkedJournalEntries: 1,
  drift: []
};

const driftResult: MigrationFileVerificationResult = {
  success: false,
  checkedSqlFiles: 1,
  checkedJournalEntries: 0,
  drift: [
    {
      kind: "sql_without_journal",
      tag: "0000_init",
      filename: "0000_init.sql"
    }
  ]
};

describe("migrate cli preflight", () => {
  it("calls the migration file guard before Drizzle migrate", async () => {
    const calls: string[] = [];
    const originalLog = console.log;
    console.log = () => undefined;

    try {
      const exitCode = await runMigrateCli({
        verifyMigrationFiles: async () => {
          calls.push("guard");
          return successResult;
        },
        runMigrations: async () => {
          calls.push("migrate");
          return {
            ok: true,
            migrationsFolder: "/tmp/migrations"
          };
        }
      });

      assert.equal(exitCode, 0);
      assert.deepEqual(calls, ["guard", "migrate"]);
    } finally {
      console.log = originalLog;
    }
  });

  it("does not call Drizzle migrate when the guard fails", async () => {
    const calls: string[] = [];
    const originalLog = console.log;
    console.log = () => undefined;

    try {
      const exitCode = await runMigrateCli({
        verifyMigrationFiles: async () => {
          calls.push("guard");
          return driftResult;
        },
        runMigrations: async () => {
          calls.push("migrate");
          return {
            ok: true,
            migrationsFolder: "/tmp/migrations"
          };
        }
      });

      assert.equal(exitCode, 1);
      assert.deepEqual(calls, ["guard"]);
    } finally {
      console.log = originalLog;
    }
  });
});
