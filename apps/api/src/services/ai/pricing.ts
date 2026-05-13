export const ALLOWED_AI_MODELS = [
  "mistralai/mistral-small-2603",
  "google/gemini-3.1-flash-lite",
] as const;

export type AllowedAiModel = (typeof ALLOWED_AI_MODELS)[number];

export const DEFAULT_AI_MODEL: AllowedAiModel = "mistralai/mistral-small-2603";

export const AI_MODEL_PRICING_MICRO_USD_PER_1M_TOKENS: Record<
  AllowedAiModel,
  { input: number; output: number }
> = {
  "mistralai/mistral-small-2603": {
    input: 150_000,
    output: 600_000,
  },
  "google/gemini-3.1-flash-lite": {
    input: 250_000,
    output: 1_500_000,
  },
};

export function isAllowedAiModel(model: string): model is AllowedAiModel {
  return (ALLOWED_AI_MODELS as readonly string[]).includes(model);
}

export function assertAllowedAiModel(model: string): AllowedAiModel {
  const normalizedModel = model.trim();

  if (!isAllowedAiModel(normalizedModel)) {
    throw new AiModelNotAllowedError(normalizedModel);
  }

  return normalizedModel;
}

export function resolveAllowedAiModel(input?: string): AllowedAiModel {
  const model = input?.trim() || process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;
  return assertAllowedAiModel(model);
}

export function resolveAllowedAiDraftModel(input?: string): AllowedAiModel {
  const model =
    input?.trim() ||
    process.env.AI_DRAFT_MODEL?.trim() ||
    process.env.AI_MODEL?.trim() ||
    DEFAULT_AI_MODEL;
  return assertAllowedAiModel(model);
}

export function calculateAiCostMicroUsd(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  const model = assertAllowedAiModel(input.model);
  const pricing = AI_MODEL_PRICING_MICRO_USD_PER_1M_TOKENS[model];
  const inputCost = input.inputTokens * pricing.input;
  const outputCost = input.outputTokens * pricing.output;

  return Math.ceil((inputCost + outputCost) / 1_000_000);
}

export function convertMicroUsdToCentsConservative(microUsd: number): number {
  if (microUsd <= 0) {
    return 0;
  }

  return Math.ceil(microUsd / 10_000);
}

export class AiModelNotAllowedError extends Error {
  readonly code = "AI_MODEL_NOT_ALLOWED";
  readonly model: string;

  constructor(model: string) {
    super("AI_MODEL_NOT_ALLOWED");
    this.name = "AiModelNotAllowedError";
    this.model = model;
  }
}
