import { and, desc, eq } from "drizzle-orm";

import { contacts, leadScores, leads } from "@syrantis/db";
import type { ContactContextWarningCode } from "@syrantis/shared";

import type { WorkspaceDbTransaction } from "../lib/db.js";
import {
  findLeadContactContextAggregateInTx,
  findLeadContactContextSourceInTx,
} from "../repositories/lead-contact-context.js";
import { findWorkspaceContextProfileInTx } from "../repositories/workspace-context.js";
import { createLeadContactContextService } from "./lead-contact-context.js";
import { redactText } from "./ai/pii-redaction.js";

export type DraftGenerationContext = {
  lead: {
    id: string;
    source: string;
    status: string;
    receivedAt: string | null;
    subjectSnippet: string | null;
    bodySnippet: string | null;
  };
  latestScore: {
    present: boolean;
    score: number | null;
    scoreBand: "cold" | "warm" | "hot" | null;
    confidence: number | null;
    intent: string | null;
    urgency: string | null;
    recommendedAction: string | null;
  };
  companyContext: {
    present: boolean;
    companyName: string | null;
    sector: string | null;
    language: string | null;
    timezone: string | null;
    safeContextLines: string[];
  };
  contactContext: {
    present: boolean;
    contactKeyPresent: boolean;
    matchedBy: "contact_id" | "email" | null;
    hasPriorContext: boolean;
    previousLeadCount: number;
    previousDraftCount: number;
    previousOutboundCount: number;
    lastPriorLeadAt: string | null;
    lastOutboundAt: string | null;
    lastOutboundDeliveryStatus: "delivered" | "bounced" | "complained" | null;
    warnings: ContactContextWarningCode[];
  };
};

export type DraftGenerationContextAssembly = {
  context: DraftGenerationContext;
  draftContactId: string | null;
  sourceLeadScoreId: string | null;
};

type LeadContextRow = {
  leadId: string;
  source: string;
  status: string;
  rawContent: string | null;
  receivedAt: Date | null;
  contactId: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
};

type LatestScoreRow = {
  id: string;
  score: number;
  qualification: string;
  recommendedAction: string;
  confidence: number;
} | null;

const instructionLikePatterns = [
  /\bsystem\s+override\b/gi,
  /\bignore\s+(?:all\s+)?previous\s+instructions\b/gi,
  /\bdeveloper\s+message\b/gi,
  /\bprompt\s+override\b/gi,
  /\bsystem\s+prompt\b/gi,
  /\bdo\s+not\s+follow\s+(?:the\s+)?instructions\b/gi,
];

const forbiddenCompanyKeyParts = [
  "system",
  "prompt",
  "instruction",
  "instructions",
  "override",
  "command",
  "rules",
  "developer",
];

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength).trimEnd() : trimmed;
}

function neutralizeInstructionLikeTokens(value: string): string {
  return instructionLikePatterns.reduce(
    (current, pattern) => current.replace(pattern, "[neutralized_instruction_token]"),
    value,
  );
}

function safeLeadText(
  value: string | null | undefined,
  maxLength: number,
  knownTerms: string[],
): string | null {
  const trimmed = trimToNull(value);

  if (!trimmed) {
    return null;
  }

  return truncate(neutralizeInstructionLikeTokens(redactText(trimmed, knownTerms)), maxLength);
}

function compactKnownTerms(lead: LeadContextRow): string[] {
  const firstName = lead.contactFirstName?.trim() ?? "";
  const lastName = lead.contactLastName?.trim() ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return [firstName, lastName, fullName].filter((value) => value.length >= 2);
}

function readLabeledBlock(rawContent: string, label: string): string | null {
  const pattern = new RegExp(`(?:^|\\n)${label}:\\s*([\\s\\S]*?)(?=\\n\\n[A-Z][A-Za-z ]{0,30}:|$)`, "i");
  return trimToNull(rawContent.match(pattern)?.[1]);
}

function removeKnownUnsafeSummaryLines(rawContent: string): string {
  return rawContent
    .split(/\n+/)
    .filter((line) => !/^\s*(?:from|contact|email|phone|firstName|lastName)\s*[:=]/i.test(line))
    .join("\n")
    .trim();
}

function leadSafeContent(lead: LeadContextRow): {
  subjectSnippet: string | null;
  bodySnippet: string | null;
} {
  const rawContent = lead.rawContent ?? "";
  const knownTerms = compactKnownTerms(lead);
  const subject = readLabeledBlock(rawContent, "Subject");
  const body = readLabeledBlock(rawContent, "Body") ?? removeKnownUnsafeSummaryLines(rawContent);

  return {
    subjectSnippet: safeLeadText(subject, 160, knownTerms),
    bodySnippet: safeLeadText(body, 1200, knownTerms),
  };
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function scoreBand(value: string, score: number): "cold" | "warm" | "hot" {
  if (value === "cold" || value === "warm" || value === "hot") {
    return value;
  }

  if (score >= 75) {
    return "hot";
  }

  return score >= 45 ? "warm" : "cold";
}

function scoreContext(score: LatestScoreRow): DraftGenerationContext["latestScore"] {
  if (!score) {
    return {
      present: false,
      score: null,
      scoreBand: null,
      confidence: null,
      intent: null,
      urgency: null,
      recommendedAction: null,
    };
  }

  return {
    present: true,
    score: score.score,
    scoreBand: scoreBand(score.qualification, score.score),
    confidence: score.confidence,
    intent: null,
    urgency: null,
    recommendedAction: safeLeadText(score.recommendedAction, 240, []),
  };
}

function isForbiddenCompanyKey(key: string): boolean {
  const lower = key.toLowerCase();
  return forbiddenCompanyKeyParts.some((part) => lower.includes(part));
}

function safeScalar(value: unknown): string | null {
  if (typeof value === "string") {
    return truncate(neutralizeInstructionLikeTokens(redactText(value)), 180);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function collectContextLines(value: unknown, prefix: string, lines: string[]): void {
  if (lines.length >= 12) {
    return;
  }

  if (Array.isArray(value)) {
    for (const child of value.slice(0, 5)) {
      collectContextLines(child, prefix, lines);
    }

    return;
  }

  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (isForbiddenCompanyKey(key)) {
        continue;
      }

      collectContextLines(child, prefix ? `${prefix}.${key}` : key, lines);
    }

    return;
  }

  const scalar = safeScalar(value);

  if (scalar && prefix && lines.length < 12) {
    lines.push(truncate(`${prefix}: ${scalar}`, 220));
  }
}

async function loadLeadAndScore(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; leadId: string },
): Promise<{ lead: LeadContextRow; latestScore: LatestScoreRow } | null> {
  const [lead] = await tx
    .select({
      leadId: leads.id,
      source: leads.source,
      status: leads.status,
      rawContent: leads.rawContent,
      receivedAt: leads.receivedAt,
      contactId: leads.contactId,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
    })
    .from(leads)
    .leftJoin(
      contacts,
      and(eq(contacts.id, leads.contactId), eq(contacts.workspaceId, input.workspaceId)),
    )
    .where(and(eq(leads.id, input.leadId), eq(leads.workspaceId, input.workspaceId)))
    .limit(1);

  if (!lead) {
    return null;
  }

  const [latestScore] = await tx
    .select({
      id: leadScores.id,
      score: leadScores.score,
      qualification: leadScores.qualification,
      recommendedAction: leadScores.recommendedAction,
      confidence: leadScores.confidence,
    })
    .from(leadScores)
    .where(and(eq(leadScores.workspaceId, input.workspaceId), eq(leadScores.leadId, input.leadId)))
    .orderBy(desc(leadScores.createdAt))
    .limit(1);

  return {
    lead,
    latestScore: latestScore ?? null,
  };
}

async function contactContextInTx(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; leadId: string },
): Promise<DraftGenerationContext["contactContext"]> {
  const service = createLeadContactContextService({
    repository: {
      findSource: (repositoryInput) => findLeadContactContextSourceInTx(tx, repositoryInput),
      findAggregate: (repositoryInput) => findLeadContactContextAggregateInTx(tx, repositoryInput),
    },
  });
  const result = await service.getContactContext(input.workspaceId, input.leadId);

  if (result.result === "not_found") {
    return {
      present: false,
      contactKeyPresent: false,
      matchedBy: null,
      hasPriorContext: false,
      previousLeadCount: 0,
      previousDraftCount: 0,
      previousOutboundCount: 0,
      lastPriorLeadAt: null,
      lastOutboundAt: null,
      lastOutboundDeliveryStatus: null,
      warnings: [],
    };
  }

  return {
    present: true,
    contactKeyPresent: result.context.contactKeyPresent,
    matchedBy: result.context.matchedBy,
    hasPriorContext: result.context.hasPriorContext,
    previousLeadCount: result.context.previousLeadCount,
    previousDraftCount: result.context.previousDraftCount,
    previousOutboundCount: result.context.previousOutboundCount,
    lastPriorLeadAt: result.context.lastPriorLeadAt,
    lastOutboundAt: result.context.lastOutboundAt,
    lastOutboundDeliveryStatus: result.context.lastOutboundDeliveryStatus,
    warnings: result.context.warnings,
  };
}

async function companyContextInTx(
  tx: WorkspaceDbTransaction,
  workspaceId: string,
): Promise<DraftGenerationContext["companyContext"]> {
  const profile = await findWorkspaceContextProfileInTx(tx, workspaceId);

  if (!profile) {
    return {
      present: false,
      companyName: null,
      sector: null,
      language: null,
      timezone: null,
      safeContextLines: [],
    };
  }

  const safeContextLines: string[] = [];
  collectContextLines(profile.contextJson, "", safeContextLines);

  return {
    present: true,
    companyName: trimToNull(profile.companyName),
    sector: trimToNull(profile.sector),
    language: trimToNull(profile.language),
    timezone: trimToNull(profile.timezone),
    safeContextLines,
  };
}

export async function assembleDraftGenerationContext(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; leadId: string },
): Promise<DraftGenerationContextAssembly | null> {
  const leadAndScore = await loadLeadAndScore(tx, input);

  if (!leadAndScore) {
    return null;
  }

  const safeContent = leadSafeContent(leadAndScore.lead);
  const companyContext = await companyContextInTx(tx, input.workspaceId);
  const contactContext = await contactContextInTx(tx, input);

  return {
    draftContactId: leadAndScore.lead.contactId,
    sourceLeadScoreId: leadAndScore.latestScore?.id ?? null,
    context: {
      lead: {
        id: leadAndScore.lead.leadId,
        source: leadAndScore.lead.source,
        status: leadAndScore.lead.status,
        receivedAt: toIso(leadAndScore.lead.receivedAt),
        subjectSnippet: safeContent.subjectSnippet,
        bodySnippet: safeContent.bodySnippet,
      },
      latestScore: scoreContext(leadAndScore.latestScore),
      companyContext,
      contactContext,
    },
  };
}
