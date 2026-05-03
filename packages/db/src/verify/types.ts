export type MigrationId = "0015" | "0016";

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

export type SchemaInvariant = ColumnSchemaInvariant | IndexSchemaInvariant | CheckConstraintSchemaInvariant;

export type ColumnCatalogRow = {
  dataType: string;
  isNullable: boolean;
};

export type SchemaCatalog = {
  findColumn: (input: {
    schema: string;
    table: string;
    column: string;
  }) => Promise<ColumnCatalogRow | null>;
  hasIndex: (input: { schema: string; table: string; indexName: string }) => Promise<boolean>;
  hasCheckConstraint: (input: { schema: string; table: string; constraintName: string }) => Promise<boolean>;
};

export type SchemaInvariantFailureReason = "missing" | "data_type_mismatch" | "nullability_mismatch";

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
