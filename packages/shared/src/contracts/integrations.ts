import { z } from "zod";

export const ExternalIntegrationProviderSchema = z.enum([
  "manual",
  "generic",
  "hubspot",
  "pipedrive",
  "odoo",
  "zoho",
  "sellsy",
  "google_sheets",
  "airtable",
  "notion",
  "make",
  "zapier",
  "custom"
]);

export const ExternalConnectionStatusSchema = z.enum(["setup", "active", "paused", "error", "archived"]);
export const ExternalConnectionAuthTypeSchema = z.enum(["none", "external", "secret_ref", "oauth2", "api_key"]);

export const ExternalConnectionCreateInputSchema = z.object({
  provider: ExternalIntegrationProviderSchema,
  name: z.string().min(1).max(255),
  status: ExternalConnectionStatusSchema.optional(),
  authType: ExternalConnectionAuthTypeSchema.optional(),
  externalAccountId: z.string().max(255).optional(),
  externalAccountLabel: z.string().max(255).optional(),
  config: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  lastSyncAt: z.string().datetime().optional()
});

export const ExternalConnectionUpdateInputSchema = z.object({
  provider: ExternalIntegrationProviderSchema.optional(),
  name: z.string().min(1).max(255).optional(),
  status: ExternalConnectionStatusSchema.optional(),
  authType: ExternalConnectionAuthTypeSchema.optional(),
  externalAccountId: z.string().max(255).nullable().optional(),
  externalAccountLabel: z.string().max(255).nullable().optional(),
  config: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  lastSyncAt: z.string().datetime().nullable().optional()
});

export const ExternalConnectionListQuerySchema = z.object({
  provider: ExternalIntegrationProviderSchema.optional(),
  status: ExternalConnectionStatusSchema.optional(),
  authType: ExternalConnectionAuthTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const ExternalConnectionOutputSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  provider: ExternalIntegrationProviderSchema,
  name: z.string(),
  status: ExternalConnectionStatusSchema,
  authType: ExternalConnectionAuthTypeSchema,
  externalAccountId: z.string().max(255).nullable(),
  externalAccountLabel: z.string().max(255).nullable(),
  config: z.record(z.unknown()),
  metadata: z.record(z.unknown()),
  lastSyncAt: z.string().datetime().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const ExternalConnectionSuccessSchema = z.object({
  success: z.literal(true),
  data: ExternalConnectionOutputSchema
});

export const ExternalConnectionListSuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(ExternalConnectionOutputSchema)
});

export const ExternalObjectTypeSchema = z.enum([
  "lead",
  "contact",
  "organization",
  "deal",
  "task",
  "note",
  "form_submission",
  "row",
  "email",
  "custom"
]);

export const SyrantisEntityTypeSchema = z.enum(["organization", "contact", "lead", "task", "approval"]);
export const IntegrationSyncDirectionSchema = z.enum(["inbound", "outbound", "bidirectional"]);
export const IntegrationSyncStatusSchema = z.enum(["active", "stale", "conflict", "archived"]);

export const ExternalObjectMappingCreateInputSchema = z.object({
  connectionId: z.string().uuid(),
  externalObjectType: ExternalObjectTypeSchema,
  externalObjectId: z.string().min(1).max(255),
  syrantisEntityType: SyrantisEntityTypeSchema,
  syrantisEntityId: z.string().uuid(),
  syncDirection: IntegrationSyncDirectionSchema.optional(),
  syncStatus: IntegrationSyncStatusSchema.optional(),
  externalUrl: z.string().max(2000).optional(),
  externalUpdatedAt: z.string().datetime().optional(),
  lastSeenAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional()
});

export const ExternalObjectMappingUpdateInputSchema = z.object({
  externalObjectType: ExternalObjectTypeSchema.optional(),
  externalObjectId: z.string().min(1).max(255).optional(),
  syrantisEntityType: SyrantisEntityTypeSchema.optional(),
  syrantisEntityId: z.string().uuid().optional(),
  syncDirection: IntegrationSyncDirectionSchema.optional(),
  syncStatus: IntegrationSyncStatusSchema.optional(),
  externalUrl: z.string().max(2000).nullable().optional(),
  externalUpdatedAt: z.string().datetime().nullable().optional(),
  lastSeenAt: z.string().datetime().nullable().optional(),
  metadata: z.record(z.unknown()).optional()
});

export const ExternalObjectMappingListQuerySchema = z.object({
  connectionId: z.string().uuid().optional(),
  externalObjectType: ExternalObjectTypeSchema.optional(),
  syrantisEntityType: SyrantisEntityTypeSchema.optional(),
  syrantisEntityId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const ExternalObjectMappingOutputSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  connectionId: z.string().uuid(),
  externalObjectType: ExternalObjectTypeSchema,
  externalObjectId: z.string(),
  syrantisEntityType: SyrantisEntityTypeSchema,
  syrantisEntityId: z.string().uuid(),
  syncDirection: IntegrationSyncDirectionSchema,
  syncStatus: IntegrationSyncStatusSchema,
  externalUrl: z.string().max(2000).nullable(),
  externalUpdatedAt: z.string().datetime().nullable(),
  lastSeenAt: z.string().datetime().nullable(),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const ExternalObjectMappingSuccessSchema = z.object({
  success: z.literal(true),
  data: ExternalObjectMappingOutputSchema
});

export const ExternalObjectMappingListSuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(ExternalObjectMappingOutputSchema)
});

export const IntegrationEventDirectionSchema = z.enum(["inbound", "outbound", "internal"]);
export const IntegrationEventStatusSchema = z.enum(["received", "processed", "failed", "skipped"]);

export const IntegrationEventListQuerySchema = z.object({
  connectionId: z.string().uuid().optional(),
  mappingId: z.string().uuid().optional(),
  direction: IntegrationEventDirectionSchema.optional(),
  eventType: z.string().optional(),
  status: IntegrationEventStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const IntegrationEventOutputSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  connectionId: z.string().uuid().nullable(),
  mappingId: z.string().uuid().nullable(),
  direction: IntegrationEventDirectionSchema,
  eventType: z.string(),
  status: IntegrationEventStatusSchema,
  externalObjectType: ExternalObjectTypeSchema.nullable(),
  externalObjectId: z.string().nullable(),
  syrantisEntityType: SyrantisEntityTypeSchema.nullable(),
  syrantisEntityId: z.string().uuid().nullable(),
  message: z.string().nullable(),
  payloadHash: z.string().max(255).nullable(),
  metadata: z.record(z.unknown()),
  createdAt: z.string()
});

export const IntegrationEventListSuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(IntegrationEventOutputSchema)
});

export type ExternalConnectionProvider = z.infer<typeof ExternalIntegrationProviderSchema>;
export type ExternalConnectionStatus = z.infer<typeof ExternalConnectionStatusSchema>;
export type ExternalConnectionAuthType = z.infer<typeof ExternalConnectionAuthTypeSchema>;
export type ExternalConnectionCreateInput = z.infer<typeof ExternalConnectionCreateInputSchema>;
export type ExternalConnectionUpdateInput = z.infer<typeof ExternalConnectionUpdateInputSchema>;
export type ExternalConnectionListQuery = z.infer<typeof ExternalConnectionListQuerySchema>;
export type ExternalConnectionOutput = z.infer<typeof ExternalConnectionOutputSchema>;
export type ExternalObjectType = z.infer<typeof ExternalObjectTypeSchema>;
export type SyrantisEntityType = z.infer<typeof SyrantisEntityTypeSchema>;
export type IntegrationSyncDirection = z.infer<typeof IntegrationSyncDirectionSchema>;
export type IntegrationSyncStatus = z.infer<typeof IntegrationSyncStatusSchema>;
export type ExternalObjectMappingCreateInput = z.infer<typeof ExternalObjectMappingCreateInputSchema>;
export type ExternalObjectMappingUpdateInput = z.infer<typeof ExternalObjectMappingUpdateInputSchema>;
export type ExternalObjectMappingListQuery = z.infer<typeof ExternalObjectMappingListQuerySchema>;
export type ExternalObjectMappingOutput = z.infer<typeof ExternalObjectMappingOutputSchema>;
export type IntegrationEventDirection = z.infer<typeof IntegrationEventDirectionSchema>;
export type IntegrationEventStatus = z.infer<typeof IntegrationEventStatusSchema>;
export type IntegrationEventListQuery = z.infer<typeof IntegrationEventListQuerySchema>;
export type IntegrationEventOutput = z.infer<typeof IntegrationEventOutputSchema>;
