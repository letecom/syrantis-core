import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { columnInvariantSql, indexInvariantSql } from "./queries.js";
import { getInvariantKey, schemaInvariantRegistry } from "./registry.js";
import { getSchemaVerifyExitCode } from "./reporter.js";
import type { ColumnCatalogRow, SchemaCatalog } from "./types.js";
import { verifySchemaInvariants } from "./verifier.js";

function buildCatalog(input: { column?: ColumnCatalogRow | null; index?: boolean }): SchemaCatalog {
  return {
    findColumn: async () => input.column ?? null,
    hasIndex: async () => input.index ?? false
  };
}

describe("schema invariant registry", () => {
  it("uses unique invariant keys", () => {
    const keys = schemaInvariantRegistry.map(getInvariantKey);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("includes the 0015 scheduled_at column invariant", () => {
    assert.ok(
      schemaInvariantRegistry.some(
        (invariant) =>
          invariant.kind === "column" &&
          invariant.migration === "0015" &&
          invariant.table === "background_jobs" &&
          invariant.column === "scheduled_at" &&
          invariant.dataType === "timestamp with time zone" &&
          invariant.isNullable
      )
    );
  });

  it("includes the 0015 scheduled_at index invariant", () => {
    assert.ok(
      schemaInvariantRegistry.some(
        (invariant) =>
          invariant.kind === "index" &&
          invariant.migration === "0015" &&
          invariant.table === "background_jobs" &&
          invariant.indexName === "background_jobs_pending_send_email_scheduled_at_idx"
      )
    );
  });
});

describe("schema invariant verifier", () => {
  it("passes when catalog responses match", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: { dataType: "timestamp with time zone", isNullable: true },
        index: true
      }),
      schemaInvariantRegistry
    );

    assert.equal(result.success, true);
    assert.equal(result.checked, 2);
    assert.equal(result.passed.length, 2);
    assert.equal(result.failed.length, 0);
  });

  it("reports drift when the column is absent", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: null,
        index: true
      }),
      schemaInvariantRegistry
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: "0015",
      kind: "column",
      object: "background_jobs.scheduled_at",
      reason: "missing",
      expected: "timestamp with time zone",
      actual: null
    });
  });

  it("reports drift when the column type differs", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: { dataType: "timestamp without time zone", isNullable: true },
        index: true
      }),
      schemaInvariantRegistry
    );

    assert.equal(result.success, false);
    assert.equal(result.failed[0]?.reason, "data_type_mismatch");
    assert.equal(result.failed[0]?.actual, "timestamp without time zone");
  });

  it("reports drift when column nullability differs", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: { dataType: "timestamp with time zone", isNullable: false },
        index: true
      }),
      schemaInvariantRegistry
    );

    assert.equal(result.success, false);
    assert.equal(result.failed[0]?.reason, "nullability_mismatch");
    assert.equal(result.failed[0]?.actual, false);
  });

  it("reports drift when the index is absent", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: { dataType: "timestamp with time zone", isNullable: true },
        index: false
      }),
      schemaInvariantRegistry
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: "0015",
      kind: "index",
      object: "background_jobs_pending_send_email_scheduled_at_idx",
      reason: "missing",
      expected: true,
      actual: false
    });
  });

  it("returns a failing process summary on drift", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: null,
        index: false
      }),
      schemaInvariantRegistry
    );

    assert.equal(getSchemaVerifyExitCode(result), 1);
    assert.equal(result.checked, 2);
    assert.equal(result.failed.length, 2);
  });

  it("keeps verification SQL limited to PostgreSQL catalog metadata", () => {
    const combinedSql = `${columnInvariantSql}\n${indexInvariantSql}`;
    assert.match(combinedSql, /information_schema\.columns/);
    assert.match(combinedSql, /pg_indexes/);
    assert.doesNotMatch(
      combinedSql,
      /from\s+(drafts|leads|contacts|email_sends|approvals|activity_logs|ai_runs|lead_scores)\b/i
    );
  });
});
