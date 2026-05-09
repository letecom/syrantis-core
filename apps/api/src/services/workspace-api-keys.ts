import { createHash, randomBytes } from "node:crypto";

import {
  WorkspaceApiKeyCreateResponseSchema,
  WorkspaceApiKeySafeDtoSchema,
  type WorkspaceApiKeyCreateInput,
  type WorkspaceApiKeyCreateResponse,
  type WorkspaceApiKeySafeDto,
} from "@syrantis/shared";

import type {
  WorkspaceApiKeyMutationResult,
  WorkspaceApiKeyRow,
} from "../repositories/workspace-api-keys.js";
import {
  createWorkspaceApiKey,
  findWorkspaceApiKeyById,
  listWorkspaceApiKeys,
  revokeWorkspaceApiKey,
} from "../repositories/workspace-api-keys.js";

const API_KEY_PREFIX = "syr_live";

export type WorkspaceApiKeyServiceMutationResult =
  | { result: "ok"; key: WorkspaceApiKeySafeDto }
  | { result: "not_found" }
  | { result: "conflict" };

export type WorkspaceApiKeyServiceCreateResult =
  | { result: "ok"; key: WorkspaceApiKeyCreateResponse }
  | { result: "not_found" }
  | { result: "conflict" };

export type WorkspaceApiKeyService = {
  listWorkspaceApiKeys(workspaceId: string): Promise<WorkspaceApiKeySafeDto[]>;
  getWorkspaceApiKey(workspaceId: string, id: string): Promise<WorkspaceApiKeySafeDto | null>;
  createWorkspaceApiKey(
    workspaceId: string,
    actorUserId: string,
    input: WorkspaceApiKeyCreateInput,
  ): Promise<WorkspaceApiKeyServiceCreateResult>;
  revokeWorkspaceApiKey(
    workspaceId: string,
    actorUserId: string,
    id: string,
  ): Promise<WorkspaceApiKeyServiceMutationResult>;
};

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function generatePlaintextApiKey(): string {
  return `${API_KEY_PREFIX}_${randomBytes(32).toString("base64url")}`;
}

function hashApiKey(plaintextApiKey: string): string {
  return createHash("sha256").update(plaintextApiKey).digest("hex");
}

function mapWorkspaceApiKeyRow(row: WorkspaceApiKeyRow): WorkspaceApiKeySafeDto {
  return WorkspaceApiKeySafeDtoSchema.parse({
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    last4: row.last4,
    status: row.status,
    lastUsedAt: toIsoDate(row.lastUsedAt),
    revokedAt: toIsoDate(row.revokedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function mapMutationResult(
  result: WorkspaceApiKeyMutationResult,
): WorkspaceApiKeyServiceMutationResult {
  if (result.result !== "ok") {
    return result;
  }

  return {
    result: "ok",
    key: mapWorkspaceApiKeyRow(result.key),
  };
}

export function createProductionWorkspaceApiKeyService(): WorkspaceApiKeyService {
  return {
    async listWorkspaceApiKeys(workspaceId) {
      const rows = await listWorkspaceApiKeys(workspaceId);
      return rows.map(mapWorkspaceApiKeyRow);
    },

    async getWorkspaceApiKey(workspaceId, id) {
      const row = await findWorkspaceApiKeyById({ workspaceId, id });
      return row ? mapWorkspaceApiKeyRow(row) : null;
    },

    async createWorkspaceApiKey(workspaceId, actorUserId, input) {
      const plaintextApiKey = generatePlaintextApiKey();
      const result = await createWorkspaceApiKey({
        workspaceId,
        actorUserId,
        name: input.name,
        keyHash: hashApiKey(plaintextApiKey),
        keyPrefix: API_KEY_PREFIX,
        last4: plaintextApiKey.slice(-4),
      });

      if (result.result !== "ok") {
        return result;
      }

      return {
        result: "ok",
        key: WorkspaceApiKeyCreateResponseSchema.parse({
          ...mapWorkspaceApiKeyRow(result.key),
          plaintextApiKey,
        }),
      };
    },

    async revokeWorkspaceApiKey(workspaceId, actorUserId, id) {
      return mapMutationResult(await revokeWorkspaceApiKey({ workspaceId, actorUserId, id }));
    },
  };
}
