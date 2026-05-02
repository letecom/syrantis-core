import { and, eq } from "drizzle-orm";

import { aiRuns, contacts, leadScores, leads, organizations } from "@syrantis/db";
import type { ScoreLeadJobPayload } from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import {
  AiOutputParseError,
  AiOutputSchemaError,
  buildLeadScoringPrompt,
  LEAD_SCORING_PROMPT_TEMPLATE_ID,
  parseLeadScoringOutput,
  type LeadScoringPrompt,
} from "./ai/lead-scoring-prompt.js";
import {
  AiFinishReasonError,
  AiProviderEmptyResponseError,
  OpenRouterProvider,
} from "./ai/openrouter-provider.js";
import { redactLeadForScoring } from "./ai/pii-redaction.js";
import {
  calculateAiCostMicroUsd,
  convertMicroUsdToCentsConservative,
  resolveAllowedAiModel,
} from "./ai/pricing.js";
import type { AiCompletionOutput, AiProvider } from "./ai/providers.js";

export type HandleScoreLeadJobInput = {
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

type PreparedScoreLeadRun = {
  aiRunId: string;
  model: string;
  prompt: LeadScoringPrompt;
  startedAt: number;
};

function resolveModel(input?: string): string {
  return resolveAllowedAiModel(input);
}

function resolveErrorCode(error: unknown): string {
  if (error instanceof AiOutputParseError || error instanceof AiOutputSchemaError) {
    return error.code;
  }

  if (
    error instanceof AiFinishReasonError ||
    error instanceof AiProviderEmptyResponseError ||
    (error instanceof Error && "code" in error && typeof error.code === "string")
  ) {
    return String(error.code).slice(0, 120);
  }

  if (error instanceof Error && error.message) {
    return error.message.trim().slice(0, 120) || "AI_SCORING_FAILED";
  }

  return "AI_SCORING_FAILED";
}

function resolveFinishReason(error: unknown, completion: AiCompletionOutput | null): string | null {
  if (completion?.finishReason) {
    return completion.finishReason;
  }

  if (error instanceof AiFinishReasonError || error instanceof AiProviderEmptyResponseError) {
    return error.finishReason;
  }

  return null;
}

function resolveRawPreview(error: unknown): string | null {
  if (error instanceof AiOutputParseError || error instanceof AiOutputSchemaError) {
    return error.rawPreview;
  }

  return null;
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

async function prepareScoreLeadRun(input: {
  workspaceId: string;
  jobId: string;
  leadId: string;
  model: string;
}): Promise<PreparedScoreLeadRun> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const row = await loadLeadContext(tx, {
      workspaceId: input.workspaceId,
      leadId: input.leadId,
    });

    if (!row) {
      throw new Error("LEAD_NOT_FOUND");
    }

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

    const [aiRun] = await tx
      .insert(aiRuns)
      .values({
        workspaceId: input.workspaceId,
        jobId: input.jobId,
        referenceType: "lead",
        referenceId: input.leadId,
        purpose: "scoring",
        provider: "openrouter",
        modelUsed: input.model,
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

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "ai_run.started",
      entityType: "ai_run",
      entityId: aiRun.id,
      metadataJson: {
        jobId: input.jobId,
        aiRunId: aiRun.id,
        model: input.model,
      },
    });

    return {
      aiRunId: aiRun.id,
      model: input.model,
      prompt,
      startedAt: Date.now(),
    };
  });
}

async function persistSuccessfulScoreLeadRun(input: {
  workspaceId: string;
  jobId: string;
  leadId: string;
  aiRunId: string;
  completion: AiCompletionOutput;
  latencyMs: number;
}): Promise<void> {
  const parsed = parseLeadScoringOutput(input.completion.content);
  const costEstimateMicroUsd = calculateAiCostMicroUsd({
    model: input.completion.model,
    inputTokens: input.completion.inputTokens,
    outputTokens: input.completion.outputTokens,
  });
  const costEstimateCents = convertMicroUsdToCentsConservative(costEstimateMicroUsd);

  await withWorkspaceDb(input.workspaceId, async (tx) => {
    const [leadScore] = await tx
      .insert(leadScores)
      .values({
        workspaceId: input.workspaceId,
        leadId: input.leadId,
        aiRunId: input.aiRunId,
        score: parsed.score,
        qualification: parsed.qualification,
        summary: parsed.summary,
        rationale: parsed.rationale,
        recommendedAction: parsed.recommended_action,
        confidence: parsed.confidence,
        model: input.completion.model,
        promptTemplateId: LEAD_SCORING_PROMPT_TEMPLATE_ID,
      })
      .returning();

    if (!leadScore) {
      throw new Error("LEAD_SCORE_CREATE_FAILED");
    }

    await tx
      .update(aiRuns)
      .set({
        status: "success",
        modelUsed: input.completion.model,
        outputPayload: parsed,
        outputJson: parsed,
        inputTokens: input.completion.inputTokens,
        outputTokens: input.completion.outputTokens,
        costEstimateCents,
        costEstimateMicroUsd,
        costCents: costEstimateCents,
        latencyMs: input.latencyMs,
        finishReason: input.completion.finishReason,
        errorMessage: null,
      })
      .where(and(eq(aiRuns.id, input.aiRunId), eq(aiRuns.workspaceId, input.workspaceId)));

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "ai_run.completed",
      entityType: "ai_run",
      entityId: input.aiRunId,
      metadataJson: {
        jobId: input.jobId,
        aiRunId: input.aiRunId,
        inputTokens: input.completion.inputTokens,
        outputTokens: input.completion.outputTokens,
        costEstimateMicroUsd,
        costEstimateCents,
        model: input.completion.model,
      },
    });

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "lead.scored",
      entityType: "lead",
      entityId: input.leadId,
      metadataJson: {
        jobId: input.jobId,
        aiRunId: input.aiRunId,
        leadScoreId: leadScore.id,
        score: parsed.score,
        qualification: parsed.qualification,
        model: input.completion.model,
      },
    });
  });
}

async function persistFailedScoreLeadRun(input: {
  workspaceId: string;
  jobId: string;
  aiRunId: string;
  model: string;
  completion: AiCompletionOutput | null;
  error: unknown;
}): Promise<void> {
  const errorCode = resolveErrorCode(input.error);
  const rawPreview = resolveRawPreview(input.error);
  const finishReason = resolveFinishReason(input.error, input.completion);
  const costEstimateMicroUsd = input.completion?.costEstimateMicroUsd ?? 0;
  const costEstimateCents = convertMicroUsdToCentsConservative(costEstimateMicroUsd);

  await withWorkspaceDb(input.workspaceId, async (tx) => {
    await tx
      .update(aiRuns)
      .set({
        status: "error",
        outputPayload: rawPreview ? { rawPreview } : null,
        outputJson: rawPreview ? { rawPreview } : null,
        outputText: rawPreview,
        inputTokens: input.completion?.inputTokens ?? 0,
        outputTokens: input.completion?.outputTokens ?? 0,
        costEstimateCents,
        costEstimateMicroUsd,
        costCents: costEstimateCents,
        finishReason,
        errorMessage: errorCode,
      })
      .where(and(eq(aiRuns.id, input.aiRunId), eq(aiRuns.workspaceId, input.workspaceId)));

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "ai_run.failed",
      entityType: "ai_run",
      entityId: input.aiRunId,
      metadataJson: {
        jobId: input.jobId,
        aiRunId: input.aiRunId,
        errorCode,
        finishReason,
        model: input.completion?.model ?? input.model,
      },
    });
  });
}

export async function handleScoreLeadJob(input: HandleScoreLeadJobInput): Promise<void> {
  const model = resolveModel(input.model);
  const prepared = await prepareScoreLeadRun({
    workspaceId: input.workspaceId,
    jobId: input.jobId,
    leadId: input.payload.leadId,
    model,
  });
  let completion: AiCompletionOutput | null = null;

  try {
    const provider = input.provider ?? new OpenRouterProvider();
    completion = await provider.complete({
      model: prepared.model,
      messages: prepared.prompt.messages,
      maxTokens: 1000,
      temperature: 0.1,
      timeoutMs: 15_000,
    });

    await persistSuccessfulScoreLeadRun({
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      leadId: input.payload.leadId,
      aiRunId: prepared.aiRunId,
      completion,
      latencyMs: Date.now() - prepared.startedAt,
    });
  } catch (error) {
    await persistFailedScoreLeadRun({
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      aiRunId: prepared.aiRunId,
      model: prepared.model,
      completion,
      error,
    });

    throw error;
  }
}
