export type MigrationId =
  | "0005"
  | "0006"
  | "0007"
  | "0009"
  | "0010"
  | "0011"
  | "0012"
  | "0015"
  | "0016"
  | "0017"
  | "0018"
  | "0019"
  | "0020"
  | "0021"
  | "0022"
  | "0023";

export type ColumnSchemaInvariant = {
  kind: "column";
  migration: MigrationId;
  schema: string;
  table: string;
  column: string;
  dataType: string;
  isNullable: boolean;
};

export type IndexSchemaInvariant = {
  kind: "index";
  migration: MigrationId;
  schema: string;
  table: string;
  indexName: string;
};

export type CheckConstraintSchemaInvariant = {
  kind: "check_constraint";
  migration: MigrationId;
  schema: string;
  table: string;
  constraintName: string;
};

export type RlsSchemaInvariant = {
  kind: "rls";
  migration: MigrationId;
  schema: string;
  table: string;
  policyName: string;
};

export type TriggerFunctionSchemaInvariant = {
  kind: "trigger_function";
  migration: MigrationId;
  schema: string;
  functionName: string;
};

export type TriggerSchemaInvariant = {
  kind: "trigger";
  migration: MigrationId;
  schema: string;
  table: string;
  triggerName: string;
  functionName: string;
};

export type TablePrivilegeSchemaInvariant = {
  kind: "table_privilege";
  migration: MigrationId;
  schema: string;
  table: string;
  grantee: string;
  privilegeType: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
};

export type SchemaInvariant =
  | ColumnSchemaInvariant
  | IndexSchemaInvariant
  | CheckConstraintSchemaInvariant
  | RlsSchemaInvariant
  | TriggerFunctionSchemaInvariant
  | TriggerSchemaInvariant
  | TablePrivilegeSchemaInvariant;

export type ColumnCatalogRow = {
  dataType: string;
  isNullable: boolean;
};

export type RlsCatalogRow = {
  rlsEnabled: boolean;
  rlsForced: boolean;
};

export type TriggerCatalogRow = {
  enabled: boolean;
  functionName: string;
};

export type SchemaCatalog = {
  findColumn: (input: {
    schema: string;
    table: string;
    column: string;
  }) => Promise<ColumnCatalogRow | null>;
  hasIndex: (input: { schema: string; table: string; indexName: string }) => Promise<boolean>;
  hasCheckConstraint: (input: {
    schema: string;
    table: string;
    constraintName: string;
  }) => Promise<boolean>;
  findRlsTable: (input: { schema: string; table: string }) => Promise<RlsCatalogRow | null>;
  hasPolicy: (input: { schema: string; table: string; policyName: string }) => Promise<boolean>;
  hasTriggerFunction: (input: { schema: string; functionName: string }) => Promise<boolean>;
  findTrigger: (input: {
    schema: string;
    table: string;
    triggerName: string;
  }) => Promise<TriggerCatalogRow | null>;
  hasTablePrivilege: (input: {
    schema: string;
    table: string;
    grantee: string;
    privilegeType: TablePrivilegeSchemaInvariant["privilegeType"];
  }) => Promise<boolean>;
};

export type SchemaInvariantFailureReason =
  | "missing"
  | "data_type_mismatch"
  | "nullability_mismatch"
  | "rls_disabled"
  | "rls_force_disabled"
  | "policy_missing"
  | "trigger_disabled"
  | "trigger_function_mismatch";

export type SchemaInvariantFailure = {
  migration: MigrationId;
  kind: SchemaInvariant["kind"];
  object: string;
  reason: SchemaInvariantFailureReason;
  expected?: string | boolean;
  actual?: string | boolean | null;
};

export type SchemaInvariantPass = {
  migration: MigrationId;
  kind: SchemaInvariant["kind"];
  object: string;
};

export type SchemaVerificationResult = {
  success: boolean;
  checked: number;
  passed: SchemaInvariantPass[];
  failed: SchemaInvariantFailure[];
};
