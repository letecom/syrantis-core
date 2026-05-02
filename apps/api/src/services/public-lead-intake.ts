import { createHash } from "node:crypto";

import type { PublicLeadIntakeInput } from "@syrantis/shared";

import {
  createPublicLeadIntake,
  findActiveWorkspaceApiKeyByHash,
  type PublicLeadIntakeResult
} from "../repositories/public-lead-intake.js";

const API_KEY_PREFIX = "syr_live_";

export type PublicLeadIntakeServiceResult =
  | { result: "created"; leadId: string }
  | { result: "idempotent_replay"; leadId: string }
  | { result: "unauthorized" }
  | { result: "invalid_request" }
  | { result: "not_found" }
  | { result: "conflict" };

export type PublicLeadIntakeService = {
  receivePublicLead(input: {
    authorizationHeader?: string | null;
    idempotencyKey?: string | null;
    payload: PublicLeadIntakeInput;
  }): Promise<PublicLeadIntakeServiceResult>;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function extractPlaintextApiKey(authorizationHeader?: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/.exec(authorizationHeader.trim());
  const plaintextApiKey = match?.[1] ?? null;

  if (!plaintextApiKey || !plaintextApiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  return plaintextApiKey;
}

function mapRepositoryResult(result: PublicLeadIntakeResult): PublicLeadIntakeServiceResult {
  return result;
}

export function createProductionPublicLeadIntakeService(): PublicLeadIntakeService {
  return {
    async receivePublicLead(input): Promise<PublicLeadIntakeServiceResult> {
      const plaintextApiKey = extractPlaintextApiKey(input.authorizationHeader);

      if (!plaintextApiKey) {
        return { result: "unauthorized" };
      }

      const keyHash = sha256(plaintextApiKey);
      const apiKey = await findActiveWorkspaceApiKeyByHash(keyHash);

      if (!apiKey) {
        return { result: "unauthorized" };
      }

      const idempotencyHash = input.idempotencyKey
        ? sha256(`${apiKey.workspaceId}:public_lead:${input.idempotencyKey}`)
        : undefined;

      return mapRepositoryResult(
        await createPublicLeadIntake({
          workspaceId: apiKey.workspaceId,
          apiKeyId: apiKey.id,
          data: input.payload,
          ...(idempotencyHash !== undefined ? { idempotencyHash } : {})
        })
      );
    }
  };
}
