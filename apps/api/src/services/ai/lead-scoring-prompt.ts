import { LeadScoreOutputSchema, type LeadScoreOutput } from "@syrantis/shared";

import type { RedactedLeadForScoring } from "./pii-redaction.js";
import type { AiCompletionInput } from "./providers.js";

export const LEAD_SCORING_PROMPT_TEMPLATE_ID = "lead-score-v1";

const SYSTEM_PROMPT = [
  "You are Syrantis Core lead scoring.",
  "Score the provided redacted B2B lead signals for a plumbing or heating contractor.",
  "Return only strict JSON with score, qualification, summary, rationale, recommended_action, confidence.",
  "Do not include personal data or invent missing identity details.",
].join(" ");

export type LeadScoringPrompt = {
  messages: AiCompletionInput["messages"];
  promptJson: Record<string, unknown>;
};

export function buildLeadScoringPrompt(input: RedactedLeadForScoring): LeadScoringPrompt {
  const promptJson = {
    templateId: LEAD_SCORING_PROMPT_TEMPLATE_ID,
    schema: {
      score: "integer 0..100",
      qualification: "cold | warm | hot",
      summary: "string <= 280 chars",
      rationale: "string <= 500 chars",
      recommended_action: "string <= 240 chars",
      confidence: "integer 0..100",
    },
    signals: input,
  };

  return {
    promptJson,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: JSON.stringify(promptJson),
      },
    ],
  };
}

export function parseLeadScoringOutput(content: string): LeadScoreOutput {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI_OUTPUT_INVALID_JSON");
  }

  const result = LeadScoreOutputSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error("AI_OUTPUT_INVALID_SCHEMA");
  }

  return result.data;
}
