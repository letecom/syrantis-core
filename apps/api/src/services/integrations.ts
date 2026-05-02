import {
  ExternalConnectionOutputSchema,
  ExternalObjectMappingOutputSchema,
  IntegrationEventOutputSchema,
  type ExternalConnectionCreateInput,
  type ExternalConnectionListQuery,
  type ExternalConnectionOutput,
  type ExternalConnectionUpdateInput,
  type ExternalObjectMappingCreateInput,
  type ExternalObjectMappingListQuery,
  type ExternalObjectMappingOutput,
  type ExternalObjectMappingUpdateInput,
  type IntegrationEventListQuery,
  type IntegrationEventOutput
} from "@syrantis/shared";

import type {
  ExternalConnectionMutationResult,
  ExternalConnectionRow,
  ExternalObjectMappingMutationResult,
  ExternalObjectMappingRow,
  IntegrationEventRow
} from "../repositories/integrations.js";
import {
  archiveExternalConnection,
  archiveExternalObjectMapping,
  createExternalConnection,
  createExternalObjectMapping,
  findExternalConnectionById,
  findExternalObjectMappingById,
  listExternalConnections,
  listExternalObjectMappings,
  listIntegrationEvents,
  updateExternalConnection,
  updateExternalObjectMapping
} from "../repositories/integrations.js";

export type IntegrationServiceListResult =
  | { result: "ok"; connections: ExternalConnectionOutput[] }
  | { result: "not_found" };

export type IntegrationServiceMappingListResult =
  | { result: "ok"; mappings: ExternalObjectMappingOutput[] }
  | { result: "not_found" };

export type IntegrationServiceConnectionResult =
  | { result: "ok"; connection: ExternalConnectionOutput }
  | { result: "not_found" }
  | { result: "conflict" };

export type IntegrationServiceMappingResult =
  | { result: "ok"; mapping: ExternalObjectMappingOutput }
  | { result: "not_found" }
  | { result: "conflict" };

export type IntegrationService = {
  listConnections(workspaceId: string, query: ExternalConnectionListQuery): Promise<ExternalConnectionOutput[]>;
  getConnection(workspaceId: string, id: string): Promise<ExternalConnectionOutput | null>;
  createConnection(
    workspaceId: string,
    actorUserId: string,
    input: ExternalConnectionCreateInput
  ): Promise<IntegrationServiceConnectionResult>;
  updateConnection(
    workspaceId: string,
    actorUserId: string,
    id: string,
    input: ExternalConnectionUpdateInput
  ): Promise<IntegrationServiceConnectionResult>;
  archiveConnection(workspaceId: string, actorUserId: string, id: string): Promise<IntegrationServiceConnectionResult>;
  listMappings(workspaceId: string, query: ExternalObjectMappingListQuery): Promise<ExternalObjectMappingOutput[]>;
  getMapping(workspaceId: string, id: string): Promise<ExternalObjectMappingOutput | null>;
  createMapping(
    workspaceId: string,
    actorUserId: string,
    input: ExternalObjectMappingCreateInput
  ): Promise<IntegrationServiceMappingResult>;
  updateMapping(
    workspaceId: string,
    actorUserId: string,
    id: string,
    input: ExternalObjectMappingUpdateInput
  ): Promise<IntegrationServiceMappingResult>;
  archiveMapping(workspaceId: string, actorUserId: string, id: string): Promise<IntegrationServiceMappingResult>;
  listEvents(workspaceId: string, query: IntegrationEventListQuery): Promise<IntegrationEventOutput[]>;
};

function requireIsoDatetime(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapConnectionRow(row: ExternalConnectionRow): ExternalConnectionOutput {
  return ExternalConnectionOutputSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider,
    name: row.name,
    status: row.status,
    authType: row.authType,
    externalAccountId: row.externalAccountId,
    externalAccountLabel: row.externalAccountLabel,
    config: row.configJson,
    metadata: row.metadataJson,
    lastSyncAt: requireIsoDatetime(row.lastSyncAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function mapMappingRow(row: ExternalObjectMappingRow): ExternalObjectMappingOutput {
  return ExternalObjectMappingOutputSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    connectionId: row.connectionId,
    externalObjectType: row.externalObjectType,
    externalObjectId: row.externalObjectId,
    syrantisEntityType: row.syrantisEntityType,
    syrantisEntityId: row.syrantisEntityId,
    syncDirection: row.syncDirection,
    syncStatus: row.syncStatus,
    externalUrl: row.externalUrl,
    externalUpdatedAt: requireIsoDatetime(row.externalUpdatedAt),
    lastSeenAt: requireIsoDatetime(row.lastSeenAt),
    metadata: row.metadataJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function mapEventRow(row: IntegrationEventRow): IntegrationEventOutput {
  return IntegrationEventOutputSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    connectionId: row.connectionId,
    mappingId: row.mappingId,
    direction: row.direction,
    eventType: row.eventType,
    status: row.status,
    externalObjectType: row.externalObjectType,
    externalObjectId: row.externalObjectId,
    syrantisEntityType: row.syrantisEntityType,
    syrantisEntityId: row.syrantisEntityId,
    message: row.message,
    payloadHash: row.payloadHash,
    metadata: row.metadataJson,
    createdAt: row.createdAt.toISOString()
  });
}

function mapConnectionResult(result: ExternalConnectionMutationResult): IntegrationServiceConnectionResult {
  if (result.result !== "ok") {
    return result;
  }

  return { result: "ok", connection: mapConnectionRow(result.connection) };
}

function mapMappingResult(result: ExternalObjectMappingMutationResult): IntegrationServiceMappingResult {
  if (result.result !== "ok") {
    return result;
  }

  return { result: "ok", mapping: mapMappingRow(result.mapping) };
}

export function createProductionIntegrationService(): IntegrationService {
  return {
    async listConnections(workspaceId, query) {
      const rows = await listExternalConnections({
        workspaceId,
        ...(query.provider !== undefined ? { provider: query.provider } : {}),
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.authType !== undefined ? { authType: query.authType } : {}),
        limit: query.limit,
        offset: query.offset
      });

      return rows.map(mapConnectionRow);
    },

    async getConnection(workspaceId, id) {
      const row = await findExternalConnectionById({ workspaceId, id });
      return row ? mapConnectionRow(row) : null;
    },

    async createConnection(workspaceId, actorUserId, input) {
      return mapConnectionResult(
        await createExternalConnection({ workspaceId, actorUserId, data: input })
      );
    },

    async updateConnection(workspaceId, actorUserId, id, input) {
      return mapConnectionResult(
        await updateExternalConnection({ workspaceId, actorUserId, id, data: input })
      );
    },

    async archiveConnection(workspaceId, actorUserId, id) {
      return mapConnectionResult(await archiveExternalConnection({ workspaceId, actorUserId, id }));
    },

    async listMappings(workspaceId, query) {
      const rows = await listExternalObjectMappings({
        workspaceId,
        ...(query.connectionId !== undefined ? { connectionId: query.connectionId } : {}),
        ...(query.externalObjectType !== undefined ? { externalObjectType: query.externalObjectType } : {}),
        ...(query.syrantisEntityType !== undefined ? { syrantisEntityType: query.syrantisEntityType } : {}),
        ...(query.syrantisEntityId !== undefined ? { syrantisEntityId: query.syrantisEntityId } : {}),
        limit: query.limit,
        offset: query.offset
      });

      return rows.map(mapMappingRow);
    },

    async getMapping(workspaceId, id) {
      const row = await findExternalObjectMappingById({ workspaceId, id });
      return row ? mapMappingRow(row) : null;
    },

    async createMapping(workspaceId, actorUserId, input) {
      return mapMappingResult(
        await createExternalObjectMapping({ workspaceId, actorUserId, data: input })
      );
    },

    async updateMapping(workspaceId, actorUserId, id, input) {
      return mapMappingResult(
        await updateExternalObjectMapping({ workspaceId, actorUserId, id, data: input })
      );
    },

    async archiveMapping(workspaceId, actorUserId, id) {
      return mapMappingResult(await archiveExternalObjectMapping({ workspaceId, actorUserId, id }));
    },

    async listEvents(workspaceId, query) {
      const rows = await listIntegrationEvents({
        workspaceId,
        ...(query.connectionId !== undefined ? { connectionId: query.connectionId } : {}),
        ...(query.mappingId !== undefined ? { mappingId: query.mappingId } : {}),
        ...(query.direction !== undefined ? { direction: query.direction } : {}),
        ...(query.eventType !== undefined ? { eventType: query.eventType } : {}),
        ...(query.status !== undefined ? { status: query.status } : {}),
        limit: query.limit,
        offset: query.offset
      });

      return rows.map(mapEventRow);
    }
  };
}
