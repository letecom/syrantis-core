export type AiCompletionInput = {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  maxTokens: number;
  lengthRetryMaxTokens?: number;
  temperature: number;
  timeoutMs: number;
};

export type AiCompletionOutput = {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: "openrouter";
  finishReason: string;
  costEstimateMicroUsd: number;
};

export interface AiProvider {
  complete(input: AiCompletionInput): Promise<AiCompletionOutput>;
}
