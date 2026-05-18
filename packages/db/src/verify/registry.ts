import type { MigrationId, SchemaInvariant } from "./types.js";

const defaultSchema = "public";

const rlsTenantInvariants = [
  ["0005", "organizations", "tenant_isolation_organizations"],
  ["0005", "contacts", "tenant_isolation_contacts"],
  ["0005", "leads", "tenant_isolation_leads"],
  ["0005", "tasks", "tenant_isolation_tasks"],
  ["0005", "approvals", "tenant_isolation_approvals"],
  ["0005", "activity_logs", "tenant_isolation_activity_logs"],
  ["0006", "external_connections", "tenant_isolation_external_connections"],
  ["0006", "external_object_mappings", "tenant_isolation_external_object_mappings"],
  ["0006", "integration_events", "tenant_isolation_integration_events"],
  ["0007", "workspace_api_keys", "tenant_isolation_workspace_api_keys"],
  ["0009", "drafts", "tenant_isolation_drafts"],
  ["0010", "email_sends", "tenant_isolation_email_sends"],
  ["0011", "background_jobs", "tenant_isolation_background_jobs"],
  ["0012", "ai_runs", "tenant_isolation_ai_runs"],
  ["0012", "lead_scores", "tenant_isolation_lead_scores"],
  ["0020", "workspace_context_profiles", "tenant_isolation_workspace_context_profiles"],
  ["0021", "intake_classifications", "tenant_isolation_intake_classifications"],
  ["0022", "client_mail_items", "tenant_isolation_client_mail_items"],
] as const satisfies readonly (readonly [MigrationId, string, string])[];

const emailSendDeliveryColumns = [
  ["delivery_status", "text", true],
  ["delivered_at", "timestamp with time zone", true],
  ["bounced_at", "timestamp with time zone", true],
  ["complained_at", "timestamp with time zone", true],
  ["delivery_error_code", "text", true],
] as const satisfies readonly (readonly [string, string, boolean])[];

const emailSendDeliveryConstraints = [
  "email_sends_delivery_status_check",
  "email_sends_delivered_requires_delivered_at",
  "email_sends_bounced_requires_bounced_at",
  "email_sends_complained_requires_complained_at",
] as const;

const intakeClassificationColumns = [
  ["id", "uuid", false],
  ["workspace_id", "uuid", false],
  ["external_id", "text", false],
  ["classification", "text", false],
  ["category", "text", false],
  ["action", "text", false],
  ["confidence", "text", false],
  ["reason_code", "text", false],
  ["diagnostic_trace_id", "uuid", false],
  ["suggested_labels", "ARRAY", false],
  ["lead_id", "uuid", true],
  ["created_at", "timestamp with time zone", false],
] as const satisfies readonly (readonly [string, string, boolean])[];

const intakeClassificationConstraints = [
  "intake_classifications_classification_check",
  "intake_classifications_action_check",
  "intake_classifications_confidence_check",
] as const;

const clientMailItemColumns = [
  ["id", "uuid", false],
  ["workspace_id", "uuid", false],
  ["classification_id", "uuid", true],
  ["lead_id", "uuid", true],
  ["contact_id", "uuid", true],
  ["draft_id", "uuid", true],
  ["external_id", "text", true],
  ["external_thread_id", "text", true],
  ["source", "text", false],
  ["direction", "text", false],
  ["from_display", "text", true],
  ["from_email", "text", true],
  ["to_display", "text", true],
  ["to_email", "text", true],
  ["subject", "text", true],
  ["snippet", "text", true],
  ["body_text", "text", true],
  ["received_at", "timestamp with time zone", true],
  ["has_attachments", "boolean", false],
  ["attachments_json", "jsonb", false],
  ["created_at", "timestamp with time zone", false],
  ["updated_at", "timestamp with time zone", false],
] as const satisfies readonly (readonly [string, string, boolean])[];

const clientMailItemConstraints = [
  "client_mail_items_direction_check",
  "client_mail_items_source_non_empty_check",
  "client_mail_items_attachments_json_array_check",
] as const;

const clientMailItemIndexes = [
  "client_mail_items_workspace_external_id_unique_idx",
  "client_mail_items_workspace_received_at_idx",
  "client_mail_items_workspace_classification_id_idx",
  "client_mail_items_workspace_lead_id_idx",
  "client_mail_items_workspace_contact_id_idx",
  "client_mail_items_workspace_draft_id_idx",
] as const;

export const schemaInvariantRegistry: readonly SchemaInvariant[] = [
  ...rlsTenantInvariants.map(([migration, table, policyName]) => ({
    kind: "rls" as const,
    migration,
    schema: defaultSchema,
    table,
    policyName,
  })),
  {
    kind: "column",
    migration: "0015",
    schema: defaultSchema,
    table: "background_jobs",
    column: "scheduled_at",
    dataType: "timestamp with time zone",
    isNullable: true,
  },
  {
    kind: "index",
    migration: "0015",
    schema: defaultSchema,
    table: "background_jobs",
    indexName: "background_jobs_pending_send_email_scheduled_at_idx",
  },
  {
    kind: "index",
    migration: "0016",
    schema: defaultSchema,
    table: "email_sends",
    indexName: "email_sends_provider_message_id_unique_idx",
  },
  {
    kind: "check_constraint",
    migration: "0016",
    schema: defaultSchema,
    table: "email_sends",
    constraintName: "email_sends_sent_requires_sent_at",
  },
  {
    kind: "check_constraint",
    migration: "0016",
    schema: defaultSchema,
    table: "email_sends",
    constraintName: "email_sends_failed_requires_failed_at",
  },
  {
    kind: "check_constraint",
    migration: "0016",
    schema: defaultSchema,
    table: "email_sends",
    constraintName: "email_sends_failed_requires_last_error_code",
  },
  ...emailSendDeliveryColumns.map(([column, dataType, isNullable]) => ({
    kind: "column" as const,
    migration: "0017" as const,
    schema: defaultSchema,
    table: "email_sends",
    column,
    dataType,
    isNullable,
  })),
  ...emailSendDeliveryConstraints.map((constraintName) => ({
    kind: "check_constraint" as const,
    migration: "0017" as const,
    schema: defaultSchema,
    table: "email_sends",
    constraintName,
  })),
  {
    kind: "rls",
    migration: "0017",
    schema: defaultSchema,
    table: "email_sends",
    policyName: "email_sends_provider_message_lookup",
  },
  {
    kind: "trigger_function",
    migration: "0018",
    schema: defaultSchema,
    functionName: "enforce_email_sends_terminal_delivery_immutability",
  },
  {
    kind: "trigger",
    migration: "0018",
    schema: defaultSchema,
    table: "email_sends",
    triggerName: "email_sends_terminal_delivery_immutability_trg",
    functionName: "enforce_email_sends_terminal_delivery_immutability",
  },
  {
    kind: "check_constraint",
    migration: "0019",
    schema: defaultSchema,
    table: "background_jobs",
    constraintName: "background_jobs_type_check",
  },
  {
    kind: "index",
    migration: "0020",
    schema: defaultSchema,
    table: "workspace_context_profiles",
    indexName: "workspace_context_profiles_workspace_id_unique_idx",
  },
  {
    kind: "trigger",
    migration: "0020",
    schema: defaultSchema,
    table: "workspace_context_profiles",
    triggerName: "workspace_context_profiles_set_updated_at_trg",
    functionName: "syrantis_set_updated_at",
  },
  ...intakeClassificationColumns.map(([column, dataType, isNullable]) => ({
    kind: "column" as const,
    migration: "0021" as const,
    schema: defaultSchema,
    table: "intake_classifications",
    column,
    dataType,
    isNullable,
  })),
  ...intakeClassificationConstraints.map((constraintName) => ({
    kind: "check_constraint" as const,
    migration: "0021" as const,
    schema: defaultSchema,
    table: "intake_classifications",
    constraintName,
  })),
  {
    kind: "index",
    migration: "0021",
    schema: defaultSchema,
    table: "intake_classifications",
    indexName: "intake_classifications_workspace_external_id_unique_idx",
  },
  ...clientMailItemColumns.map(([column, dataType, isNullable]) => ({
    kind: "column" as const,
    migration: "0022" as const,
    schema: defaultSchema,
    table: "client_mail_items",
    column,
    dataType,
    isNullable,
  })),
  ...clientMailItemConstraints.map((constraintName) => ({
    kind: "check_constraint" as const,
    migration: "0022" as const,
    schema: defaultSchema,
    table: "client_mail_items",
    constraintName,
  })),
  ...clientMailItemIndexes.map((indexName) => ({
    kind: "index" as const,
    migration: "0022" as const,
    schema: defaultSchema,
    table: "client_mail_items",
    indexName,
  })),
  {
    kind: "trigger",
    migration: "0022",
    schema: defaultSchema,
    table: "client_mail_items",
    triggerName: "client_mail_items_set_updated_at_trg",
    functionName: "syrantis_set_updated_at",
  },
] as const;

export function getInvariantObject(invariant: SchemaInvariant): string {
  if (invariant.kind === "column") {
    return `${invariant.table}.${invariant.column}`;
  }

  if (invariant.kind === "rls") {
    return `${invariant.table}.${invariant.policyName}`;
  }

  if (invariant.kind === "check_constraint") {
    return invariant.constraintName;
  }

  if (invariant.kind === "trigger_function") {
    return invariant.functionName;
  }

  if (invariant.kind === "trigger") {
    return `${invariant.table}.${invariant.triggerName}`;
  }

  return invariant.indexName;
}

export function getInvariantKey(invariant: SchemaInvariant): string {
  if (invariant.kind === "column") {
    return `${invariant.migration}:${invariant.kind}:${invariant.schema}.${invariant.table}.${invariant.column}`;
  }

  if (invariant.kind === "rls") {
    return `${invariant.migration}:${invariant.kind}:${invariant.schema}.${invariant.table}.${invariant.policyName}`;
  }

  if (invariant.kind === "check_constraint") {
    return `${invariant.migration}:${invariant.kind}:${invariant.schema}.${invariant.table}.${invariant.constraintName}`;
  }

  if (invariant.kind === "trigger_function") {
    return `${invariant.migration}:${invariant.kind}:${invariant.schema}.${invariant.functionName}`;
  }

  if (invariant.kind === "trigger") {
    return `${invariant.migration}:${invariant.kind}:${invariant.schema}.${invariant.table}.${invariant.triggerName}`;
  }

  return `${invariant.migration}:${invariant.kind}:${invariant.schema}.${invariant.table}.${invariant.indexName}`;
}

export function filterInvariantsByMigration(
  invariants: readonly SchemaInvariant[],
  migration?: MigrationId,
): SchemaInvariant[] {
  return migration
    ? invariants.filter((invariant) => invariant.migration === migration)
    : [...invariants];
}
