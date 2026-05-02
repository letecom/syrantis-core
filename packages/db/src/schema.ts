import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

const emptyJson = sql`'{}'::jsonb`;

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    featuresJson: jsonb("features_json").$type<Record<string, unknown>>().notNull().default(emptyJson),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
    ...timestamps
  },
  (table) => [
    check("workspaces_status_check", sql`${table.status} in ('active', 'paused', 'archived')`),
    index("workspaces_status_idx").on(table.status),
    index("workspaces_created_at_idx").on(table.createdAt),
    index("workspaces_stripe_customer_id_idx").on(table.stripeCustomerId),
    index("workspaces_stripe_subscription_id_idx").on(table.stripeSubscriptionId)
  ]
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    email: varchar("email", { length: 320 }).notNull().unique(),
    passwordHash: text("password_hash"),
    name: varchar("name", { length: 255 }),
    role: varchar("role", { length: 24 }).notNull().default("operator"),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    ...timestamps
  },
  (table) => [
    check("users_role_check", sql`${table.role} in ('founder', 'admin', 'operator', 'client')`),
    check("users_status_check", sql`${table.status} in ('active', 'disabled')`),
    index("users_workspace_id_idx").on(table.workspaceId),
    index("users_workspace_role_idx").on(table.workspaceId, table.role),
    index("users_status_idx").on(table.status),
    index("users_created_at_idx").on(table.createdAt)
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
  },
  (table) => [
    check("sessions_status_check", sql`${table.status} in ('active', 'revoked', 'expired')`),
    index("sessions_workspace_id_idx").on(table.workspaceId),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_status_idx").on(table.status),
    index("sessions_expires_at_idx").on(table.expiresAt),
    index("sessions_created_at_idx").on(table.createdAt)
  ]
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: varchar("name", { length: 255 }).notNull(),
    sector: varchar("sector", { length: 120 }),
    websiteUrl: text("website_url"),
    phone: varchar("phone", { length: 80 }),
    email: varchar("email", { length: 320 }),
    status: varchar("status", { length: 32 }).notNull().default("prospect"),
    configJson: jsonb("config_json").$type<Record<string, unknown>>().notNull().default(emptyJson),
    ...timestamps
  },
  (table) => [
    check(
      "organizations_status_check",
      sql`${table.status} in ('prospect', 'active_client', 'inactive', 'archived')`
    ),
    index("organizations_workspace_id_idx").on(table.workspaceId),
    index("organizations_workspace_status_idx").on(table.workspaceId, table.status),
    index("organizations_email_idx").on(table.email),
    index("organizations_created_at_idx").on(table.createdAt)
  ]
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    firstName: varchar("first_name", { length: 120 }),
    lastName: varchar("last_name", { length: 120 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 80 }),
    roleTitle: varchar("role_title", { length: 160 }),
    optOut: boolean("opt_out").notNull().default(false),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default(emptyJson),
    ...timestamps
  },
  (table) => [
    index("contacts_workspace_id_idx").on(table.workspaceId),
    index("contacts_organization_id_idx").on(table.organizationId),
    index("contacts_email_idx").on(table.email),
    index("contacts_opt_out_idx").on(table.optOut),
    index("contacts_created_at_idx").on(table.createdAt)
  ]
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    source: varchar("source", { length: 24 }).notNull().default("manual"),
    status: varchar("status", { length: 24 }).notNull().default("new"),
    rawContent: text("raw_content"),
    normalizedJson: jsonb("normalized_json").$type<Record<string, unknown>>().notNull().default(emptyJson),
    score: integer("score"),
    scoreReason: text("score_reason"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    check("leads_status_check", sql`${table.status} in ('new', 'scored', 'drafted', 'responded', 'lost', 'won')`),
    check("leads_source_check", sql`${table.source} in ('email', 'form', 'phone', 'manual', 'import')`),
    index("leads_workspace_id_idx").on(table.workspaceId),
    index("leads_organization_id_idx").on(table.organizationId),
    index("leads_contact_id_idx").on(table.contactId),
    index("leads_workspace_status_idx").on(table.workspaceId, table.status),
    index("leads_source_idx").on(table.source),
    index("leads_received_at_idx").on(table.receivedAt),
    index("leads_created_at_idx").on(table.createdAt)
  ]
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    leadId: uuid("lead_id").references(() => leads.id),
    title: varchar("title", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("open"),
    valueCents: integer("value_cents"),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    quoteSentAt: timestamp("quote_sent_at", { withTimezone: true }),
    wonAt: timestamp("won_at", { withTimezone: true }),
    lostAt: timestamp("lost_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    check(
      "opportunities_status_check",
      sql`${table.status} in ('open', 'quote_sent', 'followup_due', 'won', 'lost', 'archived')`
    ),
    index("opportunities_workspace_id_idx").on(table.workspaceId),
    index("opportunities_organization_id_idx").on(table.organizationId),
    index("opportunities_contact_id_idx").on(table.contactId),
    index("opportunities_lead_id_idx").on(table.leadId),
    index("opportunities_workspace_status_idx").on(table.workspaceId, table.status),
    index("opportunities_quote_sent_at_idx").on(table.quoteSentAt),
    index("opportunities_created_at_idx").on(table.createdAt)
  ]
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    leadId: uuid("lead_id").references(() => leads.id),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id),
    type: varchar("type", { length: 24 }).notNull().default("followup"),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default(emptyJson),
    ...timestamps
  },
  (table) => [
    check("tasks_type_check", sql`${table.type} in ('followup', 'approval', 'review', 'call', 'note', 'setup')`),
    check("tasks_status_check", sql`${table.status} in ('pending', 'in_progress', 'done', 'cancelled')`),
    index("tasks_workspace_id_idx").on(table.workspaceId),
    index("tasks_organization_id_idx").on(table.organizationId),
    index("tasks_contact_id_idx").on(table.contactId),
    index("tasks_lead_id_idx").on(table.leadId),
    index("tasks_opportunity_id_idx").on(table.opportunityId),
    index("tasks_workspace_status_idx").on(table.workspaceId, table.status),
    index("tasks_type_idx").on(table.type),
    index("tasks_due_at_idx").on(table.dueAt),
    index("tasks_created_at_idx").on(table.createdAt)
  ]
);

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    taskId: uuid("task_id").references(() => tasks.id),
    leadId: uuid("lead_id").references(() => leads.id),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    channel: varchar("channel", { length: 32 }).notNull().default("email"),
    subject: text("subject"),
    textBody: text("text_body"),
    htmlBody: text("html_body"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default(emptyJson),
    ...timestamps
  },
  (table) => [
    check(
      "drafts_status_check",
      sql`${table.status} in ('draft', 'pending_approval', 'approved', 'rejected', 'archived')`
    ),
    index("drafts_workspace_id_idx").on(table.workspaceId),
    index("drafts_task_id_idx").on(table.taskId),
    index("drafts_lead_id_idx").on(table.leadId),
    index("drafts_opportunity_id_idx").on(table.opportunityId),
    index("drafts_contact_id_idx").on(table.contactId),
    index("drafts_workspace_status_idx").on(table.workspaceId, table.status),
    index("drafts_channel_idx").on(table.channel),
    index("drafts_created_at_idx").on(table.createdAt)
  ]
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    draftId: uuid("draft_id").references(() => drafts.id),
    taskId: uuid("task_id").references(() => tasks.id),
    approvalType: varchar("approval_type", { length: 32 }).notNull().default("manual"),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    requestedBy: uuid("requested_by").references(() => users.id),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedBy: uuid("rejected_by").references(() => users.id),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    riskLevel: varchar("risk_level", { length: 24 }).notNull().default("medium"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default(emptyJson),
    ...timestamps
  },
  (table) => [
    check("approvals_status_check", sql`${table.status} in ('pending', 'approved', 'rejected', 'expired', 'revoked')`),
    check("approvals_entity_type_check", sql`${table.entityType} in ('draft', 'task', 'report', 'template')`),
    check(
      "approvals_approval_type_check",
      sql`${table.approvalType} in ('manual', 'template_trusted', 'score_based')`
    ),
    check("approvals_risk_level_check", sql`${table.riskLevel} in ('low', 'medium', 'high', 'critical')`),
    index("approvals_workspace_id_idx").on(table.workspaceId),
    index("approvals_entity_idx").on(table.entityType, table.entityId),
    index("approvals_draft_id_idx").on(table.draftId),
    index("approvals_task_id_idx").on(table.taskId),
    index("approvals_requested_by_idx").on(table.requestedBy),
    index("approvals_approved_by_idx").on(table.approvedBy),
    index("approvals_rejected_by_idx").on(table.rejectedBy),
    index("approvals_workspace_status_idx").on(table.workspaceId, table.status),
    index("approvals_approval_type_idx").on(table.approvalType),
    index("approvals_created_at_idx").on(table.createdAt)
  ]
);

export const externalConnections = pgTable(
  "external_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    provider: varchar("provider", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("setup"),
    authType: varchar("auth_type", { length: 32 }).notNull().default("none"),
    externalAccountId: varchar("external_account_id", { length: 255 }),
    externalAccountLabel: varchar("external_account_label", { length: 255 }),
    configJson: jsonb("config_json").$type<Record<string, unknown>>().notNull().default(emptyJson),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default(emptyJson),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    check(
      "external_connections_provider_check",
      sql`${table.provider} in ('manual', 'generic', 'hubspot', 'pipedrive', 'odoo', 'zoho', 'sellsy', 'google_sheets', 'airtable', 'notion', 'make', 'zapier', 'custom')`
    ),
    check("external_connections_status_check", sql`${table.status} in ('setup', 'active', 'paused', 'error', 'archived')`),
    check("external_connections_auth_type_check", sql`${table.authType} in ('none', 'external', 'secret_ref', 'oauth2', 'api_key')`),
    index("external_connections_workspace_id_idx").on(table.workspaceId),
    index("external_connections_provider_idx").on(table.provider),
    index("external_connections_status_idx").on(table.status),
    index("external_connections_created_at_idx").on(table.createdAt)
  ]
);

export const externalObjectMappings = pgTable(
  "external_object_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => externalConnections.id),
    externalObjectType: varchar("external_object_type", { length: 80 }).notNull(),
    externalObjectId: varchar("external_object_id", { length: 255 }).notNull(),
    syrantisEntityType: varchar("syrantis_entity_type", { length: 80 }).notNull(),
    syrantisEntityId: uuid("syrantis_entity_id").notNull(),
    syncDirection: varchar("sync_direction", { length: 32 }).notNull().default("inbound"),
    syncStatus: varchar("sync_status", { length: 32 }).notNull().default("active"),
    externalUrl: text("external_url"),
    externalUpdatedAt: timestamp("external_updated_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default(emptyJson),
    ...timestamps
  },
  (table) => [
    check(
      "external_object_mappings_external_object_type_check",
      sql`${table.externalObjectType} in ('lead', 'contact', 'organization', 'deal', 'task', 'note', 'form_submission', 'row', 'email', 'custom')`
    ),
    check(
      "external_object_mappings_syrantis_entity_type_check",
      sql`${table.syrantisEntityType} in ('organization', 'contact', 'lead', 'task', 'approval')`
    ),
    check(
      "external_object_mappings_sync_direction_check",
      sql`${table.syncDirection} in ('inbound', 'outbound', 'bidirectional')`
    ),
    check(
      "external_object_mappings_sync_status_check",
      sql`${table.syncStatus} in ('active', 'stale', 'conflict', 'archived')`
    ),
    index("external_object_mappings_workspace_id_idx").on(table.workspaceId),
    index("external_object_mappings_connection_id_idx").on(table.connectionId),
    index("external_object_mappings_entity_idx").on(table.syrantisEntityType, table.syrantisEntityId),
    index("external_object_mappings_external_object_idx").on(table.externalObjectType, table.externalObjectId),
    index("external_object_mappings_created_at_idx").on(table.createdAt),
    uniqueIndex("external_object_mappings_unique_idx").on(
      table.workspaceId,
      table.connectionId,
      table.externalObjectType,
      table.externalObjectId,
      table.syrantisEntityType
    )
  ]
);

export const integrationEvents = pgTable(
  "integration_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    connectionId: uuid("connection_id").references(() => externalConnections.id),
    mappingId: uuid("mapping_id").references(() => externalObjectMappings.id),
    direction: varchar("direction", { length: 32 }).notNull(),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    externalObjectType: varchar("external_object_type", { length: 80 }),
    externalObjectId: varchar("external_object_id", { length: 255 }),
    syrantisEntityType: varchar("syrantis_entity_type", { length: 80 }),
    syrantisEntityId: uuid("syrantis_entity_id"),
    message: text("message"),
    payloadHash: varchar("payload_hash", { length: 255 }),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default(emptyJson),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "integration_events_direction_check",
      sql`${table.direction} in ('inbound', 'outbound', 'internal')`
    ),
    check(
      "integration_events_status_check",
      sql`${table.status} in ('received', 'processed', 'failed', 'skipped')`
    ),
    index("integration_events_workspace_id_idx").on(table.workspaceId),
    index("integration_events_connection_id_idx").on(table.connectionId),
    index("integration_events_mapping_id_idx").on(table.mappingId),
    index("integration_events_event_type_idx").on(table.eventType),
    index("integration_events_status_idx").on(table.status),
    index("integration_events_created_at_idx").on(table.createdAt)
  ]
);

export const workspaceApiKeys = pgTable(
  "workspace_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: varchar("name", { length: 160 }).notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: varchar("key_prefix", { length: 24 }).notNull(),
    last4: varchar("last4", { length: 8 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    check("workspace_api_keys_status_check", sql`${table.status} in ('active', 'revoked')`),
    index("workspace_api_keys_workspace_id_idx").on(table.workspaceId),
    index("workspace_api_keys_status_idx").on(table.status),
    index("workspace_api_keys_created_at_idx").on(table.createdAt),
    uniqueIndex("workspace_api_keys_key_hash_idx").on(table.keyHash)
  ]
);

export const emailSends = pgTable(
  "email_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    approvalId: uuid("approval_id")
      .notNull()
      .references(() => approvals.id),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id),
    fromEmail: varchar("from_email", { length: 320 }).notNull(),
    toEmail: varchar("to_email", { length: 320 }).notNull(),
    replyToEmail: varchar("reply_to_email", { length: 320 }),
    subject: text("subject").notNull(),
    textBody: text("text_body"),
    htmlBody: text("html_body"),
    provider: varchar("provider", { length: 80 }).notNull().default("resend"),
    providerMessageId: varchar("provider_message_id", { length: 255 }).unique(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull().unique(),
    approvalCheckedAt: timestamp("approval_checked_at", { withTimezone: true }),
    suppressionCheckedAt: timestamp("suppression_checked_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(1),
    lastErrorCode: varchar("last_error_code", { length: 120 }),
    lastErrorMessage: text("last_error_message"),
    status: varchar("status", { length: 24 }).notNull().default("queued"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("email_sends_status_check", sql`${table.status} in ('queued', 'sent', 'failed', 'cancelled')`),
    index("email_sends_workspace_id_idx").on(table.workspaceId),
    index("email_sends_approval_id_idx").on(table.approvalId),
    index("email_sends_draft_id_idx").on(table.draftId),
    index("email_sends_workspace_status_idx").on(table.workspaceId, table.status),
    index("email_sends_provider_idx").on(table.provider),
    index("email_sends_provider_message_id_idx").on(table.providerMessageId),
    index("email_sends_idempotency_key_idx").on(table.idempotencyKey),
    index("email_sends_sent_at_idx").on(table.sentAt),
    index("email_sends_failed_at_idx").on(table.failedAt),
    index("email_sends_created_at_idx").on(table.createdAt)
  ]
);

export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    emailSendId: uuid("email_send_id").references(() => emailSends.id),
    provider: varchar("provider", { length: 80 }).notNull(),
    providerEventId: varchar("provider_event_id", { length: 255 }),
    eventType: varchar("event_type", { length: 24 }).notNull(),
    eventHash: varchar("event_hash", { length: 255 }).notNull().unique(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    recipientEmail: varchar("recipient_email", { length: 320 }),
    timestamp: timestamp("timestamp", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "email_events_event_type_check",
      sql`${table.eventType} in ('delivered', 'bounce', 'complaint', 'open', 'click', 'reply')`
    ),
    index("email_events_workspace_id_idx").on(table.workspaceId),
    index("email_events_email_send_id_idx").on(table.emailSendId),
    index("email_events_provider_idx").on(table.provider),
    index("email_events_provider_event_id_idx").on(table.providerEventId),
    index("email_events_event_type_idx").on(table.eventType),
    index("email_events_event_hash_idx").on(table.eventHash),
    index("email_events_timestamp_idx").on(table.timestamp),
    index("email_events_created_at_idx").on(table.createdAt)
  ]
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: uuid("user_id").references(() => users.id),
    entityType: varchar("entity_type", { length: 80 }),
    entityId: uuid("entity_id"),
    type: varchar("type", { length: 80 }).notNull(),
    severity: varchar("severity", { length: 24 }).notNull().default("info"),
    message: text("message").notNull(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default(emptyJson),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("activity_logs_severity_check", sql`${table.severity} in ('debug', 'info', 'warn', 'error', 'critical')`),
    index("activity_logs_workspace_id_idx").on(table.workspaceId),
    index("activity_logs_user_id_idx").on(table.userId),
    index("activity_logs_entity_idx").on(table.entityType, table.entityId),
    index("activity_logs_type_idx").on(table.type),
    index("activity_logs_severity_idx").on(table.severity),
    index("activity_logs_created_at_idx").on(table.createdAt)
  ]
);

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    skillName: varchar("skill_name", { length: 160 }).notNull(),
    promptFile: text("prompt_file").notNull(),
    promptHash: varchar("prompt_hash", { length: 128 }).notNull(),
    gitCommit: varchar("git_commit", { length: 64 }),
    inputHash: varchar("input_hash", { length: 128 }),
    inputPayload: jsonb("input_payload").$type<Record<string, unknown>>(),
    outputPayload: jsonb("output_payload").$type<Record<string, unknown>>(),
    outputText: text("output_text"),
    modelUsed: varchar("model_used", { length: 120 }),
    costCents: integer("cost_cents"),
    latencyMs: integer("latency_ms"),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }),
    status: varchar("status", { length: 24 }).notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("ai_runs_status_check", sql`${table.status} in ('success', 'error', 'cached', 'fallback')`),
    index("ai_runs_workspace_id_idx").on(table.workspaceId),
    index("ai_runs_skill_name_idx").on(table.skillName),
    index("ai_runs_prompt_hash_idx").on(table.promptHash),
    index("ai_runs_git_commit_idx").on(table.gitCommit),
    index("ai_runs_input_hash_idx").on(table.inputHash),
    index("ai_runs_status_idx").on(table.status),
    index("ai_runs_created_at_idx").on(table.createdAt)
  ]
);

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    type: varchar("type", { length: 24 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    name: varchar("name", { length: 255 }).notNull(),
    subject: text("subject"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    variablesJson: jsonb("variables_json").$type<Record<string, unknown>>().notNull().default(emptyJson),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default(emptyJson),
    ...timestamps
  },
  (table) => [
    check("templates_type_check", sql`${table.type} in ('reply', 'followup', 'diagnostic', 'report', 'other')`),
    check("templates_status_check", sql`${table.status} in ('active', 'draft', 'archived')`),
    index("templates_workspace_id_idx").on(table.workspaceId),
    index("templates_workspace_type_idx").on(table.workspaceId, table.type),
    index("templates_workspace_status_idx").on(table.workspaceId, table.status),
    index("templates_created_at_idx").on(table.createdAt)
  ]
);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    authorId: uuid("author_id").references(() => users.id),
    body: text("body").notNull(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default(emptyJson),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check(
      "notes_entity_type_check",
      sql`${table.entityType} in ('organization', 'contact', 'lead', 'opportunity', 'task')`
    ),
    index("notes_workspace_id_idx").on(table.workspaceId),
    index("notes_entity_idx").on(table.entityType, table.entityId),
    index("notes_author_id_idx").on(table.authorId),
    index("notes_created_at_idx").on(table.createdAt)
  ]
);
