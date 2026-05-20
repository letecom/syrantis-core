import type { PgPool } from "../client.js";
import type { ColumnCatalogRow, RlsCatalogRow, SchemaCatalog, TriggerCatalogRow } from "./types.js";

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

type PgRlsRow = {
  relrowsecurity: boolean;
  relforcerowsecurity: boolean;
};

type PgPolicyRow = {
  polname: string;
};

type PgFunctionRow = {
  proname: string;
};

type PgTriggerRow = {
  tgname: string;
  tgenabled: string;
  function_name: string;
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

export const rlsInvariantSql = `
select c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = $1
  and c.relname = $2
  and c.relkind = 'r'
limit 1
`;

export const policyInvariantSql = `
select p.polname
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = $1
  and c.relname = $2
  and p.polname = $3
limit 1
`;

export const triggerFunctionInvariantSql = `
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = $1
  and p.proname = $2
  and p.prokind = 'f'
limit 1
`;

export const triggerInvariantSql = `
select tg.tgname, tg.tgenabled, p.proname as function_name
from pg_trigger tg
join pg_class c on c.oid = tg.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = tg.tgfoid
where n.nspname = $1
  and c.relname = $2
  and c.relkind = 'r'
  and tg.tgname = $3
  and not tg.tgisinternal
limit 1
`;

export const tablePrivilegeInvariantSql = `
select case
  when not exists (select 1 from pg_roles where rolname = $1) then false
  when to_regclass(format('%I.%I', $2, $3)) is null then false
  else has_table_privilege($1, format('%I.%I', $2, $3), $4)
end as has_privilege
`;

export function buildPgSchemaCatalog(pool: PgPool): SchemaCatalog {
  return {
    async findColumn(input): Promise<ColumnCatalogRow | null> {
      const result = await pool.query<InformationSchemaColumnRow>(columnInvariantSql, [
        input.schema,
        input.table,
        input.column,
      ]);
      const row = result.rows[0];

      if (!row) {
        return null;
      }

      return {
        dataType: row.data_type,
        isNullable: row.is_nullable === "YES",
      };
    },
    async hasIndex(input): Promise<boolean> {
      const result = await pool.query<PgIndexRow>(indexInvariantSql, [
        input.schema,
        input.table,
        input.indexName,
      ]);
      return result.rows.length > 0;
    },
    async hasCheckConstraint(input): Promise<boolean> {
      const result = await pool.query<PgConstraintRow>(checkConstraintInvariantSql, [
        input.schema,
        input.table,
        input.constraintName,
      ]);
      return result.rows.length > 0;
    },
    async findRlsTable(input): Promise<RlsCatalogRow | null> {
      const result = await pool.query<PgRlsRow>(rlsInvariantSql, [input.schema, input.table]);
      const row = result.rows[0];

      if (!row) {
        return null;
      }

      return {
        rlsEnabled: row.relrowsecurity,
        rlsForced: row.relforcerowsecurity,
      };
    },
    async hasPolicy(input): Promise<boolean> {
      const result = await pool.query<PgPolicyRow>(policyInvariantSql, [
        input.schema,
        input.table,
        input.policyName,
      ]);
      return result.rows.length > 0;
    },
    async hasTriggerFunction(input): Promise<boolean> {
      const result = await pool.query<PgFunctionRow>(triggerFunctionInvariantSql, [
        input.schema,
        input.functionName,
      ]);
      return result.rows.length > 0;
    },
    async findTrigger(input): Promise<TriggerCatalogRow | null> {
      const result = await pool.query<PgTriggerRow>(triggerInvariantSql, [
        input.schema,
        input.table,
        input.triggerName,
      ]);
      const row = result.rows[0];

      if (!row) {
        return null;
      }

      return {
        enabled: row.tgenabled === "O",
        functionName: row.function_name,
      };
    },
    async hasTablePrivilege(input): Promise<boolean> {
      const result = await pool.query<{ has_privilege: boolean }>(tablePrivilegeInvariantSql, [
        input.grantee,
        input.schema,
        input.table,
        input.privilegeType,
      ]);
      return result.rows[0]?.has_privilege ?? false;
    },
  };
}
