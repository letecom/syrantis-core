import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkConstraintInvariantSql, columnInvariantSql, indexInvariantSql } from "./queries.js";
import { getInvariantKey, schemaInvariantRegistry } from "./registry.js";
import { getSchemaVerifyExitCode } from "./reporter.js";
import type { ColumnCatalogRow, SchemaCatalog } from "./types.js";
import { verifySchemaInvariants } from "./verifier.js";

function buildCatalog(input: {
  column?: ColumnCatalogRow | null;
  index?: boolean | Record<string, boolean>;
  checkConstraint?: boolean | Record<string, boolean>;
}): SchemaCatalog {
  return {
    findColumn: async () => input.column ?? null,
    hasIndex: async ({ indexName }) =>
      typeof input.index === "object" ? (input.index[indexName] ?? false) : (input.index ?? false),
    hasCheckConstraint: async ({ constraintName }) =>
      typeof input.checkConstraint === "object"
        ? (input.checkConstraint[constraintName] ?? false)
        : (input.checkConstraint ?? false)
  };
}

const allCheckConstraints = {
  email_sends_sent_requires_sent_at: true,
  email_sends_failed_requires_failed_at: true,
  email_sends_failed_requires_last_error_code: true
};

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

  it("includes all 0016 email_sends proof invariants", () => {
    assert.ok(
      schemaInvariantRegistry.some(
        (invariant) =>
          invariant.kind === "index" &&
          invariant.migration === "0016" &&
          invariant.table === "email_sends" &&
          invariant.indexName === "email_sends_provider_message_id_unique_idx"
      )
    );

    for (const constraintName of Object.keys(allCheckConstraints)) {
      assert.ok(
        schemaInvariantRegistry.some(
          (invariant) =>
            invariant.kind === "check_constraint" &&
            invariant.migration === "0016" &&
            invariant.table === "email_sends" &&
            invariant.constraintName === constraintName
        ),
        `missing registry entry for ${constraintName}`
      );
    }
  });
});

describe("schema invariant verifier", () => {
  it("passes when catalog responses match", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: { dataType: "timestamp with time zone", isNullable: true },
        index: true,
        checkConstraint: true
      }),
      schemaInvariantRegistry
    );

    assert.equal(result.success, true);
    assert.equal(result.checked, 6);
    assert.equal(result.passed.length, 6);
    assert.equal(result.failed.length, 0);
  });

  it("reports drift when the column is absent", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: null,
        index: true,
        checkConstraint: true
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
        index: true,
        checkConstraint: true
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
        index: true,
        checkConstraint: true
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
        index: false,
        checkConstraint: true
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

  it("reports drift when the 0016 provider_message_id unique index is absent", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: { dataType: "timestamp with time zone", isNullable: true },
        index: {
          background_jobs_pending_send_email_scheduled_at_idx: true,
          email_sends_provider_message_id_unique_idx: false
        },
        checkConstraint: true
      }),
      schemaInvariantRegistry
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: "0016",
      kind: "index",
      object: "email_sends_provider_message_id_unique_idx",
      reason: "missing",
      expected: true,
      actual: false
    });
  });

  for (const constraintName of Object.keys(allCheckConstraints)) {
    it(`reports drift when ${constraintName} is absent`, async () => {
      const result = await verifySchemaInvariants(
        buildCatalog({
          column: { dataType: "timestamp with time zone", isNullable: true },
          index: true,
          checkConstraint: {
            ...allCheckConstraints,
            [constraintName]: false
          }
        }),
        schemaInvariantRegistry
      );

      assert.equal(result.success, false);
      assert.deepEqual(result.failed[0], {
        migration: "0016",
        kind: "check_constraint",
        object: constraintName,
        reason: "missing",
        expected: true,
        actual: false
      });
    });
  }

  it("returns a failing process summary on drift", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: null,
        index: false,
        checkConstraint: false
      }),
      schemaInvariantRegistry
    );

    assert.equal(getSchemaVerifyExitCode(result), 1);
    assert.equal(result.checked, 6);
    assert.equal(result.failed.length, 6);
  });

  it("keeps verification SQL limited to PostgreSQL catalog metadata", () => {
    const combinedSql = `${columnInvariantSql}\n${indexInvariantSql}\n${checkConstraintInvariantSql}`;
    assert.match(combinedSql, /information_schema\.columns/);
    assert.match(combinedSql, /pg_indexes/);
    assert.match(combinedSql, /pg_constraint/);
    assert.match(combinedSql, /contype = 'c'/);
    assert.doesNotMatch(
      combinedSql,
      /from\s+(drafts|leads|contacts|email_sends|approvals|activity_logs|ai_runs|lead_scores)\b/i
    );
  });
});
