import { randomBytes } from "node:crypto";

import {
  ClientUserCreateResponseSchema,
  ClientUserSafeDtoSchema,
  type ClientUserCreateInput,
  type ClientUserCreateResponse,
  type ClientUserSafeDto,
} from "@syrantis/shared";

import { hashPassword } from "../lib/password.js";
import type { ClientUserMutationResult, ClientUserRow } from "../repositories/client-users.js";
import {
  createClientUser,
  listClientUsers,
  type CreateClientUserInput,
} from "../repositories/client-users.js";
import { normalizeEmail } from "./auth.js";

export type ClientUserServiceCreateResult =
  | { result: "ok"; data: ClientUserCreateResponse }
  | { result: "conflict" };

export type ClientUserRepository = {
  listClientUsers(workspaceId: string): Promise<ClientUserRow[]>;
  createClientUser(input: CreateClientUserInput): Promise<ClientUserMutationResult>;
};

export type ClientUserService = {
  listClientUsers(workspaceId: string): Promise<ClientUserSafeDto[]>;
  createClientUser(
    workspaceId: string,
    input: ClientUserCreateInput,
  ): Promise<ClientUserServiceCreateResult>;
};

export type ClientUserServiceDependencies = {
  repository?: ClientUserRepository;
  generateTemporaryPassword?: () => string;
  hashPassword?: (password: string) => Promise<string>;
};

function toIsoDate(value: Date): string {
  return value.toISOString();
}

function generateTemporaryPassword(): string {
  return randomBytes(24).toString("base64url");
}

function mapClientUserRow(row: ClientUserRow): ClientUserSafeDto {
  return ClientUserSafeDtoSchema.parse({
    id: row.id,
    email: row.email,
    displayName: row.name,
    role: row.role,
    status: row.status,
    createdAt: toIsoDate(row.createdAt),
    updatedAt: toIsoDate(row.updatedAt),
  });
}

export function createProductionClientUserService(
  dependencies: ClientUserServiceDependencies = {},
): ClientUserService {
  const repository = dependencies.repository ?? {
    listClientUsers,
    createClientUser,
  };
  const passwordGenerator = dependencies.generateTemporaryPassword ?? generateTemporaryPassword;
  const passwordHasher = dependencies.hashPassword ?? hashPassword;

  return {
    async listClientUsers(workspaceId) {
      const rows = await repository.listClientUsers(workspaceId);
      return rows.map(mapClientUserRow);
    },

    async createClientUser(workspaceId, input) {
      const temporaryPassword = passwordGenerator();
      const passwordHash = await passwordHasher(temporaryPassword);
      const result = await repository.createClientUser({
        workspaceId,
        email: normalizeEmail(input.email),
        displayName: input.displayName?.trim() || null,
        passwordHash,
      });

      if (result.result !== "ok") {
        return result;
      }

      return {
        result: "ok",
        data: ClientUserCreateResponseSchema.parse({
          user: mapClientUserRow(result.user),
          temporaryPassword,
        }),
      };
    },
  };
}
