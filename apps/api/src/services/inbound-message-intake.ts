import { randomUUID } from "node:crypto";

import {
  InboundMessageIntakeResponseSchema,
  type InboundMessageIntakeRequest,
  type InboundMessageIntakeResponse,
} from "@syrantis/shared";

import {
  createInboundMessageIntake,
  type InboundMessageIntakeRepositoryInput,
  type InboundMessageIntakeRepositoryResult,
} from "../repositories/inbound-message-intake.js";
import type { PublicApiKeyLookupRow } from "../repositories/public-lead-intake.js";
import { defaultInboundMessageRateLimiter, type FixedWindowRateLimiter } from "./rate-limit.js";

export type InboundMessageIntakeServiceResult =
  | { result: "created"; data: InboundMessageIntakeResponse["data"] }
  | { result: "idempotent_replay"; data: InboundMessageIntakeResponse["data"] }
  | { result: "ignored"; data: InboundMessageIntakeResponse["data"] }
  | { result: "idempotent_ignored"; data: InboundMessageIntakeResponse["data"] }
  | { result: "rate_limited"; retryAfterSeconds: number };

export type InboundMessageIntakeService = {
  receiveInboundMessage(input: {
    apiKey: PublicApiKeyLookupRow;
    payload: InboundMessageIntakeRequest;
  }): Promise<InboundMessageIntakeServiceResult>;
};

export type InboundMessageIntakeRepository = {
  create(input: InboundMessageIntakeRepositoryInput): Promise<InboundMessageIntakeRepositoryResult>;
};

const productionRepository: InboundMessageIntakeRepository = {
  create: createInboundMessageIntake,
};

function buildResponseData(input: {
  created: InboundMessageIntakeRepositoryResult;
}): InboundMessageIntakeResponse["data"] {
  const classification = {
    category: input.created.classification.category,
    action: input.created.classification.action,
    confidence: input.created.classification.confidence,
    reasonCode: input.created.classification.reasonCode,
  };

  if (input.created.result === "ignored" || input.created.result === "idempotent_ignored") {
    const response = InboundMessageIntakeResponseSchema.parse({
      success: true,
      data: {
        result: input.created.result,
        intakeAction: "ignored",
        diagnosticTraceId: input.created.classification.diagnosticTraceId,
        classification,
        ...(input.created.classification.suggestedLabels.length > 0
          ? { suggestedLabels: input.created.classification.suggestedLabels }
          : {}),
      },
    });

    return response.data;
  }

  const response = InboundMessageIntakeResponseSchema.parse({
    success: true,
    data: {
      result: input.created.result,
      intakeAction: "created_lead",
      leadId: input.created.lead?.id ?? null,
      scoringJobId: input.created.job?.id ?? null,
      diagnosticTraceId: input.created.classification.diagnosticTraceId,
      classification,
    },
  });

  return response.data;
}

export function createProductionInboundMessageIntakeService(
  repository: InboundMessageIntakeRepository = productionRepository,
  rateLimiter: FixedWindowRateLimiter = defaultInboundMessageRateLimiter,
): InboundMessageIntakeService {
  return {
    async receiveInboundMessage(input): Promise<InboundMessageIntakeServiceResult> {
      const rateLimit = rateLimiter.check(input.apiKey.id ?? input.apiKey.workspaceId);

      if (!rateLimit.allowed) {
        return {
          result: "rate_limited",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        };
      }

      const created = await repository.create({
        workspaceId: input.apiKey.workspaceId,
        apiKeyId: input.apiKey.id,
        diagnosticTraceId: randomUUID(),
        data: input.payload,
      });

      return {
        result: created.result,
        data: buildResponseData({ created }),
      };
    },
  };
}
