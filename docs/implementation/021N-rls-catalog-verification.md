# 021N - DB-Level RLS Catalog Verification Implementation

## Summary

`pnpm --filter @syrantis/db verify-schema` now verifies tenant isolation proof from the live PostgreSQL catalog.

The existing 0015 and 0016 structural checks remain unchanged. The registry now also includes one RLS invariant per existing tenant table. Each RLS invariant checks:

- `pg_class.relrowsecurity`
- `pg_class.relforcerowsecurity`
- expected `pg_policy.polname`

## Files Changed

- `packages/db/src/verify/types.ts`
- `packages/db/src/verify/registry.ts`
- `packages/db/src/verify/queries.ts`
- `packages/db/src/verify/verifier.ts`
- `packages/db/src/verify/reporter.ts`
- `packages/db/src/verify/cli.ts`
- `packages/db/src/verify/verifier.test.ts`
- `docs/specs/021N-rls-catalog-verification.md`
- `docs/implementation/021N-rls-catalog-verification.md`

## Behavior Delivered

The verify-schema registry now contains 21 invariants:

- 15 RLS tenant isolation catalog checks
- 6 existing 0015/0016 structural checks

The command still emits `SCHEMA_VERIFY_OK` or `SCHEMA_VERIFY_DRIFT`, still includes checked/passed/failed counters, and still returns exit `1` for drift.

## Safety Notes

The RLS verifier uses read-only catalog queries only:

- `pg_class`
- `pg_namespace`
- `pg_policy`

It does not inspect tenant table rows, parse policy expressions, perform DDL, or attempt repair.

## Production Validation Notes

After merge, run:

```sh
pnpm --filter @syrantis/db verify-migration-files
pnpm --filter @syrantis/db migrate
pnpm --filter @syrantis/db verify-schema
```

Expected verify-schema checked count is `21`. If production verify-schema fails, treat it as real RLS drift and do not weaken the registry.
