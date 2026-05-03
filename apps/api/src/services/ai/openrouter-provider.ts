import { z } from "zod";

import {
  calculateAiCostMicroUsd,
  DEFAULT_AI_MODEL,
  resolveAllowedAiModel,
} from "./pricing.js";
import type { AiCompletionInput, AiCompletionOutput, AiProvider } from "./providers.js";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_PROVIDER_TIMEOUT_MS = 15_000;
const MAX_RETRYABLE_ATTEMPTS = 2;

const OpenRouterResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z
          .object({
            content: z.string().nullable().optional(),
          })
          .optional(),
      }),
    )
    .min(1),
  model: z.string().optional(),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

type OpenRouterResponse = z.infer<typeof OpenRouterResponseSchema>;

export { DEFAULT_AI_MODEL };

function readApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY_MISSING");
  }

  return apiKey;
}

function resolveReferer(): string {
  return process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://syrantis.local";
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function parseOpenRouterResponse(response: Response): Promise<OpenRouterResponse> {
  const value = await response.json().catch(() => {
    throw new AiProviderInvalidResponseError();
  });
  const parsed = OpenRouterResponseSchema.safeParse(value);

  if (!parsed.success) {
    throw new AiProviderInvalidResponseError();
  }

  return parsed.data;
}

async function executeOpenRouterRequest(input: {
  apiKey: string;
  model: string;
  messages: AiCompletionInput["messages"];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    return await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "http-referer": resolveReferer(),
        "x-title": "Syrantis Core",
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        max_tokens: input.maxTokens,
        temperature: input.temperature,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiProviderTimeoutError();
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestWithRetry(input: {
  apiKey: string;
  model: string;
  messages: AiCompletionInput["messages"];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRYABLE_ATTEMPTS; attempt += 1) {
    try {
      const response = await executeOpenRouterRequest(input);

      if (response.ok || !isRetryableStatus(response.status)) {
        return response;
      }

      lastError = new AiProviderHttpError(response.status);
    } catch (error) {
      if (!(error instanceof AiProviderTimeoutError)) {
        throw error;
      }

      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI_PROVIDER_RETRY_FAILED");
}

function responseToCompletion(input: {
  data: OpenRouterResponse;
  fallbackModel: string;
}): AiCompletionOutput {
  const choice = input.data.choices[0];
  const finishReason = choice?.finish_reason ?? "";

  if (finishReason === "content_filter") {
    throw new AiFinishReasonError("AI_CONTENT_FILTERED", finishReason);
  }

  if (finishReason !== "stop") {
    throw new AiFinishReasonError("AI_FINISH_REASON_UNSUPPORTED", finishReason);
  }

  const content = choice?.message?.content;

  if (!content) {
    throw new AiProviderEmptyResponseError(finishReason);
  }

  const inputTokens = input.data.usage?.prompt_tokens ?? 0;
  const outputTokens = input.data.usage?.completion_tokens ?? 0;
  const model = input.data.model ?? input.fallbackModel;

  return {
    content,
    inputTokens,
    outputTokens,
    model,
    provider: "openrouter",
    finishReason,
    costEstimateMicroUsd: calculateAiCostMicroUsd({
      model,
      inputTokens,
      outputTokens,
    }),
  };
}

export class OpenRouterProvider implements AiProvider {
  async complete(input: AiCompletionInput): Promise<AiCompletionOutput> {
    const model = resolveAllowedAiModel(input.model);
    const apiKey = readApiKey();

    const firstResponse = await requestWithRetry({
      apiKey,
      model,
      messages: input.messages,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      timeoutMs: input.timeoutMs || DEFAULT_PROVIDER_TIMEOUT_MS,
    });

    if (!firstResponse.ok) {
      throw new AiProviderHttpError(firstResponse.status);
    }

    const firstData = await parseOpenRouterResponse(firstResponse);
    const firstFinishReason = firstData.choices[0]?.finish_reason ?? "";

    if (firstFinishReason === "length") {
      const secondResponse = await requestWithRetry({
        apiKey,
        model,
        messages: input.messages,
        maxTokens: input.lengthRetryMaxTokens ?? input.maxTokens * 2,
        temperature: input.temperature,
        timeoutMs: input.timeoutMs || DEFAULT_PROVIDER_TIMEOUT_MS,
      });

      if (!secondResponse.ok) {
        throw new AiProviderHttpError(secondResponse.status);
      }

      const secondData = await parseOpenRouterResponse(secondResponse);
      const secondFinishReason = secondData.choices[0]?.finish_reason ?? "";

      if (secondFinishReason === "length") {
        throw new AiFinishReasonError("AI_FINISH_REASON_LENGTH", secondFinishReason);
      }

      return responseToCompletion({
        data: secondData,
        fallbackModel: model,
      });
    }

    return responseToCompletion({
      data: firstData,
      fallbackModel: model,
    });
  }
}

export class AiProviderHttpError extends Error {
  readonly code = "AI_PROVIDER_HTTP_ERROR";
  readonly statusCode: number;

  constructor(statusCode: number) {
    super(`AI_PROVIDER_HTTP_${statusCode}`);
    this.name = "AiProviderHttpError";
    this.statusCode = statusCode;
  }
}

export class AiProviderTimeoutError extends Error {
  readonly code = "AI_PROVIDER_TIMEOUT";

  constructor() {
    super("AI_PROVIDER_TIMEOUT");
    this.name = "AiProviderTimeoutError";
  }
}

export class AiProviderInvalidResponseError extends Error {
  readonly code = "AI_PROVIDER_INVALID_RESPONSE";

  constructor() {
    super("AI_PROVIDER_INVALID_RESPONSE");
    this.name = "AiProviderInvalidResponseError";
  }
}

export class AiProviderEmptyResponseError extends Error {
  readonly code = "AI_PROVIDER_EMPTY_RESPONSE";
  readonly finishReason: string | null;

  constructor(finishReason: string | null) {
    super("AI_PROVIDER_EMPTY_RESPONSE");
    this.name = "AiProviderEmptyResponseError";
    this.finishReason = finishReason;
  }
}

export class AiFinishReasonError extends Error {
  readonly code: "AI_FINISH_REASON_LENGTH" | "AI_CONTENT_FILTERED" | "AI_FINISH_REASON_UNSUPPORTED";
  readonly finishReason: string | null;

  constructor(
    code: "AI_FINISH_REASON_LENGTH" | "AI_CONTENT_FILTERED" | "AI_FINISH_REASON_UNSUPPORTED",
    finishReason: string | null,
  ) {
    super(code);
    this.name = "AiFinishReasonError";
    this.code = code;
    this.finishReason = finishReason;
  }
}
