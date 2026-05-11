import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkConstraintInvariantSql,
  columnInvariantSql,
  indexInvariantSql,
  policyInvariantSql,
  rlsInvariantSql,
  triggerFunctionInvariantSql,
  triggerInvariantSql,
} from "./queries.js";
import { getInvariantKey, schemaInvariantRegistry } from "./registry.js";
import { formatSchemaVerifyJson, getSchemaVerifyExitCode } from "./reporter.js";
import type { ColumnCatalogRow, RlsCatalogRow, SchemaCatalog, TriggerCatalogRow } from "./types.js";
import { verifySchemaInvariants } from "./verifier.js";

function isRlsCatalogRow(
  value: RlsCatalogRow | Record<string, RlsCatalogRow | null>,
): value is RlsCatalogRow {
  return "rlsEnabled" in value;
}

function isColumnCatalogRow(
  value: ColumnCatalogRow | Record<string, ColumnCatalogRow | null>,
): value is ColumnCatalogRow {
  return "dataType" in value;
}

function isTriggerCatalogRow(
  value: TriggerCatalogRow | Record<string, TriggerCatalogRow | null>,
): value is TriggerCatalogRow {
  return "enabled" in value;
}

function buildCatalog(input: {
  column?: ColumnCatalogRow | null | Record<string, ColumnCatalogRow | null>;
  index?: boolean | Record<string, boolean>;
  checkConstraint?: boolean | Record<string, boolean>;
  rls?: RlsCatalogRow | null | Record<string, RlsCatalogRow | null>;
  policy?: boolean | Record<string, boolean>;
  triggerFunction?: boolean | Record<string, boolean>;
  trigger?: TriggerCatalogRow | null | Record<string, TriggerCatalogRow | null>;
}): SchemaCatalog {
  return {
    findColumn: async ({ column }) => {
      if (input.column === null || input.column === undefined) {
        return null;
      }

      if (!isColumnCatalogRow(input.column)) {
        return input.column[column] ?? null;
      }

      return input.column;
    },
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
      typeof input.policy === "object"
        ? (input.policy[policyName] ?? false)
        : (input.policy ?? true),
    hasTriggerFunction: async ({ functionName }) =>
      typeof input.triggerFunction === "object"
        ? (input.triggerFunction[functionName] ?? false)
        : (input.triggerFunction ?? true),
    findTrigger: async ({ triggerName }) => {
      if (input.trigger === null) {
        return null;
      }

      if (input.trigger && !isTriggerCatalogRow(input.trigger)) {
        return input.trigger[triggerName] ?? null;
      }

      return (
        input.trigger ?? {
          enabled: true,
          functionName: "enforce_email_sends_terminal_delivery_immutability",
        }
      );
    },
  };
}

const emailSendProofCheckConstraints = {
  email_sends_sent_requires_sent_at: true,
  email_sends_failed_requires_failed_at: true,
  email_sends_failed_requires_last_error_code: true,
};

const allCheckConstraints = {
  ...emailSendProofCheckConstraints,
  email_sends_delivery_status_check: true,
  email_sends_delivered_requires_delivered_at: true,
  email_sends_bounced_requires_bounced_at: true,
  email_sends_complained_requires_complained_at: true,
  background_jobs_type_check: true,
};

const deliveryColumns = [
  ["delivery_status", "text"],
  ["delivered_at", "timestamp with time zone"],
  ["bounced_at", "timestamp with time zone"],
  ["complained_at", "timestamp with time zone"],
  ["delivery_error_code", "text"],
] as const;

const allColumns = {
  scheduled_at: { dataType: "timestamp with time zone", isNullable: true },
  delivery_status: { dataType: "text", isNullable: true },
  delivered_at: { dataType: "timestamp with time zone", isNullable: true },
  bounced_at: { dataType: "timestamp with time zone", isNullable: true },
  complained_at: { dataType: "timestamp with time zone", isNullable: true },
  delivery_error_code: { dataType: "text", isNullable: true },
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
  "lead_scores",
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
          invariant.isNullable,
      ),
    );
  });

  it("includes the 0015 scheduled_at index invariant", () => {
    assert.ok(
      schemaInvariantRegistry.some(
        (invariant) =>
          invariant.kind === "index" &&
          invariant.migration === "0015" &&
          invariant.table === "background_jobs" &&
          invariant.indexName === "background_jobs_pending_send_email_scheduled_at_idx",
      ),
    );
  });

  it("includes all 0016 email_sends proof invariants", () => {
    assert.ok(
      schemaInvariantRegistry.some(
        (invariant) =>
          invariant.kind === "index" &&
          invariant.migration === "0016" &&
          invariant.table === "email_sends" &&
          invariant.indexName === "email_sends_provider_message_id_unique_idx",
      ),
    );

    for (const constraintName of Object.keys(emailSendProofCheckConstraints)) {
      assert.ok(
        schemaInvariantRegistry.some(
          (invariant) =>
            invariant.kind === "check_constraint" &&
            invariant.migration === "0016" &&
            invariant.table === "email_sends" &&
            invariant.constraintName === constraintName,
        ),
        `missing registry entry for ${constraintName}`,
      );
    }
  });

  it("includes all 0017 delivery proof invariants", () => {
    for (const [column, dataType] of deliveryColumns) {
      assert.ok(
        schemaInvariantRegistry.some(
          (invariant) =>
            invariant.kind === "column" &&
            invariant.migration === "0017" &&
            invariant.table === "email_sends" &&
            invariant.column === column &&
            invariant.dataType === dataType &&
            invariant.isNullable,
        ),
        `missing registry entry for ${column}`,
      );
    }

    for (const constraintName of [
      "email_sends_delivery_status_check",
      "email_sends_delivered_requires_delivered_at",
      "email_sends_bounced_requires_bounced_at",
      "email_sends_complained_requires_complained_at",
    ]) {
      assert.ok(
        schemaInvariantRegistry.some(
          (invariant) =>
            invariant.kind === "check_constraint" &&
            invariant.migration === "0017" &&
            invariant.table === "email_sends" &&
            invariant.constraintName === constraintName,
        ),
        `missing registry entry for ${constraintName}`,
      );
    }

    assert.ok(
      schemaInvariantRegistry.some(
        (invariant) =>
          invariant.kind === "rls" &&
          invariant.migration === "0017" &&
          invariant.table === "email_sends" &&
          invariant.policyName === "email_sends_provider_message_lookup",
      ),
    );
  });

  it("includes 0018 terminal delivery immutability invariants", () => {
    assert.ok(
      schemaInvariantRegistry.some(
        (invariant) =>
          invariant.kind === "trigger_function" &&
          invariant.migration === "0018" &&
          invariant.schema === "public" &&
          invariant.functionName === "enforce_email_sends_terminal_delivery_immutability",
      ),
    );

    assert.ok(
      schemaInvariantRegistry.some(
        (invariant) =>
          invariant.kind === "trigger" &&
          invariant.migration === "0018" &&
          invariant.schema === "public" &&
          invariant.table === "email_sends" &&
          invariant.triggerName === "email_sends_terminal_delivery_immutability_trg" &&
          invariant.functionName === "enforce_email_sends_terminal_delivery_immutability",
      ),
    );
  });

  it("includes the 0019 pushback_lead_score background job type invariant", () => {
    assert.ok(
      schemaInvariantRegistry.some(
        (invariant) =>
          invariant.kind === "check_constraint" &&
          invariant.migration === "0019" &&
          invariant.table === "background_jobs" &&
          invariant.constraintName === "background_jobs_type_check",
      ),
    );
  });

  it("includes RLS tenant isolation invariants for expected tenant tables", () => {
    const rlsInvariants = schemaInvariantRegistry.filter(
      (invariant) =>
        invariant.kind === "rls" && invariant.policyName.startsWith("tenant_isolation_"),
    );

    assert.equal(rlsInvariants.length, expectedRlsTables.length);

    for (const table of expectedRlsTables) {
      assert.ok(
        rlsInvariants.some(
          (invariant) =>
            invariant.kind === "rls" &&
            invariant.table === table &&
            invariant.policyName === `tenant_isolation_${table}`,
        ),
        `missing RLS registry entry for ${table}`,
      );
    }
  });
});

describe("schema invariant verifier", () => {
  it("passes when catalog responses match", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: allColumns,
        index: true,
        checkConstraint: true,
      }),
      schemaInvariantRegistry,
    );

    assert.equal(result.success, true);
    assert.equal(result.checked, 34);
    assert.equal(result.passed.length, 34);
    assert.equal(result.failed.length, 0);
  });

  it("passes RLS checks when table flags and expected policies exist", async () => {
    const rlsInvariants = schemaInvariantRegistry.filter((invariant) => invariant.kind === "rls");

    const result = await verifySchemaInvariants(
      buildCatalog({
        rls: { rlsEnabled: true, rlsForced: true },
        policy: true,
      }),
      rlsInvariants,
    );

    assert.equal(result.success, true);
    assert.equal(result.checked, rlsInvariants.length);
    assert.equal(result.passed.length, rlsInvariants.length);
    assert.equal(result.failed.length, 0);
  });

  it("reports drift when RLS is disabled", async () => {
    const [rlsInvariant] = schemaInvariantRegistry.filter((invariant) => invariant.kind === "rls");
    assert.ok(rlsInvariant);

    const result = await verifySchemaInvariants(
      buildCatalog({
        rls: { rlsEnabled: false, rlsForced: true },
        policy: true,
      }),
      [rlsInvariant],
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: rlsInvariant.migration,
      kind: "rls",
      object: `${rlsInvariant.table}.${rlsInvariant.policyName}`,
      reason: "rls_disabled",
      expected: true,
      actual: false,
    });
  });

  it("reports drift when FORCE RLS is disabled", async () => {
    const [rlsInvariant] = schemaInvariantRegistry.filter((invariant) => invariant.kind === "rls");
    assert.ok(rlsInvariant);

    const result = await verifySchemaInvariants(
      buildCatalog({
        rls: { rlsEnabled: true, rlsForced: false },
        policy: true,
      }),
      [rlsInvariant],
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: rlsInvariant.migration,
      kind: "rls",
      object: `${rlsInvariant.table}.${rlsInvariant.policyName}`,
      reason: "rls_force_disabled",
      expected: true,
      actual: false,
    });
  });

  it("reports drift when the expected RLS policy is absent", async () => {
    const [rlsInvariant] = schemaInvariantRegistry.filter((invariant) => invariant.kind === "rls");
    assert.ok(rlsInvariant);

    const result = await verifySchemaInvariants(
      buildCatalog({
        rls: { rlsEnabled: true, rlsForced: true },
        policy: false,
      }),
      [rlsInvariant],
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: rlsInvariant.migration,
      kind: "rls",
      object: `${rlsInvariant.table}.${rlsInvariant.policyName}`,
      reason: "policy_missing",
      expected: rlsInvariant.policyName,
      actual: false,
    });
  });

  it("reports drift when the registered RLS table is absent", async () => {
    const [rlsInvariant] = schemaInvariantRegistry.filter((invariant) => invariant.kind === "rls");
    assert.ok(rlsInvariant);

    const result = await verifySchemaInvariants(
      buildCatalog({
        rls: null,
        policy: true,
      }),
      [rlsInvariant],
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: rlsInvariant.migration,
      kind: "rls",
      object: `${rlsInvariant.table}.${rlsInvariant.policyName}`,
      reason: "missing",
      expected: true,
      actual: null,
    });
  });

  it("reports drift when the column is absent", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: null,
        index: true,
        checkConstraint: true,
      }),
      schemaInvariantRegistry,
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: "0015",
      kind: "column",
      object: "background_jobs.scheduled_at",
      reason: "missing",
      expected: "timestamp with time zone",
      actual: null,
    });
  });

  it("reports drift when the column type differs", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: { dataType: "timestamp without time zone", isNullable: true },
        index: true,
        checkConstraint: true,
      }),
      schemaInvariantRegistry,
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
        checkConstraint: true,
      }),
      schemaInvariantRegistry,
    );

    assert.equal(result.success, false);
    assert.equal(result.failed[0]?.reason, "nullability_mismatch");
    assert.equal(result.failed[0]?.actual, false);
  });

  it("reports drift when the index is absent", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: allColumns,
        index: false,
        checkConstraint: true,
      }),
      schemaInvariantRegistry,
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: "0015",
      kind: "index",
      object: "background_jobs_pending_send_email_scheduled_at_idx",
      reason: "missing",
      expected: true,
      actual: false,
    });
  });

  it("reports drift when the 0016 provider_message_id unique index is absent", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: allColumns,
        index: {
          background_jobs_pending_send_email_scheduled_at_idx: true,
          email_sends_provider_message_id_unique_idx: false,
        },
        checkConstraint: true,
      }),
      schemaInvariantRegistry,
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: "0016",
      kind: "index",
      object: "email_sends_provider_message_id_unique_idx",
      reason: "missing",
      expected: true,
      actual: false,
    });
  });

  for (const constraintName of Object.keys(allCheckConstraints)) {
    it(`reports drift when ${constraintName} is absent`, async () => {
      const result = await verifySchemaInvariants(
        buildCatalog({
          column: allColumns,
          index: true,
          checkConstraint: {
            ...allCheckConstraints,
            [constraintName]: false,
          },
        }),
        schemaInvariantRegistry,
      );

      assert.equal(result.success, false);
      const invariant = schemaInvariantRegistry.find(
        (entry) => entry.kind === "check_constraint" && entry.constraintName === constraintName,
      );
      assert.ok(invariant);

      assert.deepEqual(result.failed[0], {
        migration: invariant.migration,
        kind: "check_constraint",
        object: constraintName,
        reason: "missing",
        expected: true,
        actual: false,
      });
    });
  }

  it("reports drift when a 0017 delivery column is absent", async () => {
    const [deliveryColumnInvariant] = schemaInvariantRegistry.filter(
      (invariant) =>
        invariant.kind === "column" &&
        invariant.migration === "0017" &&
        invariant.table === "email_sends",
    );
    assert.ok(deliveryColumnInvariant?.kind === "column");

    const result = await verifySchemaInvariants(
      buildCatalog({
        column: null,
        index: true,
        checkConstraint: true,
        rls: { rlsEnabled: true, rlsForced: true },
        policy: true,
      }),
      [deliveryColumnInvariant],
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: "0017",
      kind: "column",
      object: `email_sends.${deliveryColumnInvariant.column}`,
      reason: "missing",
      expected: deliveryColumnInvariant.dataType,
      actual: null,
    });
  });

  it("reports drift when a 0017 delivery check constraint is absent", async () => {
    const [deliveryConstraintInvariant] = schemaInvariantRegistry.filter(
      (invariant) =>
        invariant.kind === "check_constraint" &&
        invariant.migration === "0017" &&
        invariant.table === "email_sends",
    );
    assert.ok(deliveryConstraintInvariant?.kind === "check_constraint");

    const result = await verifySchemaInvariants(
      buildCatalog({
        column: { dataType: "text", isNullable: true },
        index: true,
        checkConstraint: false,
        rls: { rlsEnabled: true, rlsForced: true },
        policy: true,
      }),
      [deliveryConstraintInvariant],
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: "0017",
      kind: "check_constraint",
      object: deliveryConstraintInvariant.constraintName,
      reason: "missing",
      expected: true,
      actual: false,
    });
  });

  it("reports drift when the 0017 provider-message lookup policy is absent", async () => {
    const [lookupPolicyInvariant] = schemaInvariantRegistry.filter(
      (invariant) =>
        invariant.kind === "rls" &&
        invariant.migration === "0017" &&
        invariant.table === "email_sends",
    );
    assert.ok(lookupPolicyInvariant);

    const result = await verifySchemaInvariants(
      buildCatalog({
        rls: { rlsEnabled: true, rlsForced: true },
        policy: false,
      }),
      [lookupPolicyInvariant],
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: "0017",
      kind: "rls",
      object: "email_sends.email_sends_provider_message_lookup",
      reason: "policy_missing",
      expected: "email_sends_provider_message_lookup",
      actual: false,
    });
  });

  it("reports drift when the 0018 trigger function is absent", async () => {
    const [triggerFunctionInvariant] = schemaInvariantRegistry.filter(
      (invariant) => invariant.kind === "trigger_function" && invariant.migration === "0018",
    );
    assert.ok(triggerFunctionInvariant?.kind === "trigger_function");

    const result = await verifySchemaInvariants(
      buildCatalog({
        triggerFunction: false,
        trigger: {
          enabled: true,
          functionName: "enforce_email_sends_terminal_delivery_immutability",
        },
      }),
      [triggerFunctionInvariant],
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: "0018",
      kind: "trigger_function",
      object: "enforce_email_sends_terminal_delivery_immutability",
      reason: "missing",
      expected: true,
      actual: false,
    });
  });

  it("reports drift when the 0018 trigger is absent", async () => {
    const [triggerInvariant] = schemaInvariantRegistry.filter(
      (invariant) => invariant.kind === "trigger" && invariant.migration === "0018",
    );
    assert.ok(triggerInvariant?.kind === "trigger");

    const result = await verifySchemaInvariants(
      buildCatalog({
        triggerFunction: true,
        trigger: null,
      }),
      [triggerInvariant],
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: "0018",
      kind: "trigger",
      object: "email_sends.email_sends_terminal_delivery_immutability_trg",
      reason: "missing",
      expected: true,
      actual: null,
    });
  });

  it("reports drift when the 0018 trigger is disabled", async () => {
    const [triggerInvariant] = schemaInvariantRegistry.filter(
      (invariant) => invariant.kind === "trigger" && invariant.migration === "0018",
    );
    assert.ok(triggerInvariant?.kind === "trigger");

    const result = await verifySchemaInvariants(
      buildCatalog({
        triggerFunction: true,
        trigger: {
          enabled: false,
          functionName: "enforce_email_sends_terminal_delivery_immutability",
        },
      }),
      [triggerInvariant],
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: "0018",
      kind: "trigger",
      object: "email_sends.email_sends_terminal_delivery_immutability_trg",
      reason: "trigger_disabled",
      expected: true,
      actual: false,
    });
  });

  it("reports drift when the 0018 trigger points to the wrong function", async () => {
    const [triggerInvariant] = schemaInvariantRegistry.filter(
      (invariant) => invariant.kind === "trigger" && invariant.migration === "0018",
    );
    assert.ok(triggerInvariant?.kind === "trigger");

    const result = await verifySchemaInvariants(
      buildCatalog({
        triggerFunction: true,
        trigger: {
          enabled: true,
          functionName: "syrantis_set_updated_at",
        },
      }),
      [triggerInvariant],
    );

    assert.equal(result.success, false);
    assert.deepEqual(result.failed[0], {
      migration: "0018",
      kind: "trigger",
      object: "email_sends.email_sends_terminal_delivery_immutability_trg",
      reason: "trigger_function_mismatch",
      expected: "enforce_email_sends_terminal_delivery_immutability",
      actual: "syrantis_set_updated_at",
    });
  });

  it("returns a failing process summary on drift", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: null,
        index: false,
        checkConstraint: false,
      }),
      schemaInvariantRegistry,
    );

    assert.equal(getSchemaVerifyExitCode(result), 1);
    assert.equal(result.checked, 34);
    assert.equal(result.failed.length, 16);
  });

  it("keeps verification SQL limited to PostgreSQL catalog metadata", () => {
    const combinedSql = `${columnInvariantSql}\n${indexInvariantSql}\n${checkConstraintInvariantSql}\n${rlsInvariantSql}\n${policyInvariantSql}\n${triggerFunctionInvariantSql}\n${triggerInvariantSql}`;
    assert.match(combinedSql, /information_schema\.columns/);
    assert.match(combinedSql, /pg_indexes/);
    assert.match(combinedSql, /pg_constraint/);
    assert.match(combinedSql, /pg_class/);
    assert.match(combinedSql, /pg_namespace/);
    assert.match(combinedSql, /pg_policy/);
    assert.match(combinedSql, /pg_proc/);
    assert.match(combinedSql, /pg_trigger/);
    assert.match(combinedSql, /contype = 'c'/);
    assert.match(combinedSql, /relkind = 'r'/);
    assert.doesNotMatch(
      combinedSql,
      /from\s+(organizations|contacts|leads|tasks|approvals|activity_logs|drafts|email_sends|background_jobs|ai_runs|lead_scores|external_connections|external_object_mappings|integration_events|workspace_api_keys)\b/i,
    );
  });

  it("keeps JSON output compatible", async () => {
    const result = await verifySchemaInvariants(
      buildCatalog({
        column: allColumns,
        index: true,
        checkConstraint: true,
        rls: { rlsEnabled: true, rlsForced: true },
        policy: true,
      }),
      schemaInvariantRegistry,
    );

    const parsed = JSON.parse(formatSchemaVerifyJson(result)) as {
      success: boolean;
      checked: number;
      passed: number;
      failed: unknown[];
    };

    assert.equal(parsed.success, true);
    assert.equal(parsed.checked, 34);
    assert.equal(parsed.passed, 34);
    assert.deepEqual(parsed.failed, []);
  });
});
