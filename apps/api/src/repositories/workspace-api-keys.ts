import { and, desc, eq } from "drizzle-orm";

import { workspaceApiKeys } from "@syrantis/db";

import { withWorkspaceDb } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

export type WorkspaceApiKeyRow = typeof workspaceApiKeys.$inferSelect;

export type WorkspaceApiKeyMutationResult =
  | { result: "ok"; key: WorkspaceApiKeyRow }
  | { result: "not_found" }
  | { result: "conflict" };

export type CreateWorkspaceApiKeyInput = {
  workspaceId: string;
  actorUserId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  last4: string;
};

export type FindWorkspaceApiKeyByIdInput = {
  workspaceId: string;
  id: string;
};

export type RevokeWorkspaceApiKeyInput = {
  workspaceId: string;
  actorUserId: string;
  id: string;
};

export async function listWorkspaceApiKeys(workspaceId: string): Promise<WorkspaceApiKeyRow[]> {
  return withWorkspaceDb(workspaceId, async (tx) => {
    return tx
      .select()
      .from(workspaceApiKeys)
      .where(eq(workspaceApiKeys.workspaceId, workspaceId))
      .orderBy(desc(workspaceApiKeys.createdAt));
  });
}

export async function findWorkspaceApiKeyById(input: FindWorkspaceApiKeyByIdInput): Promise<WorkspaceApiKeyRow | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [key] = await tx
      .select()
      .from(workspaceApiKeys)
      .where(and(eq(workspaceApiKeys.workspaceId, input.workspaceId), eq(workspaceApiKeys.id, input.id)))
      .limit(1);

    return key ?? null;
  });
}

export async function createWorkspaceApiKey(input: CreateWorkspaceApiKeyInput): Promise<WorkspaceApiKeyMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [key] = await tx
      .insert(workspaceApiKeys)
      .values({
        workspaceId: input.workspaceId,
        name: input.name,
        keyHash: input.keyHash,
        keyPrefix: input.keyPrefix,
        last4: input.last4
      })
      .returning();

    if (!key) {
      throw new Error("Failed to create workspace API key.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "workspace_api_key.created",
      entityType: "workspace_api_key",
      entityId: key.id,
      metadataJson: {
        name: key.name,
        keyPrefix: key.keyPrefix,
        last4: key.last4
      }
    });

    return { result: "ok", key };
  });
}

export async function revokeWorkspaceApiKey(input: RevokeWorkspaceApiKeyInput): Promise<WorkspaceApiKeyMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [existingKey] = await tx
      .select()
      .from(workspaceApiKeys)
      .where(and(eq(workspaceApiKeys.workspaceId, input.workspaceId), eq(workspaceApiKeys.id, input.id)))
      .limit(1);

    if (!existingKey) {
      return { result: "not_found" };
    }

    if (existingKey.status !== "active") {
      return { result: "conflict" };
    }

    const [key] = await tx
      .update(workspaceApiKeys)
      .set({
        status: "revoked",
        revokedAt: new Date()
      })
      .where(and(eq(workspaceApiKeys.workspaceId, input.workspaceId), eq(workspaceApiKeys.id, input.id)))
      .returning();

    if (!key) {
      throw new Error("Failed to revoke workspace API key.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "workspace_api_key.revoked",
      entityType: "workspace_api_key",
      entityId: key.id,
      metadataJson: {
        name: key.name,
        keyPrefix: key.keyPrefix,
        last4: key.last4
      }
    });

    return { result: "ok", key };
  });
}
