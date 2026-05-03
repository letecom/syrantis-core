import { getInvariantObject } from "./registry.js";
import type {
  SchemaCatalog,
  SchemaInvariant,
  SchemaInvariantFailure,
  SchemaInvariantPass,
  SchemaVerificationResult
} from "./types.js";

export async function verifySchemaInvariants(
  catalog: SchemaCatalog,
  invariants: readonly SchemaInvariant[]
): Promise<SchemaVerificationResult> {
  const passed: SchemaInvariantPass[] = [];
  const failed: SchemaInvariantFailure[] = [];

  for (const invariant of invariants) {
    if (invariant.kind === "column") {
      const object = getInvariantObject(invariant);
      const column = await catalog.findColumn({
        schema: invariant.schema,
        table: invariant.table,
        column: invariant.column
      });

      if (!column) {
        failed.push({
          migration: invariant.migration,
          kind: invariant.kind,
          object,
          reason: "missing",
          expected: invariant.dataType,
          actual: null
        });
        continue;
      }

      if (column.dataType !== invariant.dataType) {
        failed.push({
          migration: invariant.migration,
          kind: invariant.kind,
          object,
          reason: "data_type_mismatch",
          expected: invariant.dataType,
          actual: column.dataType
        });
        continue;
      }

      if (column.isNullable !== invariant.isNullable) {
        failed.push({
          migration: invariant.migration,
          kind: invariant.kind,
          object,
          reason: "nullability_mismatch",
          expected: invariant.isNullable,
          actual: column.isNullable
        });
        continue;
      }

      passed.push({
        migration: invariant.migration,
        kind: invariant.kind,
        object
      });
      continue;
    }

    const object = getInvariantObject(invariant);
    const indexExists = await catalog.hasIndex({
      schema: invariant.schema,
      table: invariant.table,
      indexName: invariant.indexName
    });

    if (!indexExists) {
      failed.push({
        migration: invariant.migration,
        kind: invariant.kind,
        object,
        reason: "missing",
        expected: true,
        actual: false
      });
      continue;
    }

    passed.push({
      migration: invariant.migration,
      kind: invariant.kind,
      object
    });
  }

  return {
    success: failed.length === 0,
    checked: invariants.length,
    passed,
    failed
  };
}
