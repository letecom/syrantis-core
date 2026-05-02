import { and, eq } from "drizzle-orm";

import { aiRuns, contacts, leadScores, leads, organizations } from "@syrantis/db";
import type { ScoreLeadJobPayload } from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import {
  AiOutputParseError,
  buildLeadScoringPrompt,
  LEAD_SCORING_PROMPT_TEMPLATE_ID,
  parseLeadScoringOutput,
} from "./ai/lead-scoring-prompt.js";
import { DEFAULT_AI_MODEL, OpenRouterProvider } from "./ai/openrouter-provider.js";
import { redactLeadForScoring } from "./ai/pii-redaction.js";
import type { AiCompletionOutput, AiProvider } from "./ai/providers.js";

export type HandleScoreLeadJobInput = {
  tx: WorkspaceDbTransaction;
  workspaceId: string;
  jobId: string;
  payload: ScoreLeadJobPayload;
  provider?: AiProvider;
  model?: string;
};

type LeadContextRow = {
  leadId: string;
  source: string;
  status: string;
  rawContent: string | null;
  metadataJson: Record<string, unknown>;
  contactRoleTitle: string | null;
  organizationSector: string | null;
  organizationStatus: string | null;
};

function resolveModel(input?: string): string {
  return input?.trim() || process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;
}

function resolveErrorCode(error: unknown): string {
  if (error instanceof AiOutputParseError) {
    return error.code;
  }

  if (error instanceof Error && error.message) {
    return error.message.trim().slice(0, 120) || "AI_SCORING_FAILED";
  }

  return "AI_SCORING_FAILED";
}

async function loadLeadContext(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; leadId: string },
): Promise<LeadContextRow | null> {
  const [row] = await tx
    .select({
      leadId: leads.id,
      source: leads.source,
      status: leads.status,
      rawContent: leads.rawContent,
      metadataJson: leads.normalizedJson,
      contactRoleTitle: contacts.roleTitle,
      organizationSector: organizations.sector,
      organizationStatus: organizations.status,
    })
    .from(leads)
    .leftJoin(
      contacts,
      and(eq(contacts.id, leads.contactId), eq(contacts.workspaceId, input.workspaceId)),
    )
    .leftJoin(
      organizations,
      and(eq(organizations.id, leads.organizationId), eq(organizations.workspaceId, input.workspaceId)),
    )
    .where(and(eq(leads.id, input.leadId), eq(leads.workspaceId, input.workspaceId)))
    .limit(1);

  return row ?? null;
}

async function persistFailedAiRunAudit(input: {
  workspaceId: string;
  jobId: string;
  leadId: string;
  model: string;
  promptJson: Record<string, unknown>;
  completion: AiCompletionOutput | null;
  error: unknown;
}): Promise<void> {
  const errorCode = resolveErrorCode(input.error);
  const rawPreview = input.error instanceof AiOutputParseError ? input.error.rawPreview : null;

  await withWorkspaceDb(input.workspaceId, async (tx) => {
    const [aiRun] = await tx
      .insert(aiRuns)
      .values({
        workspaceId: input.workspaceId,
        jobId: input.jobId,
        referenceType: "lead",
        referenceId: input.leadId,
        purpose: "scoring",
        provider: "openrouter",
        modelUsed: input.completion?.model ?? input.model,
        promptTemplateId: LEAD_SCORING_PROMPT_TEMPLATE_ID,
        promptJson: input.promptJson,
        inputPayload: input.promptJson,
        outputPayload: rawPreview ? { rawPreview } : null,
        outputJson: rawPreview ? { rawPreview } : null,
        outputText: rawPreview,
        inputTokens: input.completion?.inputTokens ?? 0,
        outputTokens: input.completion?.outputTokens ?? 0,
        costEstimateCents: 0,
        costCents: 0,
        skillName: "lead_score",
        promptFile: LEAD_SCORING_PROMPT_TEMPLATE_ID,
        promptHash: LEAD_SCORING_PROMPT_TEMPLATE_ID,
        status: "error",
        errorMessage: errorCode,
      })
      .returning();

    if (!aiRun) {
      throw new Error("AI_RUN_FAILED_AUDIT_CREATE_FAILED");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "ai_run.failed",
      entityType: "ai_run",
      entityId: aiRun.id,
      metadataJson: {
        jobId: input.jobId,
        aiRunId: aiRun.id,
        errorCode,
        model: input.completion?.model ?? input.model,
      },
    });
  });
}

export async function handleScoreLeadJob(input: HandleScoreLeadJobInput): Promise<void> {
  const row = await loadLeadContext(input.tx, {
    workspaceId: input.workspaceId,
    leadId: input.payload.leadId,
  });

  if (!row) {
    throw new Error("LEAD_NOT_FOUND");
  }

  const model = resolveModel(input.model);
  const redactedLead = redactLeadForScoring({
    lead: {
      source: row.source,
      status: row.status,
      rawContent: row.rawContent,
      metadataJson: row.metadataJson,
    },
    contact: {
      roleTitle: row.contactRoleTitle,
    },
    organization: {
      sector: row.organizationSector,
      status: row.organizationStatus,
    },
  });
  const prompt = buildLeadScoringPrompt(redactedLead);
  const startedAt = Date.now();

  const [aiRun] = await input.tx
    .insert(aiRuns)
    .values({
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      referenceType: "lead",
      referenceId: input.payload.leadId,
      purpose: "scoring",
      provider: "openrouter",
      modelUsed: model,
      promptTemplateId: LEAD_SCORING_PROMPT_TEMPLATE_ID,
      promptJson: prompt.promptJson,
      inputPayload: prompt.promptJson,
      skillName: "lead_score",
      promptFile: LEAD_SCORING_PROMPT_TEMPLATE_ID,
      promptHash: LEAD_SCORING_PROMPT_TEMPLATE_ID,
      status: "running",
    })
    .returning();

  if (!aiRun) {
    throw new Error("AI_RUN_CREATE_FAILED");
  }

  await createActivityLog(input.tx, {
    workspaceId: input.workspaceId,
    actorUserId: null,
    action: "ai_run.started",
    entityType: "ai_run",
    entityId: aiRun.id,
    metadataJson: {
      jobId: input.jobId,
      aiRunId: aiRun.id,
      model,
    },
  });

  let completion: AiCompletionOutput | null = null;

  try {
    const provider = input.provider ?? new OpenRouterProvider();
    completion = await provider.complete({
      model,
      messages: prompt.messages,
      maxTokens: 600,
      temperature: 0.1,
      timeoutMs: 30_000,
    });
    const parsed = parseLeadScoringOutput(completion.content);
    const latencyMs = Date.now() - startedAt;

    const [leadScore] = await input.tx
      .insert(leadScores)
      .values({
        workspaceId: input.workspaceId,
        leadId: input.payload.leadId,
        aiRunId: aiRun.id,
        score: parsed.score,
        qualification: parsed.qualification,
        summary: parsed.summary,
        rationale: parsed.rationale,
        recommendedAction: parsed.recommended_action,
        confidence: parsed.confidence,
        model: completion.model,
        promptTemplateId: LEAD_SCORING_PROMPT_TEMPLATE_ID,
      })
      .returning();

    if (!leadScore) {
      throw new Error("LEAD_SCORE_CREATE_FAILED");
    }

    await input.tx
      .update(aiRuns)
      .set({
        status: "success",
        modelUsed: completion.model,
        outputPayload: parsed,
        outputJson: parsed,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
        costEstimateCents: 0,
        costCents: 0,
        latencyMs,
        errorMessage: null,
      })
      .where(and(eq(aiRuns.id, aiRun.id), eq(aiRuns.workspaceId, input.workspaceId)));

    await createActivityLog(input.tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "ai_run.completed",
      entityType: "ai_run",
      entityId: aiRun.id,
      metadataJson: {
        jobId: input.jobId,
        aiRunId: aiRun.id,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
        costEstimateCents: 0,
        model: completion.model,
      },
    });

    await createActivityLog(input.tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "lead.scored",
      entityType: "lead",
      entityId: input.payload.leadId,
      metadataJson: {
        jobId: input.jobId,
        aiRunId: aiRun.id,
        leadScoreId: leadScore.id,
        score: parsed.score,
        qualification: parsed.qualification,
        model: completion.model,
      },
    });
  } catch (error) {
    const errorCode = resolveErrorCode(error);

    await createActivityLog(input.tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "ai_run.failed",
      entityType: "ai_run",
      entityId: aiRun.id,
      metadataJson: {
        jobId: input.jobId,
        aiRunId: aiRun.id,
        errorCode,
        model,
      },
    });

    await persistFailedAiRunAudit({
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      leadId: input.payload.leadId,
      model,
      promptJson: prompt.promptJson,
      completion,
      error,
    });

    throw error;
  }
}
