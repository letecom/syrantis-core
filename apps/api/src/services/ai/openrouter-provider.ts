import type { AiCompletionInput, AiCompletionOutput, AiProvider } from "./providers.js";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_AI_MODEL = "openai/gpt-4o-mini";

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

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

async function parseOpenRouterResponse(response: Response): Promise<OpenRouterResponse> {
  const value = await response.json().catch(() => null);

  if (!value || typeof value !== "object") {
    throw new Error("AI_PROVIDER_INVALID_RESPONSE");
  }

  return value as OpenRouterResponse;
}

export class OpenRouterProvider implements AiProvider {
  async complete(input: AiCompletionInput): Promise<AiCompletionOutput> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const response = await fetch(OPENROUTER_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${readApiKey()}`,
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

      if (!response.ok) {
        throw new Error(`AI_PROVIDER_HTTP_${response.status}`);
      }

      const data = await parseOpenRouterResponse(response);
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("AI_PROVIDER_EMPTY_RESPONSE");
      }

      return {
        content,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        model: data.model ?? input.model,
        provider: "openrouter",
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("AI_PROVIDER_TIMEOUT");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
