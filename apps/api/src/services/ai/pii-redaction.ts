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

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+|00)?\d[\d\s().-]{7,}\d/g;
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

export function redactText(value: string): string {
  return value.replace(EMAIL_PATTERN, "[redacted_email]").replace(PHONE_PATTERN, "[redacted_phone]");
}

function truncate(value: string): string {
  return value.length > MAX_REDACTED_TEXT_LENGTH ? `${value.slice(0, MAX_REDACTED_TEXT_LENGTH)}...` : value;
}

function redactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => SAFE_METADATA_KEYS.has(key))
      .map(([key, value]) => {
        if (typeof value === "string") {
          return [key, truncate(redactText(value))];
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
