import { and, desc, eq, ne, type SQL } from "drizzle-orm";

import {
  approvals,
  contacts,
  externalConnections,
  externalObjectMappings,
  integrationEvents,
  leads,
  organizations,
  tasks
} from "@syrantis/db";
import type {
  ExternalConnectionCreateInput,
  ExternalConnectionListQuery,
  ExternalConnectionUpdateInput,
  ExternalObjectMappingCreateInput,
  ExternalObjectMappingListQuery,
  ExternalObjectMappingUpdateInput,
  ExternalObjectType,
  IntegrationEventListQuery,
  SyrantisEntityType
} from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

export type ExternalConnectionRow = typeof externalConnections.$inferSelect;
export type ExternalObjectMappingRow = typeof externalObjectMappings.$inferSelect;
export type IntegrationEventRow = typeof integrationEvents.$inferSelect;

export type ExternalConnectionMutationResult =
  | { result: "ok"; connection: ExternalConnectionRow }
  | { result: "not_found" }
  | { result: "conflict" };

export type ExternalObjectMappingMutationResult =
  | { result: "ok"; mapping: ExternalObjectMappingRow }
  | { result: "not_found" }
  | { result: "conflict" };

export type ExternalConnectionCreateRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  data: ExternalConnectionCreateInput;
};

export type ExternalConnectionUpdateRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  id: string;
  data: ExternalConnectionUpdateInput;
};

export type ExternalConnectionArchiveRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  id: string;
};

export type ExternalObjectMappingCreateRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  data: ExternalObjectMappingCreateInput;
};

export type ExternalObjectMappingUpdateRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  id: string;
  data: ExternalObjectMappingUpdateInput;
};

export type ExternalObjectMappingArchiveRepositoryInput = {
  workspaceId: string;
  actorUserId: string;
  id: string;
};

type DuplicateMappingInput = {
  connectionId: string;
  externalObjectType: ExternalObjectType;
  externalObjectId: string;
  syrantisEntityType: SyrantisEntityType;
};

function resolveLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 50, 1), 100);
}

function resolveOffset(offset: number | undefined): number {
  return Math.max(offset ?? 0, 0);
}

function connectionFilters(input: {
  workspaceId: string;
  id?: string;
  provider?: string | undefined;
  status?: string | undefined;
  authType?: string | undefined;
}): SQL[] {
  const filters = [eq(externalConnections.workspaceId, input.workspaceId), ne(externalConnections.status, "archived")];

  if (input.id) {
    filters.push(eq(externalConnections.id, input.id));
  }

  if (input.provider) {
    filters.push(eq(externalConnections.provider, input.provider));
  }

  if (input.status) {
    filters.push(eq(externalConnections.status, input.status));
  }

  if (input.authType) {
    filters.push(eq(externalConnections.authType, input.authType));
  }

  return filters;
}

function mappingFilters(input: {
  workspaceId: string;
  id?: string;
  connectionId?: string | undefined;
  externalObjectType?: string | undefined;
  syrantisEntityType?: string | undefined;
  syrantisEntityId?: string | undefined;
}): SQL[] {
  const filters = [eq(externalObjectMappings.workspaceId, input.workspaceId), ne(externalObjectMappings.syncStatus, "archived")];

  if (input.id) {
    filters.push(eq(externalObjectMappings.id, input.id));
  }

  if (input.connectionId) {
    filters.push(eq(externalObjectMappings.connectionId, input.connectionId));
  }

  if (input.externalObjectType) {
    filters.push(eq(externalObjectMappings.externalObjectType, input.externalObjectType));
  }

  if (input.syrantisEntityType) {
    filters.push(eq(externalObjectMappings.syrantisEntityType, input.syrantisEntityType));
  }

  if (input.syrantisEntityId) {
    filters.push(eq(externalObjectMappings.syrantisEntityId, input.syrantisEntityId));
  }

  return filters;
}

function eventFilters(input: {
  workspaceId: string;
  connectionId?: string | undefined;
  mappingId?: string | undefined;
  direction?: string | undefined;
  eventType?: string | undefined;
  status?: string | undefined;
}): SQL[] {
  const filters = [eq(integrationEvents.workspaceId, input.workspaceId)];

  if (input.connectionId) {
    filters.push(eq(integrationEvents.connectionId, input.connectionId));
  }

  if (input.mappingId) {
    filters.push(eq(integrationEvents.mappingId, input.mappingId));
  }

  if (input.direction) {
    filters.push(eq(integrationEvents.direction, input.direction));
  }

  if (input.eventType) {
    filters.push(eq(integrationEvents.eventType, input.eventType));
  }

  if (input.status) {
    filters.push(eq(integrationEvents.status, input.status));
  }

  return filters;
}

async function canonicalEntityExists(
  tx: WorkspaceDbTransaction,
  workspaceId: string,
  entityType: SyrantisEntityType,
  entityId: string
): Promise<boolean> {
  switch (entityType) {
    case "organization": {
      const [organization] = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(
          and(
            eq(organizations.id, entityId),
            eq(organizations.workspaceId, workspaceId),
            ne(organizations.status, "archived")
          )
        )
        .limit(1);

      return Boolean(organization);
    }
    case "contact": {
      const [contact] = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.id, entityId), eq(contacts.workspaceId, workspaceId)))
        .limit(1);

      return Boolean(contact);
    }
    case "lead": {
      const [lead] = await tx
        .select({ id: leads.id })
        .from(leads)
        .where(and(eq(leads.id, entityId), eq(leads.workspaceId, workspaceId)))
        .limit(1);

      return Boolean(lead);
    }
    case "task": {
      const [task] = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, entityId), eq(tasks.workspaceId, workspaceId)))
        .limit(1);

      return Boolean(task);
    }
    case "approval": {
      const [approval] = await tx
        .select({ id: approvals.id })
        .from(approvals)
        .where(and(eq(approvals.id, entityId), eq(approvals.workspaceId, workspaceId)))
        .limit(1);

      return Boolean(approval);
    }
  }
}

async function findActiveConnectionById(
  tx: WorkspaceDbTransaction,
  workspaceId: string,
  id: string
): Promise<ExternalConnectionRow | null> {
  const [connection] = await tx
    .select()
    .from(externalConnections)
    .where(and(eq(externalConnections.workspaceId, workspaceId), eq(externalConnections.id, id), ne(externalConnections.status, "archived")))
    .limit(1);

  return connection ?? null;
}

async function findDuplicateMapping(
  tx: WorkspaceDbTransaction,
  workspaceId: string,
  input: DuplicateMappingInput,
  excludeId?: string
): Promise<boolean> {
  const filters = [
    eq(externalObjectMappings.workspaceId, workspaceId),
    eq(externalObjectMappings.connectionId, input.connectionId as string),
    eq(externalObjectMappings.externalObjectType, input.externalObjectType as string),
    eq(externalObjectMappings.externalObjectId, input.externalObjectId as string),
    eq(externalObjectMappings.syrantisEntityType, input.syrantisEntityType as string)
  ];

  if (excludeId) {
    filters.push(ne(externalObjectMappings.id, excludeId));
  }

  const [existing] = await tx
    .select({ id: externalObjectMappings.id })
    .from(externalObjectMappings)
    .where(and(...filters))
    .limit(1);

  return Boolean(existing);
}

async function createIntegrationEvent(
  tx: WorkspaceDbTransaction,
  data: {
    workspaceId: string;
    connectionId?: string | null;
    mappingId?: string | null;
    direction: "inbound" | "outbound" | "internal";
    eventType: string;
    status: "received" | "processed" | "failed" | "skipped";
    externalObjectType?: ExternalObjectType | null;
    externalObjectId?: string | null;
    syrantisEntityType?: SyrantisEntityType | null;
    syrantisEntityId?: string | null;
    message?: string | null;
    payloadHash?: string | null;
    metadataJson?: Record<string, unknown>;
  }
): Promise<IntegrationEventRow> {
  const [event] = await tx
    .insert(integrationEvents)
    .values({
      workspaceId: data.workspaceId,
      connectionId: data.connectionId ?? null,
      mappingId: data.mappingId ?? null,
      direction: data.direction,
      eventType: data.eventType,
      status: data.status,
      externalObjectType: data.externalObjectType ?? null,
      externalObjectId: data.externalObjectId ?? null,
      syrantisEntityType: data.syrantisEntityType ?? null,
      syrantisEntityId: data.syrantisEntityId ?? null,
      message: data.message ?? null,
      payloadHash: data.payloadHash ?? null,
      metadataJson: data.metadataJson ?? {}
    })
    .returning();

  if (!event) {
    throw new Error("Failed to create integration event.");
  }

  return event;
}

export async function listExternalConnections(input: {
  workspaceId: string;
  provider?: ExternalConnectionListQuery["provider"];
  status?: ExternalConnectionListQuery["status"];
  authType?: ExternalConnectionListQuery["authType"];
  limit?: number;
  offset?: number;
}): Promise<ExternalConnectionRow[]> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    return tx
      .select()
      .from(externalConnections)
      .where(and(...connectionFilters(input)))
      .orderBy(desc(externalConnections.createdAt))
      .limit(resolveLimit(input.limit))
      .offset(resolveOffset(input.offset));
  });
}

export async function findExternalConnectionById(
  input: { workspaceId: string; id: string }
): Promise<ExternalConnectionRow | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [connection] = await tx
      .select()
      .from(externalConnections)
      .where(and(...connectionFilters(input)))
      .limit(1);

    return connection ?? null;
  });
}

export async function createExternalConnection(
  input: ExternalConnectionCreateRepositoryInput
): Promise<ExternalConnectionMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const values: typeof externalConnections.$inferInsert = {
      workspaceId: input.workspaceId,
      provider: input.data.provider,
      name: input.data.name,
      status: input.data.status ?? "setup",
      authType: input.data.authType ?? "none",
      ...(input.data.externalAccountId !== undefined ? { externalAccountId: input.data.externalAccountId } : {}),
      ...(input.data.externalAccountLabel !== undefined
        ? { externalAccountLabel: input.data.externalAccountLabel }
        : {}),
      ...(input.data.config !== undefined ? { configJson: input.data.config } : {}),
      ...(input.data.metadata !== undefined ? { metadataJson: input.data.metadata } : {}),
      ...(input.data.lastSyncAt !== undefined
        ? { lastSyncAt: input.data.lastSyncAt ? new Date(input.data.lastSyncAt) : null }
        : {})
    };

    const [connection] = await tx.insert(externalConnections).values(values).returning();

    if (!connection) {
      throw new Error("Failed to create external connection.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "external_connection.created",
      entityType: "external_connection",
      entityId: connection.id,
      metadataJson: { provider: connection.provider, status: connection.status }
    });

    await createIntegrationEvent(tx, {
      workspaceId: input.workspaceId,
      connectionId: connection.id,
      direction: "internal",
      eventType: "external_connection.created",
      status: "processed",
      metadataJson: { provider: connection.provider, status: connection.status }
    });

    return { result: "ok", connection };
  });
}

export async function updateExternalConnection(
  input: ExternalConnectionUpdateRepositoryInput
): Promise<ExternalConnectionMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const values: Partial<typeof externalConnections.$inferInsert> = {
      ...(input.data.provider !== undefined ? { provider: input.data.provider } : {}),
      ...(input.data.name !== undefined ? { name: input.data.name } : {}),
      ...(input.data.status !== undefined ? { status: input.data.status } : {}),
      ...(input.data.authType !== undefined ? { authType: input.data.authType } : {}),
      ...(input.data.externalAccountId !== undefined ? { externalAccountId: input.data.externalAccountId } : {}),
      ...(input.data.externalAccountLabel !== undefined ? { externalAccountLabel: input.data.externalAccountLabel } : {}),
      ...(input.data.config !== undefined ? { configJson: input.data.config } : {}),
      ...(input.data.metadata !== undefined ? { metadataJson: input.data.metadata } : {}),
      ...(input.data.lastSyncAt !== undefined
        ? { lastSyncAt: input.data.lastSyncAt ? new Date(input.data.lastSyncAt) : null }
        : {})
    };

    const [connection] = await tx
      .update(externalConnections)
      .set(values)
      .where(and(...connectionFilters({ workspaceId: input.workspaceId, id: input.id })))
      .returning();

    if (!connection) {
      return { result: "not_found" };
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "external_connection.updated",
      entityType: "external_connection",
      entityId: connection.id,
      metadataJson: { status: connection.status }
    });

    await createIntegrationEvent(tx, {
      workspaceId: input.workspaceId,
      connectionId: connection.id,
      direction: "internal",
      eventType: "external_connection.updated",
      status: "processed",
      metadataJson: { status: connection.status }
    });

    return { result: "ok", connection };
  });
}

export async function archiveExternalConnection(
  input: ExternalConnectionArchiveRepositoryInput
): Promise<ExternalConnectionMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [connection] = await tx
      .update(externalConnections)
      .set({ status: "archived" })
      .where(and(...connectionFilters({ workspaceId: input.workspaceId, id: input.id })))
      .returning();

    if (!connection) {
      return { result: "not_found" };
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "external_connection.archived",
      entityType: "external_connection",
      entityId: connection.id,
      metadataJson: { status: connection.status }
    });

    await createIntegrationEvent(tx, {
      workspaceId: input.workspaceId,
      connectionId: connection.id,
      direction: "internal",
      eventType: "external_connection.archived",
      status: "processed",
      metadataJson: { status: connection.status }
    });

    return { result: "ok", connection };
  });
}

export async function listExternalObjectMappings(input: {
  workspaceId: string;
  connectionId?: ExternalObjectMappingListQuery["connectionId"];
  externalObjectType?: ExternalObjectMappingListQuery["externalObjectType"];
  syrantisEntityType?: ExternalObjectMappingListQuery["syrantisEntityType"];
  syrantisEntityId?: ExternalObjectMappingListQuery["syrantisEntityId"];
  limit?: number;
  offset?: number;
}): Promise<ExternalObjectMappingRow[]> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    return tx
      .select()
      .from(externalObjectMappings)
      .where(and(...mappingFilters(input)))
      .orderBy(desc(externalObjectMappings.createdAt))
      .limit(resolveLimit(input.limit))
      .offset(resolveOffset(input.offset));
  });
}

export async function findExternalObjectMappingById(
  input: { workspaceId: string; id: string }
): Promise<ExternalObjectMappingRow | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [mapping] = await tx
      .select()
      .from(externalObjectMappings)
      .where(and(...mappingFilters(input)))
      .limit(1);

    return mapping ?? null;
  });
}

export async function createExternalObjectMapping(
  input: ExternalObjectMappingCreateRepositoryInput
): Promise<ExternalObjectMappingMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const connection = await findActiveConnectionById(tx, input.workspaceId, input.data.connectionId);

    if (!connection) {
      return { result: "not_found" };
    }

    const entityExists = await canonicalEntityExists(
      tx,
      input.workspaceId,
      input.data.syrantisEntityType,
      input.data.syrantisEntityId
    );

    if (!entityExists) {
      return { result: "not_found" };
    }

    const duplicate = await findDuplicateMapping(tx, input.workspaceId, input.data as DuplicateMappingInput);

    if (duplicate) {
      return { result: "conflict" };
    }

    const values: typeof externalObjectMappings.$inferInsert = {
      workspaceId: input.workspaceId,
      connectionId: input.data.connectionId,
      externalObjectType: input.data.externalObjectType,
      externalObjectId: input.data.externalObjectId,
      syrantisEntityType: input.data.syrantisEntityType,
      syrantisEntityId: input.data.syrantisEntityId,
      syncDirection: input.data.syncDirection ?? "inbound",
      syncStatus: input.data.syncStatus ?? "active",
      ...(input.data.externalUrl !== undefined ? { externalUrl: input.data.externalUrl } : {}),
      ...(input.data.externalUpdatedAt !== undefined
        ? { externalUpdatedAt: input.data.externalUpdatedAt ? new Date(input.data.externalUpdatedAt) : null }
        : {}),
      ...(input.data.lastSeenAt !== undefined
        ? { lastSeenAt: input.data.lastSeenAt ? new Date(input.data.lastSeenAt) : null }
        : {}),
      ...(input.data.metadata !== undefined ? { metadataJson: input.data.metadata } : {})
    };

    const [mapping] = await tx.insert(externalObjectMappings).values(values).returning();

    if (!mapping) {
      throw new Error("Failed to create external object mapping.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "external_object_mapping.created",
      entityType: "external_object_mapping",
      entityId: mapping.id,
      metadataJson: {
        connectionId: mapping.connectionId,
        externalObjectType: mapping.externalObjectType,
        syrantisEntityType: mapping.syrantisEntityType
      }
    });

    await createIntegrationEvent(tx, {
      workspaceId: input.workspaceId,
      connectionId: mapping.connectionId,
      mappingId: mapping.id,
      direction: "internal",
      eventType: "external_object_mapping.created",
      status: "processed",
      externalObjectType: mapping.externalObjectType as ExternalObjectType,
      externalObjectId: mapping.externalObjectId,
      syrantisEntityType: mapping.syrantisEntityType as SyrantisEntityType,
      syrantisEntityId: mapping.syrantisEntityId,
      message: "External object mapping created.",
      metadataJson: mapping.metadataJson
    });

    return { result: "ok", mapping };
  });
}

export async function updateExternalObjectMapping(
  input: ExternalObjectMappingUpdateRepositoryInput
): Promise<ExternalObjectMappingMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const existing = await findExternalObjectMappingById({ workspaceId: input.workspaceId, id: input.id });

    if (!existing) {
      return { result: "not_found" };
    }

    const updatedSyrantisEntityType = input.data.syrantisEntityType ?? existing.syrantisEntityType;
    const updatedSyrantisEntityId = input.data.syrantisEntityId ?? existing.syrantisEntityId;

    if (
      updatedSyrantisEntityType !== existing.syrantisEntityType ||
      updatedSyrantisEntityId !== existing.syrantisEntityId
    ) {
      const entityExists = await canonicalEntityExists(
        tx,
        input.workspaceId,
        updatedSyrantisEntityType as SyrantisEntityType,
        updatedSyrantisEntityId
      );

      if (!entityExists) {
        return { result: "not_found" };
      }
    }

    const duplicate = await findDuplicateMapping(tx, input.workspaceId, {
      connectionId: existing.connectionId,
      externalObjectType: (input.data.externalObjectType ?? existing.externalObjectType) as ExternalObjectType,
      externalObjectId: input.data.externalObjectId ?? existing.externalObjectId,
      syrantisEntityType: updatedSyrantisEntityType as SyrantisEntityType
    }, input.id);

    if (duplicate) {
      return { result: "conflict" };
    }

    const values: Partial<typeof externalObjectMappings.$inferInsert> = {
      ...(input.data.externalObjectType !== undefined ? { externalObjectType: input.data.externalObjectType } : {}),
      ...(input.data.externalObjectId !== undefined ? { externalObjectId: input.data.externalObjectId } : {}),
      ...(input.data.syrantisEntityType !== undefined ? { syrantisEntityType: input.data.syrantisEntityType } : {}),
      ...(input.data.syrantisEntityId !== undefined ? { syrantisEntityId: input.data.syrantisEntityId } : {}),
      ...(input.data.syncDirection !== undefined ? { syncDirection: input.data.syncDirection } : {}),
      ...(input.data.syncStatus !== undefined ? { syncStatus: input.data.syncStatus } : {}),
      ...(input.data.externalUrl !== undefined ? { externalUrl: input.data.externalUrl } : {}),
      ...(input.data.externalUpdatedAt !== undefined
        ? { externalUpdatedAt: input.data.externalUpdatedAt ? new Date(input.data.externalUpdatedAt) : null }
        : {}),
      ...(input.data.lastSeenAt !== undefined
        ? { lastSeenAt: input.data.lastSeenAt ? new Date(input.data.lastSeenAt) : null }
        : {}),
      ...(input.data.metadata !== undefined ? { metadataJson: input.data.metadata } : {})
    };

    const [mapping] = await tx
      .update(externalObjectMappings)
      .set(values)
      .where(and(...mappingFilters({ workspaceId: input.workspaceId, id: input.id })))
      .returning();

    if (!mapping) {
      return { result: "not_found" };
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "external_object_mapping.updated",
      entityType: "external_object_mapping",
      entityId: mapping.id,
      metadataJson: {
        connectionId: mapping.connectionId,
        externalObjectType: mapping.externalObjectType,
        syrantisEntityType: mapping.syrantisEntityType
      }
    });

    await createIntegrationEvent(tx, {
      workspaceId: input.workspaceId,
      connectionId: mapping.connectionId,
      mappingId: mapping.id,
      direction: "internal",
      eventType: "external_object_mapping.updated",
      status: "processed",
      externalObjectType: mapping.externalObjectType as ExternalObjectType,
      externalObjectId: mapping.externalObjectId,
      syrantisEntityType: mapping.syrantisEntityType as SyrantisEntityType,
      syrantisEntityId: mapping.syrantisEntityId,
      message: "External object mapping updated.",
      metadataJson: mapping.metadataJson
    });

    return { result: "ok", mapping };
  });
}

export async function archiveExternalObjectMapping(
  input: ExternalObjectMappingArchiveRepositoryInput
): Promise<ExternalObjectMappingMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [mapping] = await tx
      .update(externalObjectMappings)
      .set({ syncStatus: "archived" })
      .where(and(...mappingFilters({ workspaceId: input.workspaceId, id: input.id })))
      .returning();

    if (!mapping) {
      return { result: "not_found" };
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "external_object_mapping.archived",
      entityType: "external_object_mapping",
      entityId: mapping.id,
      metadataJson: {
        connectionId: mapping.connectionId,
        externalObjectType: mapping.externalObjectType,
        syrantisEntityType: mapping.syrantisEntityType
      }
    });

    await createIntegrationEvent(tx, {
      workspaceId: input.workspaceId,
      connectionId: mapping.connectionId,
      mappingId: mapping.id,
      direction: "internal",
      eventType: "external_object_mapping.archived",
      status: "processed",
      externalObjectType: mapping.externalObjectType as ExternalObjectType,
      externalObjectId: mapping.externalObjectId,
      syrantisEntityType: mapping.syrantisEntityType as SyrantisEntityType,
      syrantisEntityId: mapping.syrantisEntityId,
      message: "External object mapping archived.",
      metadataJson: mapping.metadataJson
    });

    return { result: "ok", mapping };
  });
}

export async function listIntegrationEvents(input: {
  workspaceId: string;
  connectionId?: IntegrationEventListQuery["connectionId"];
  mappingId?: IntegrationEventListQuery["mappingId"];
  direction?: IntegrationEventListQuery["direction"];
  eventType?: IntegrationEventListQuery["eventType"];
  status?: IntegrationEventListQuery["status"];
  limit?: number;
  offset?: number;
}): Promise<IntegrationEventRow[]> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    return tx
      .select()
      .from(integrationEvents)
      .where(and(...eventFilters(input)))
      .orderBy(desc(integrationEvents.createdAt))
      .limit(resolveLimit(input.limit))
      .offset(resolveOffset(input.offset));
  });
}
