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
import {
  buildPendingScoreLeadJobDto,
  hasText,
  publicInboundMessageSource,
} from "./intake-shared.js";
import { defaultInboundMessageRateLimiter, type FixedWindowRateLimiter } from "./rate-limit.js";

export type InboundMessageIntakeServiceResult =
  | { result: "created"; data: InboundMessageIntakeResponse["data"] }
  | { result: "idempotent_replay"; data: InboundMessageIntakeResponse["data"] }
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
  diagnosticTraceId: string;
  created: InboundMessageIntakeRepositoryResult;
  request: InboundMessageIntakeRequest;
}): InboundMessageIntakeResponse["data"] {
  const response = InboundMessageIntakeResponseSchema.parse({
    success: true,
    data: {
      diagnosticTraceId: input.diagnosticTraceId,
      lead: {
        id: input.created.lead.id,
        source: publicInboundMessageSource,
        hasBody: hasText(input.request.bodyText),
        subjectPresent: hasText(input.request.subject),
        contactNamePresent: hasText(input.request.contactName),
        createdAt: input.created.lead.createdAt.toISOString(),
      },
      scoringJob: buildPendingScoreLeadJobDto(input.created.job),
      idempotency: {
        isReplay: input.created.result === "idempotent_replay",
        externalId: input.request.externalId ?? null,
      },
      createdAt: input.created.lead.createdAt.toISOString(),
      processingNote:
        input.created.result === "idempotent_replay"
          ? "Public inbound message replay detected from externalId. Existing lead and score_lead job returned."
          : "Public inbound message lead created and score_lead job enqueued. Run the worker once to process scoring.",
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

      const diagnosticTraceId = randomUUID();
      const created = await repository.create({
        workspaceId: input.apiKey.workspaceId,
        apiKeyId: input.apiKey.id,
        diagnosticTraceId,
        data: input.payload,
      });

      return {
        result: created.result,
        data: buildResponseData({
          diagnosticTraceId,
          created,
          request: input.payload,
        }),
      };
    },
  };
}
