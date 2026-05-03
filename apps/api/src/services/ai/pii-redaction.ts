export type LeadScoringRedactionInput = {
  lead: {
    source: string;
    status: string;
    rawContent: string | null;
    metadataJson: Record<string, unknown>;
  };
  contact?: {
    roleTitle: string | null;
  } | null;
  organization?: {
    sector: string | null;
    status: string | null;
  } | null;
};

export type LeadDraftGenerationRedactionInput = LeadScoringRedactionInput & {
  contact?: {
    firstName?: string | null;
    lastName?: string | null;
    roleTitle: string | null;
  } | null;
  organization?: {
    name?: string | null;
    sector: string | null;
    status: string | null;
    websiteUrl?: string | null;
  } | null;
  latestScore?: {
    score: number;
    qualification: string;
    summary: string;
    rationale: string;
    recommendedAction: string;
    confidence: number;
  } | null;
};

export type RedactedLeadForScoring = {
  lead: {
    source: string;
    status: string;
    rawContent: string | null;
    metadata: Record<string, unknown>;
  };
  contact: {
    roleTitle: string | null;
  } | null;
  organization: {
    sector: string | null;
    status: string | null;
  } | null;
};

export type RedactedLeadForDraftGeneration = RedactedLeadForScoring & {
  latestScore: {
    score: number;
    qualification: string;
    summary: string;
    rationale: string;
    recommendedAction: string;
    confidence: number;
  } | null;
};

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+|00)?\d[\d\s().-]{7,}\d/g;
const WEBSITE_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const STREET_ADDRESS_PATTERN = /\b\d{1,5}\s+(?:(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|route|impasse|place)\s+[A-Za-zÀ-ÿ0-9.' -]{2,}|[A-Za-zÀ-ÿ0-9.' -]{2,}\s+(?:street|st\.?|road|rd\.?|lane|ln\.?))\b[^\n,.;]*/gi;
const MAX_REDACTED_TEXT_LENGTH = 700;

const SAFE_METADATA_KEYS = new Set([
  "campaign",
  "source",
  "urgency",
  "intent",
  "category",
  "service",
  "budgetRange",
  "timeline",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactKnownTerm(value: string, term: string, replacement: string): string {
  const trimmed = term.trim();

  if (trimmed.length < 2) {
    return value;
  }

  return value.replace(new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "gi"), replacement);
}

export function redactText(value: string, knownTerms: string[] = []): string {
  let redacted = value
    .replace(EMAIL_PATTERN, "[redacted_email]")
    .replace(PHONE_PATTERN, "[redacted_phone]")
    .replace(WEBSITE_PATTERN, "[redacted_website]")
    .replace(STREET_ADDRESS_PATTERN, "[redacted_address]");

  for (const term of knownTerms) {
    redacted = redactKnownTerm(redacted, term, "[redacted_name]");
  }

  return redacted;
}

function truncate(value: string): string {
  return value.length > MAX_REDACTED_TEXT_LENGTH ? `${value.slice(0, MAX_REDACTED_TEXT_LENGTH)}...` : value;
}

function redactMetadata(metadata: Record<string, unknown>, knownTerms: string[] = []): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => SAFE_METADATA_KEYS.has(key))
      .map(([key, value]) => {
        if (typeof value === "string") {
          return [key, truncate(redactText(value, knownTerms))];
        }

        if (typeof value === "number" || typeof value === "boolean" || value === null) {
          return [key, value];
        }

        return [key, "[redacted_structured_value]"];
      }),
  );
}

export function redactLeadForScoring(input: LeadScoringRedactionInput): RedactedLeadForScoring {
  const rawContent = input.lead.rawContent ? truncate(redactText(input.lead.rawContent)) : null;

  return {
    lead: {
      source: input.lead.source,
      status: input.lead.status,
      rawContent,
      metadata: redactMetadata(input.lead.metadataJson),
    },
    contact: input.contact
      ? {
          roleTitle: input.contact.roleTitle,
        }
      : null,
    organization: input.organization
      ? {
          sector: input.organization.sector,
          status: input.organization.status,
        }
      : null,
  };
}

function compactKnownTerms(input: LeadDraftGenerationRedactionInput): string[] {
  const firstName = input.contact?.firstName?.trim() || "";
  const lastName = input.contact?.lastName?.trim() || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return [
    firstName,
    lastName,
    fullName,
    input.organization?.name ?? "",
    input.organization?.websiteUrl ?? "",
  ].filter((value) => value.trim().length >= 2);
}

function truncateScoreText(value: string, maxLength: number): string {
  const trimmed = redactText(value).trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return trimmed.slice(0, maxLength).trimEnd();
}

export function redactLeadForDraftGeneration(
  input: LeadDraftGenerationRedactionInput,
): RedactedLeadForDraftGeneration {
  const knownTerms = compactKnownTerms(input);
  const rawContent = input.lead.rawContent
    ? truncate(redactText(input.lead.rawContent, knownTerms))
    : null;

  return {
    lead: {
      source: input.lead.source,
      status: input.lead.status,
      rawContent,
      metadata: redactMetadata(input.lead.metadataJson, knownTerms),
    },
    contact: input.contact
      ? {
          roleTitle: input.contact.roleTitle,
        }
      : null,
    organization: input.organization
      ? {
          sector: input.organization.sector,
          status: input.organization.status,
        }
      : null,
    latestScore: input.latestScore
      ? {
          score: input.latestScore.score,
          qualification: input.latestScore.qualification,
          summary: truncateScoreText(input.latestScore.summary, 280),
          rationale: truncateScoreText(input.latestScore.rationale, 500),
          recommendedAction: truncateScoreText(input.latestScore.recommendedAction, 240),
          confidence: input.latestScore.confidence,
        }
      : null,
  };
}
