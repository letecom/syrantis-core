import type { PgPool } from "../client.js";
import type { ColumnCatalogRow, SchemaCatalog } from "./types.js";

type InformationSchemaColumnRow = {
  data_type: string;
  is_nullable: "YES" | "NO";
};

type PgIndexRow = {
  indexname: string;
};

type PgConstraintRow = {
  conname: string;
};

export const columnInvariantSql = `
select data_type, is_nullable
from information_schema.columns
where table_schema = $1
  and table_name = $2
  and column_name = $3
limit 1
`;

export const indexInvariantSql = `
select indexname
from pg_indexes
where schemaname = $1
  and tablename = $2
  and indexname = $3
limit 1
`;

export const checkConstraintInvariantSql = `
select c.conname
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = $1
  and t.relname = $2
  and c.conname = $3
  and c.contype = 'c'
limit 1
`;

export function buildPgSchemaCatalog(pool: PgPool): SchemaCatalog {
  return {
    async findColumn(input): Promise<ColumnCatalogRow | null> {
      const result = await pool.query<InformationSchemaColumnRow>(columnInvariantSql, [
        input.schema,
        input.table,
        input.column
      ]);
      const row = result.rows[0];

      if (!row) {
        return null;
      }

      return {
        dataType: row.data_type,
        isNullable: row.is_nullable === "YES"
      };
    },
    async hasIndex(input): Promise<boolean> {
      const result = await pool.query<PgIndexRow>(indexInvariantSql, [input.schema, input.table, input.indexName]);
      return result.rows.length > 0;
    },
    async hasCheckConstraint(input): Promise<boolean> {
      const result = await pool.query<PgConstraintRow>(checkConstraintInvariantSql, [
        input.schema,
        input.table,
        input.constraintName
      ]);
      return result.rows.length > 0;
    }
  };
}
