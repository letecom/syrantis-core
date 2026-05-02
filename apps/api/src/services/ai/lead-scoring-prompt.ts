import { LeadScoreOutputSchema, type LeadScoreOutput } from "@syrantis/shared";

import { redactText, type RedactedLeadForScoring } from "./pii-redaction.js";
import type { AiCompletionInput } from "./providers.js";

export const LEAD_SCORING_PROMPT_TEMPLATE_ID = "lead-score-v1";

const SYSTEM_PROMPT = [
  "You are Syrantis Core lead scoring.",
  "Syrantis is a B2B AI orchestration and CRM workflow automation infrastructure platform.",
  "Score the provided redacted B2B lead signals.",
  "Return compact JSON only. No markdown. No long paragraphs.",
  "Use score integer 0..100, qualification cold|warm|hot, summary, rationale, recommended_action, confidence integer 0..100.",
  "summary must be one sentence and at most 220 chars.",
  "rationale must be at most two short sentences and at most 500 chars.",
  "recommended_action must be one concrete next action and at most 240 chars.",
  "Do not include personal data or invent missing identity details.",
].join(" ");

export type LeadScoringPrompt = {
  messages: AiCompletionInput["messages"];
  promptJson: Record<string, unknown>;
};

export class AiOutputParseError extends Error {
  readonly code = "AI_OUTPUT_INVALID_JSON";
  readonly rawPreview: string;

  constructor(rawContent: string) {
    super("AI_OUTPUT_INVALID_JSON");
    this.name = "AiOutputParseError";
    this.rawPreview = redactText(rawContent).slice(0, 1000);
  }
}

export class AiOutputSchemaError extends Error {
  readonly code = "AI_OUTPUT_INVALID_SCHEMA";
  readonly rawPreview: string;

  constructor(rawContent: string) {
    super("AI_OUTPUT_INVALID_SCHEMA");
    this.name = "AiOutputSchemaError";
    this.rawPreview = redactText(rawContent).slice(0, 1000);
  }
}

export function buildLeadScoringPrompt(input: RedactedLeadForScoring): LeadScoringPrompt {
  const promptJson = {
    templateId: LEAD_SCORING_PROMPT_TEMPLATE_ID,
    schema: {
      score: "integer 0..100",
      qualification: "cold | warm | hot",
      summary: "one sentence, string <= 220 chars",
      rationale: "max two short sentences, string <= 500 chars",
      recommended_action: "one concrete next action, string <= 240 chars",
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

function stripJsonFence(content: string): string | null {
  const match = content.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? null;
}

function extractJsonObject(content: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaping = false;
  const candidates: string[] = [];

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0 && start >= 0) {
        candidates.push(content.slice(start, index + 1));
        start = -1;
      }
    }
  }

  const validCandidates = candidates.filter((candidate) => {
    try {
      JSON.parse(candidate);
      return true;
    } catch {
      return false;
    }
  });

  return validCandidates.length === 1 ? (validCandidates[0] ?? null) : null;
}

function parseJsonLikeContent(content: string): unknown {
  const candidates = [content.trim(), stripJsonFence(content), extractJsonObject(content)].filter(
    (candidate): candidate is string => Boolean(candidate),
  );

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next recovery strategy.
    }
  }

  throw new AiOutputParseError(content);
}

function truncateString(value: string, maxLength: number): string {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return trimmed.slice(0, maxLength).trimEnd();
}

function normalizeLeadScoringOutput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const output = { ...(value as Record<string, unknown>) };

  if (typeof output.summary === "string") {
    output.summary = truncateString(output.summary, 280);
  }

  if (typeof output.rationale === "string") {
    output.rationale = truncateString(output.rationale, 500);
  }

  if (typeof output.recommended_action === "string") {
    output.recommended_action = truncateString(output.recommended_action, 240);
  }

  return output;
}

export function parseLeadScoringOutput(content: string): LeadScoreOutput {
  const parsed = normalizeLeadScoringOutput(parseJsonLikeContent(content));

  const result = LeadScoreOutputSchema.safeParse(parsed);

  if (!result.success) {
    throw new AiOutputSchemaError(content);
  }

  return result.data;
}
