import { and, eq, isNotNull, ne } from "drizzle-orm";

import {
  contacts,
  externalConnections,
  externalObjectMappings,
  integrationEvents,
  leads,
  organizations,
  workspaceApiKeys
} from "@syrantis/db";
import type { PublicLeadIntakeInput } from "@syrantis/shared";

import { withApiKeyLookupDb, withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

export type PublicApiKeyLookupRow = Pick<typeof workspaceApiKeys.$inferSelect, "id" | "workspaceId">;
export type PublicLeadIntakeResult =
  | { result: "created"; leadId: string }
  | { result: "idempotent_replay"; leadId: string }
  | { result: "invalid_request" }
  | { result: "not_found" }
  | { result: "conflict" };

const supportedExternalObjectTypes = new Set([
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

export async function findActiveWorkspaceApiKeyByHash(apiKeyHash: string): Promise<PublicApiKeyLookupRow | null> {
  return withApiKeyLookupDb(apiKeyHash, async (tx) => {
    const [key] = await tx
      .select({
        id: workspaceApiKeys.id,
        workspaceId: workspaceApiKeys.workspaceId
      })
      .from(workspaceApiKeys)
      .where(and(eq(workspaceApiKeys.keyHash, apiKeyHash), eq(workspaceApiKeys.status, "active")))
      .limit(1);

    return key ?? null;
  });
}

function summarizeRawContent(input: PublicLeadIntakeInput): string {
  if (input.message) {
    return input.message;
  }

  const parts = [
    input.firstName ? `firstName=${input.firstName}` : null,
    input.lastName ? `lastName=${input.lastName}` : null,
    input.email ? `email=${input.email}` : null,
    input.phone ? `phone=${input.phone}` : null,
    input.organizationName ? `organizationName=${input.organizationName}` : null
  ].filter(Boolean);

  return parts.join("; ");
}

function getExternalMapping(input: PublicLeadIntakeInput):
  | {
      externalConnectionId: string;
      externalObjectType: string;
      externalObjectId: string;
    }
  | null {
  if (!input.externalConnectionId || !input.externalObjectType || !input.externalObjectId) {
    return null;
  }

  return {
    externalConnectionId: input.externalConnectionId,
    externalObjectType: input.externalObjectType,
    externalObjectId: input.externalObjectId
  };
}

async function findActiveConnection(
  tx: WorkspaceDbTransaction,
  workspaceId: string,
  externalConnectionId: string
): Promise<boolean> {
  const [connection] = await tx
    .select({ id: externalConnections.id })
    .from(externalConnections)
    .where(
      and(
        eq(externalConnections.workspaceId, workspaceId),
        eq(externalConnections.id, externalConnectionId),
        ne(externalConnections.status, "archived")
      )
    )
    .limit(1);

  return Boolean(connection);
}

async function hasDuplicateMapping(
  tx: WorkspaceDbTransaction,
  input: {
    workspaceId: string;
    externalConnectionId: string;
    externalObjectType: string;
    externalObjectId: string;
  }
): Promise<boolean> {
  const [mapping] = await tx
    .select({ id: externalObjectMappings.id })
    .from(externalObjectMappings)
    .where(
      and(
        eq(externalObjectMappings.workspaceId, input.workspaceId),
        eq(externalObjectMappings.connectionId, input.externalConnectionId),
        eq(externalObjectMappings.externalObjectType, input.externalObjectType),
        eq(externalObjectMappings.externalObjectId, input.externalObjectId),
        eq(externalObjectMappings.syrantisEntityType, "lead")
      )
    )
    .limit(1);

  return Boolean(mapping);
}

async function findIdempotentLeadId(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; idempotencyHash: string }
): Promise<string | null> {
  const [event] = await tx
    .select({ leadId: integrationEvents.syrantisEntityId })
    .from(integrationEvents)
    .where(
      and(
        eq(integrationEvents.workspaceId, input.workspaceId),
        eq(integrationEvents.eventType, "public_lead.received"),
        eq(integrationEvents.payloadHash, input.idempotencyHash),
        eq(integrationEvents.status, "processed"),
        eq(integrationEvents.syrantisEntityType, "lead"),
        isNotNull(integrationEvents.syrantisEntityId)
      )
    )
    .limit(1);

  return event?.leadId ?? null;
}

export async function createPublicLeadIntake(input: {
  workspaceId: string;
  apiKeyId: string;
  data: PublicLeadIntakeInput;
  idempotencyHash?: string;
}): Promise<PublicLeadIntakeResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    await tx
      .update(workspaceApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(
        and(
          eq(workspaceApiKeys.workspaceId, input.workspaceId),
          eq(workspaceApiKeys.id, input.apiKeyId),
          eq(workspaceApiKeys.status, "active")
        )
      );

    if (input.idempotencyHash) {
      const leadId = await findIdempotentLeadId(tx, {
        workspaceId: input.workspaceId,
        idempotencyHash: input.idempotencyHash
      });

      if (leadId) {
        return { result: "idempotent_replay", leadId };
      }
    }

    const externalMappingInput = getExternalMapping(input.data);

    if (externalMappingInput) {
      if (!supportedExternalObjectTypes.has(externalMappingInput.externalObjectType)) {
        return { result: "invalid_request" };
      }

      const connectionExists = await findActiveConnection(tx, input.workspaceId, externalMappingInput.externalConnectionId);

      if (!connectionExists) {
        return { result: "not_found" };
      }

      const duplicateMapping = await hasDuplicateMapping(tx, {
        workspaceId: input.workspaceId,
        externalConnectionId: externalMappingInput.externalConnectionId,
        externalObjectType: externalMappingInput.externalObjectType,
        externalObjectId: externalMappingInput.externalObjectId
      });

      if (duplicateMapping) {
        return { result: "conflict" };
      }
    }

    const [organization] = input.data.organizationName
      ? await tx
          .insert(organizations)
          .values({
            workspaceId: input.workspaceId,
            name: input.data.organizationName,
            status: "prospect"
          })
          .returning()
      : [null];

    const shouldCreateContact = Boolean(input.data.email || input.data.phone || input.data.firstName || input.data.lastName);
    const [contact] = shouldCreateContact
      ? await tx
          .insert(contacts)
          .values({
            workspaceId: input.workspaceId,
            organizationId: organization?.id ?? null,
            firstName: input.data.firstName ?? null,
            lastName: input.data.lastName ?? null,
            email: input.data.email ?? null,
            phone: input.data.phone ?? null,
            metadataJson: {
              origin: "public_lead_intake"
            }
          })
          .returning()
      : [null];

    const normalizedJson = {
      origin: "public_lead_intake",
      ...(input.data.email !== undefined ? { email: input.data.email } : {}),
      ...(input.data.firstName !== undefined ? { firstName: input.data.firstName } : {}),
      ...(input.data.lastName !== undefined ? { lastName: input.data.lastName } : {}),
      ...(input.data.phone !== undefined ? { phone: input.data.phone } : {}),
      ...(input.data.organizationName !== undefined ? { organizationName: input.data.organizationName } : {}),
      ...(input.data.externalConnectionId !== undefined ? { externalConnectionId: input.data.externalConnectionId } : {}),
      ...(input.data.externalObjectType !== undefined ? { externalObjectType: input.data.externalObjectType } : {}),
      ...(input.data.externalObjectId !== undefined ? { externalObjectId: input.data.externalObjectId } : {}),
      ...(input.data.metadata !== undefined ? { metadata: input.data.metadata } : {}),
      apiKeyId: input.apiKeyId,
      ...(input.idempotencyHash !== undefined ? { idempotencyHash: input.idempotencyHash } : {})
    };

    const [lead] = await tx
      .insert(leads)
      .values({
        workspaceId: input.workspaceId,
        organizationId: organization?.id ?? null,
        contactId: contact?.id ?? null,
        source: input.data.source,
        status: "new",
        rawContent: summarizeRawContent(input.data),
        normalizedJson,
        receivedAt: new Date()
      })
      .returning();

    if (!lead) {
      throw new Error("Failed to create public lead.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      action: "lead.created",
      entityType: "lead",
      entityId: lead.id,
      metadataJson: {
        status: lead.status,
        source: lead.source,
        organizationId: lead.organizationId,
        contactId: lead.contactId
      }
    });

    const [mapping] = externalMappingInput
      ? await tx
          .insert(externalObjectMappings)
          .values({
            workspaceId: input.workspaceId,
            connectionId: externalMappingInput.externalConnectionId,
            externalObjectType: externalMappingInput.externalObjectType,
            externalObjectId: externalMappingInput.externalObjectId,
            syrantisEntityType: "lead",
            syrantisEntityId: lead.id,
            syncDirection: "inbound",
            syncStatus: "active",
            lastSeenAt: new Date(),
            metadataJson: {
              origin: "public_lead_intake"
            }
          })
          .returning()
      : [null];

    const [event] = await tx
      .insert(integrationEvents)
      .values({
        workspaceId: input.workspaceId,
        connectionId: input.data.externalConnectionId ?? null,
        mappingId: mapping?.id ?? null,
        direction: "inbound",
        eventType: "public_lead.received",
        status: "processed",
        externalObjectType: externalMappingInput?.externalObjectType ?? null,
        externalObjectId: externalMappingInput?.externalObjectId ?? null,
        syrantisEntityType: "lead",
        syrantisEntityId: lead.id,
        message: "Public lead received.",
        payloadHash: input.idempotencyHash ?? null,
        metadataJson: {
          origin: "public_lead_intake",
          apiKeyId: input.apiKeyId,
          ...(input.idempotencyHash !== undefined ? { idempotencyHash: input.idempotencyHash } : {})
        }
      })
      .returning();

    if (!event) {
      throw new Error("Failed to create public lead integration event.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      action: "public_lead.received",
      entityType: "lead",
      entityId: lead.id,
      metadataJson: {
        source: "public_lead_intake",
        apiKeyId: input.apiKeyId,
        ...(input.data.externalConnectionId !== undefined
          ? { externalConnectionId: input.data.externalConnectionId }
          : {}),
        ...(input.data.externalObjectType !== undefined ? { externalObjectType: input.data.externalObjectType } : {})
      }
    });

    return { result: "created", leadId: lead.id };
  });
}
