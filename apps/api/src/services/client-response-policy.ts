import {
  ClientResponsePolicyInputSchema,
  ClientResponsePolicySchema,
  type ClientResponsePolicy,
  type ClientResponsePolicyInput,
} from "@syrantis/shared";

import {
  findWorkspaceContextProfile,
  type WorkspaceContextProfileRow,
} from "../repositories/workspace-context.js";
import { putClientResponsePolicy } from "../repositories/client-response-policy.js";

export type ClientResponsePolicyPutResult = {
  policy: ClientResponsePolicy;
  created: boolean;
  changedFields: string[];
};

export type ClientResponsePolicyService = {
  getClientResponsePolicy(workspaceId: string): Promise<ClientResponsePolicy>;
  putClientResponsePolicy(
    workspaceId: string,
    actorUserId: string,
    input: ClientResponsePolicyInput,
  ): Promise<ClientResponsePolicyPutResult>;
};

function emptyPolicy(): ClientResponsePolicy {
  return ClientResponsePolicySchema.parse({
    ...ClientResponsePolicyInputSchema.parse({}),
    updatedAt: null,
    status: "empty",
  });
}

function isPolicyConfigured(input: ClientResponsePolicyInput): boolean {
  return (
    input.language !== "auto" ||
    input.tone !== "professional" ||
    Boolean(input.customToneNotes) ||
    Boolean(input.signature) ||
    Boolean(input.defaultGreeting) ||
    Boolean(input.defaultClosing) ||
    input.responseStructure.length > 0 ||
    input.businessRules.length > 0 ||
    input.forbiddenClaims.length > 0 ||
    input.escalationRules.length > 0 ||
    input.offerNotes.length > 0 ||
    Boolean(input.catalogSummary) ||
    input.exampleReplies.length > 0
  );
}

function policyFromRow(row: WorkspaceContextProfileRow | null): ClientResponsePolicy {
  if (!row) {
    return emptyPolicy();
  }

  const contextJson = row.contextJson as Record<string, unknown>;
  const responsePolicy = contextJson.responsePolicy;

  if (typeof responsePolicy !== "object" || responsePolicy === null) {
    return emptyPolicy();
  }

  const inputCandidate = { ...(responsePolicy as Record<string, unknown>) };
  const storedUpdatedAt = inputCandidate.updatedAt;
  delete inputCandidate.updatedAt;
  delete inputCandidate.status;
  const parsedInput = ClientResponsePolicyInputSchema.safeParse(inputCandidate);

  if (!parsedInput.success) {
    return emptyPolicy();
  }

  return ClientResponsePolicySchema.parse({
    ...parsedInput.data,
    updatedAt: typeof storedUpdatedAt === "string" ? storedUpdatedAt : row.updatedAt.toISOString(),
    status: isPolicyConfigured(parsedInput.data) ? "configured" : "empty",
  });
}

function policyForStorage(input: ClientResponsePolicyInput): ClientResponsePolicy {
  return ClientResponsePolicySchema.parse({
    ...input,
    updatedAt: new Date().toISOString(),
    status: isPolicyConfigured(input) ? "configured" : "empty",
  });
}

export function createProductionClientResponsePolicyService(): ClientResponsePolicyService {
  return {
    async getClientResponsePolicy(workspaceId) {
      return policyFromRow(await findWorkspaceContextProfile(workspaceId));
    },

    async putClientResponsePolicy(workspaceId, actorUserId, input) {
      const existingRow = await findWorkspaceContextProfile(workspaceId);
      const policy = policyForStorage(input);
      const existingPolicy = policyFromRow(existingRow);
      const result = await putClientResponsePolicy({
        workspaceId,
        actorUserId,
        policy,
        existingPolicy: existingPolicy.status === "empty" ? null : existingPolicy,
      });

      return {
        policy,
        created: result.created,
        changedFields: result.changedFields,
      };
    },
  };
}
