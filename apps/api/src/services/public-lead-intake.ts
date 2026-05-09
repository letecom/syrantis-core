import type { PublicLeadIntakeInput } from "@syrantis/shared";

import {
  createPublicLeadIntake,
  type PublicLeadIntakeResult
} from "../repositories/public-lead-intake.js";
import { authenticateWorkspaceApiKey, sha256 } from "./public-api-key-auth.js";

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

function mapRepositoryResult(result: PublicLeadIntakeResult): PublicLeadIntakeServiceResult {
  return result;
}

export function createProductionPublicLeadIntakeService(): PublicLeadIntakeService {
  return {
    async receivePublicLead(input): Promise<PublicLeadIntakeServiceResult> {
      const apiKey = await authenticateWorkspaceApiKey(input.authorizationHeader);

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
