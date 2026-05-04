import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkConstraintInvariantSql,
  columnInvariantSql,
  indexInvariantSql,
  policyInvariantSql,
  rlsInvariantSql
} from "./queries.js";
import { getInvariantKey, schemaInvariantRegistry } from "./registry.js";
import { formatSchemaVerifyJson, getSchemaVerifyExitCode } from "./reporter.js";
import type { ColumnCatalogRow, RlsCatalogRow, SchemaCatalog } from "./types.js";
import { verifySchemaInvariants } from "./verifier.js";

function isRlsCatalogRow(value: RlsCatalogRow | Record<string, RlsCatalogRow | null>): value is RlsCatalogRow {
  return "rlsEnabled" in value;
}

function buildCatalog(input: {
  column?: ColumnCatalogRow | null;
  index?: boolean | Record<string, boolean>;
  checkConstraint?: boolean | Record<string, boolean>;
  rls?: RlsCatalogRow | null | Record<string, RlsCatalogRow | null>;
  policy?: boolean | Record<string, boolean>;
}): SchemaCatalog {
  return {
    findColumn: async () => input.column ?? null,
    hasIndex: async ({ indexName }) =>
      typeof input.index === "object" ? (input.index[indexName] ?? false) : (input.index ?? false),
    hasCheckConstraint: async ({ constraintName }) =>
      typeof input.checkConstraint === "object"
        ? (input.checkConstraint[constraintName] ?? false)
        : (input.checkConstraint ?? false),
    findRlsTable: async ({ table }) => {
      if (input.rls === null) {
        return null;
      }

      if (input.rls && !isRlsCatalogRow(input.rls)) {
        return input.rls[table] ?? { rlsEnabled: true, rlsForced: true };
      }

      return input.rls ?? { rlsEnabled: true, rlsForced: true };
    },
    hasPolicy: async ({ policyName }) =>
      typeof input.policy === "object" ? (input.policy[policyName] ?? false) : (input.policy ?? true)
  };
}

const allCheckConstraints = {
  email_sends_sent_requires_sent_at: true,
  email_sends_failed_requires_failed_at: true,
  email_sends_failed_requires_last_error_code: true
};

const expectedRlsTables = [
  "organizations",
  "contacts",
  "leads",
  "tasks",
  "approvals",
  "activity_logs",
  "external_connections",
  "external_object_mappings",
  "integration_events",
  "workspace_api_keys",
  "drafts",
  "email_sends",
  "background_jobs",
  "ai_runs",
  "lead_scores"
];

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

  it("includes RLS tenant isolation invariants for expected tenant tables", () => {
    const rlsInvariants = schemaInvariantRegistry.filter((invariant) => invariant.kind === "rls");

    assert.equal(rlsInvariants.length, expectedRlsTables.length);

    for (const table of expectedRlsTables) {
      assert.ok(
        rlsInvariants.some(
          (invariant) => invariant.table === table && invariant.policyName === `tenant_isolation_${table}`
        ),
        `missing RLS registry entry for ${table}`
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
    assert.equal(result.checked, 21);
    assert.equal(result.passed.length, 21);
    assert.equal(result.failed.length, 0);
  });

  it("passes RLS checks when table flags and expected policies exist", async () => {
    const rlsInvariants = schemaInvariantRegistry.filter((invariant) => invariant.kind === "rls");

    const result = await verifySchemaInvariants(
      buildCatalog({
        rls: { rlsEnabled: true, rlsForced: true },
        policy: true
      }),
      rlsInvariants
    );

    assert.equal(result.success, true);
    assert.equal(result.checked, expectedRlsTables.length);
    assert.equal(result.passed.length, expectedRlsTables.length);
    assert.equal(result.failed.length, 0);
  });

  it("reports drift when RLS is disabled", async () => {
    const [rlsInvariant] = schemaInvariantRegistry.filter((invariant) => invariant.kind === "rls");
    assert.ok(rlsInvariant);

    const result = await verifySchemaInvariants(
      buildCatalog({
        rls: { rlsEnabled: false, rlsForced: true },
        policy: true
      }),
      [rlsInvariant]
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: rlsInvariant.migration,
      kind: "rls",
      object: `${rlsInvariant.table}.${rlsInvariant.policyName}`,
      reason: "rls_disabled",
      expected: true,
      actual: false
    });
  });

  it("reports drift when FORCE RLS is disabled", async () => {
    const [rlsInvariant] = schemaInvariantRegistry.filter((invariant) => invariant.kind === "rls");
    assert.ok(rlsInvariant);

    const result = await verifySchemaInvariants(
      buildCatalog({
        rls: { rlsEnabled: true, rlsForced: false },
        policy: true
      }),
      [rlsInvariant]
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: rlsInvariant.migration,
      kind: "rls",
      object: `${rlsInvariant.table}.${rlsInvariant.policyName}`,
      reason: "rls_force_disabled",
      expected: true,
      actual: false
    });
  });

  it("reports drift when the expected RLS policy is absent", async () => {
    const [rlsInvariant] = schemaInvariantRegistry.filter((invariant) => invariant.kind === "rls");
    assert.ok(rlsInvariant);

    const result = await verifySchemaInvariants(
      buildCatalog({
        rls: { rlsEnabled: true, rlsForced: true },
        policy: false
      }),
      [rlsInvariant]
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: rlsInvariant.migration,
      kind: "rls",
      object: `${rlsInvariant.table}.${rlsInvariant.policyName}`,
      reason: "policy_missing",
      expected: rlsInvariant.policyName,
      actual: false
    });
  });

  it("reports drift when the registered RLS table is absent", async () => {
    const [rlsInvariant] = schemaInvariantRegistry.filter((invariant) => invariant.kind === "rls");
    assert.ok(rlsInvariant);

    const result = await verifySchemaInvariants(
      buildCatalog({
        rls: null,
        policy: true
      }),
      [rlsInvariant]
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: rlsInvariant.migration,
      kind: "rls",
      object: `${rlsInvariant.table}.${rlsInvariant.policyName}`,
      reason: "missing",
      expected: true,
      actual: null
    });
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
    assert.equal(result.checked, 21);
    assert.equal(result.failed.length, 6);
  });

  it("keeps verification SQL limited to PostgreSQL catalog metadata", () => {
    const combinedSql = `${columnInvariantSql}\n${indexInvariantSql}\n${checkConstraintInvariantSql}\n${rlsInvariantSql}\n${policyInvariantSql}`;
    assert.match(combinedSql, /information_schema\.columns/);
    assert.match(combinedSql, /pg_indexes/);
    assert.match(combinedSql, /pg_constraint/);
    assert.match(combinedSql, /pg_class/);
    assert.match(combinedSql, /pg_namespace/);
    assert.match(combinedSql, /pg_policy/);
    assert.match(combinedSql, /contype = 'c'/);
    assert.match(combinedSql, /relkind = 'r'/);
    assert.doesNotMatch(
      combinedSql,
      /from\s+(organizations|contacts|leads|tasks|approvals|activity_logs|drafts|email_sends|background_jobs|ai_runs|lead_scores|external_connections|external_object_mappings|integration_events|workspace_api_keys)\b/i
    );
  });

  it("keeps JSON output compatible", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: { dataType: "timestamp with time zone", isNullable: true },
        index: true,
        checkConstraint: true,
        rls: { rlsEnabled: true, rlsForced: true },
        policy: true
      }),
      schemaInvariantRegistry
    );

    const parsed = JSON.parse(formatSchemaVerifyJson(result)) as {
      success: boolean;
      checked: number;
      passed: number;
      failed: unknown[];
    };

    assert.equal(parsed.success, true);
    assert.equal(parsed.checked, 21);
    assert.equal(parsed.passed, 21);
    assert.deepEqual(parsed.failed, []);
  });
});
