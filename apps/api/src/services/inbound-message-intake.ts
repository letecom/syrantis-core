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
import { buildPendingScoreLeadJobDto, hasText, publicInboundMessageSource } from "./intake-shared.js";

const rateLimitWindowMs = 60_000;
const rateLimitMaxRequests = 10;
const defaultRateLimitStore = new Map<string, { windowStartMs: number; count: number }>();

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

type RateLimitStore = Map<string, { windowStartMs: number; count: number }>;

const productionRepository: InboundMessageIntakeRepository = {
  create: createInboundMessageIntake,
};

function checkRateLimit(input: {
  key: string;
  nowMs: number;
  store: RateLimitStore;
}): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const current = input.store.get(input.key);

  if (!current || input.nowMs - current.windowStartMs >= rateLimitWindowMs) {
    input.store.set(input.key, { windowStartMs: input.nowMs, count: 1 });
    return { allowed: true };
  }

  if (current.count >= rateLimitMaxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((rateLimitWindowMs - (input.nowMs - current.windowStartMs)) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true };
}

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
  rateLimitStore: RateLimitStore = defaultRateLimitStore,
  now: () => number = Date.now,
): InboundMessageIntakeService {
  return {
    async receiveInboundMessage(input): Promise<InboundMessageIntakeServiceResult> {
      const rateLimit = checkRateLimit({
        key: input.apiKey.id ?? input.apiKey.workspaceId,
        nowMs: now(),
        store: rateLimitStore,
      });

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
