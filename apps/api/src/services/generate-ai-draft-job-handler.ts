import { and, eq } from "drizzle-orm";

import { aiRuns, drafts } from "@syrantis/db";
import type { GenerateAiDraftJobPayload } from "@syrantis/shared";

import { withWorkspaceDb } from "../lib/db.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import {
  assertSafeDraftGenerationOutput,
  buildDraftGenerationPrompt,
  DRAFT_GENERATION_PROMPT_TEMPLATE_ID,
  DraftGenerationOutputParseError,
  DraftGenerationOutputSafetyError,
  DraftGenerationOutputSchemaError,
  parseDraftGenerationOutput,
  type DraftGenerationPrompt,
} from "./ai/draft-generation-prompt.js";
import {
  AiFinishReasonError,
  AiProviderEmptyResponseError,
  OpenRouterProvider,
} from "./ai/openrouter-provider.js";
import { convertMicroUsdToCentsConservative, resolveAllowedAiDraftModel } from "./ai/pricing.js";
import type { AiCompletionOutput, AiProvider } from "./ai/providers.js";
import {
  assembleDraftGenerationContext,
  type DraftGenerationContext,
} from "./draft-generation-context.js";

export type HandleGenerateAiDraftJobInput = {
  workspaceId: string;
  jobId: string;
  payload: GenerateAiDraftJobPayload;
  provider?: AiProvider;
  model?: string;
};

type PreparedDraftGenerationRun = {
  aiRunId: string;
  model: string;
  prompt: DraftGenerationPrompt;
  draftContactId: string | null;
  sourceLeadScoreId: string | null;
  context: DraftGenerationContext;
  startedAt: number;
};

class DraftGenerationBlockedError extends Error {
  readonly code: string;

  constructor(reason: "prior_complaint") {
    super(`AI_DRAFT_GENERATION_BLOCKED_${reason.toUpperCase()}`);
    this.name = "DraftGenerationBlockedError";
    this.code = `AI_DRAFT_GENERATION_BLOCKED_${reason.toUpperCase()}`;
  }
}

function resolveModel(input?: string): string {
  return resolveAllowedAiDraftModel(input);
}

function contextSourcesUsed(context: DraftGenerationContext) {
  return {
    lead: true,
    score: context.latestScore.present,
    companyContext: context.companyContext.present,
    contactContext: context.contactContext.present,
    responsePolicy: context.responsePolicy.present,
  };
}

function resolveErrorCode(error: unknown): string {
  if (
    error instanceof DraftGenerationOutputParseError ||
    error instanceof DraftGenerationOutputSchemaError ||
    error instanceof DraftGenerationOutputSafetyError ||
    error instanceof DraftGenerationBlockedError
  ) {
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
    return error.message.trim().slice(0, 120) || "AI_DRAFT_GENERATION_FAILED";
  }

  return "AI_DRAFT_GENERATION_FAILED";
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
  if (
    error instanceof DraftGenerationOutputParseError ||
    error instanceof DraftGenerationOutputSchemaError ||
    error instanceof DraftGenerationOutputSafetyError
  ) {
    return error.rawPreview;
  }

  return null;
}

async function prepareDraftGenerationRun(input: {
  workspaceId: string;
  jobId: string;
  leadId: string;
  model: string;
}): Promise<PreparedDraftGenerationRun | { blocked: true }> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const assembly = await assembleDraftGenerationContext(tx, {
      workspaceId: input.workspaceId,
      leadId: input.leadId,
    });

    if (!assembly) {
      throw new Error("LEAD_NOT_FOUND");
    }

    if (assembly.context.contactContext.warnings.includes("prior_complaint")) {
      await createActivityLog(tx, {
        workspaceId: input.workspaceId,
        actorUserId: null,
        action: "draft.ai_generation_blocked",
        entityType: "lead",
        entityId: input.leadId,
        metadataJson: {
          leadId: input.leadId,
          blockedReason: "prior_complaint",
          contextSourcesUsed: contextSourcesUsed(assembly.context),
          warningCount: assembly.context.contactContext.warnings.length,
          warnings: assembly.context.contactContext.warnings,
        },
      });

      return { blocked: true };
    }

    const prompt = buildDraftGenerationPrompt(assembly.context);
    const [aiRun] = await tx
      .insert(aiRuns)
      .values({
        workspaceId: input.workspaceId,
        jobId: input.jobId,
        referenceType: "lead",
        referenceId: input.leadId,
        purpose: "draft_generation",
        provider: "openrouter",
        modelUsed: input.model,
        promptTemplateId: DRAFT_GENERATION_PROMPT_TEMPLATE_ID,
        promptJson: prompt.promptJson,
        inputPayload: prompt.promptJson,
        skillName: "draft_generation",
        promptFile: DRAFT_GENERATION_PROMPT_TEMPLATE_ID,
        promptHash: DRAFT_GENERATION_PROMPT_TEMPLATE_ID,
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
        aiRunId: aiRun.id,
        leadId: input.leadId,
        purpose: "draft_generation",
        contextSourcesUsed: contextSourcesUsed(assembly.context),
        warningCount: assembly.context.contactContext.warnings.length,
      },
    });

    return {
      aiRunId: aiRun.id,
      model: input.model,
      prompt,
      draftContactId: assembly.draftContactId,
      sourceLeadScoreId: assembly.sourceLeadScoreId,
      context: assembly.context,
      startedAt: Date.now(),
    };
  });
}

function draftMetadata(input: {
  aiRunId: string;
  sourceLeadScoreId: string | null;
}): Record<string, unknown> {
  return {
    origin: "ai_draft_generation",
    aiRunId: input.aiRunId,
    promptTemplateId: DRAFT_GENERATION_PROMPT_TEMPLATE_ID,
    ...(input.sourceLeadScoreId ? { sourceLeadScoreId: input.sourceLeadScoreId } : {}),
  };
}

async function persistSuccessfulDraftGenerationRun(input: {
  workspaceId: string;
  leadId: string;
  aiRunId: string;
  draftContactId: string | null;
  sourceLeadScoreId: string | null;
  context: DraftGenerationContext;
  completion: AiCompletionOutput;
  latencyMs: number;
}): Promise<void> {
  const parsed = parseDraftGenerationOutput(input.completion.content);
  assertSafeDraftGenerationOutput(parsed);
  const outputWithContextUsed = {
    ...parsed,
    contextUsed: contextSourcesUsed(input.context),
  };
  const costEstimateMicroUsd = input.completion.costEstimateMicroUsd;
  const costEstimateCents = convertMicroUsdToCentsConservative(costEstimateMicroUsd);

  await withWorkspaceDb(input.workspaceId, async (tx) => {
    const [draft] = await tx
      .insert(drafts)
      .values({
        workspaceId: input.workspaceId,
        leadId: input.leadId,
        contactId: input.draftContactId,
        channel: "email",
        status: "draft",
        subject: parsed.subject,
        textBody: parsed.bodyText,
        metadataJson: draftMetadata({
          aiRunId: input.aiRunId,
          sourceLeadScoreId: input.sourceLeadScoreId,
        }),
      })
      .returning();

    if (!draft) {
      throw new Error("DRAFT_CREATE_FAILED");
    }

    await tx
      .update(aiRuns)
      .set({
        status: "success",
        modelUsed: input.completion.model,
        outputPayload: outputWithContextUsed,
        outputJson: outputWithContextUsed,
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
        aiRunId: input.aiRunId,
        leadId: input.leadId,
        draftId: draft.id,
        contextSourcesUsed: contextSourcesUsed(input.context),
        warningCount: input.context.contactContext.warnings.length,
      },
    });

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "draft.ai_generated",
      entityType: "draft",
      entityId: draft.id,
      metadataJson: {
        draftId: draft.id,
        leadId: input.leadId,
        aiRunId: input.aiRunId,
        ...(input.sourceLeadScoreId ? { sourceLeadScoreId: input.sourceLeadScoreId } : {}),
        contextSourcesUsed: contextSourcesUsed(input.context),
        warningCount: input.context.contactContext.warnings.length,
      },
    });
  });
}

async function persistFailedDraftGenerationRun(input: {
  workspaceId: string;
  leadId: string;
  aiRunId: string | null;
  completion: AiCompletionOutput | null;
  error: unknown;
}): Promise<void> {
  const errorCode = resolveErrorCode(input.error);
  const rawPreview = resolveRawPreview(input.error);
  const finishReason = resolveFinishReason(input.error, input.completion);
  const costEstimateMicroUsd = input.completion?.costEstimateMicroUsd ?? 0;
  const costEstimateCents = convertMicroUsdToCentsConservative(costEstimateMicroUsd);

  await withWorkspaceDb(input.workspaceId, async (tx) => {
    if (input.aiRunId) {
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
          aiRunId: input.aiRunId,
          leadId: input.leadId,
          errorCode,
        },
      });
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "draft.ai_generation_failed",
      entityType: "lead",
      entityId: input.leadId,
      metadataJson: {
        ...(input.aiRunId ? { aiRunId: input.aiRunId } : {}),
        leadId: input.leadId,
        errorCode,
      },
    });
  });
}

export async function handleGenerateAiDraftJob(
  input: HandleGenerateAiDraftJobInput,
): Promise<void> {
  const model = resolveModel(input.model);
  let prepared: PreparedDraftGenerationRun | null = null;
  let completion: AiCompletionOutput | null = null;

  try {
    const preparation = await prepareDraftGenerationRun({
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      leadId: input.payload.leadId,
      model,
    });

    if ("blocked" in preparation) {
      return;
    }

    prepared = preparation;
    const provider = input.provider ?? new OpenRouterProvider();
    completion = await provider.complete({
      model: prepared.model,
      messages: prepared.prompt.messages,
      maxTokens: 1200,
      lengthRetryMaxTokens: 1800,
      temperature: 0.3,
      timeoutMs: 30_000,
    });

    await persistSuccessfulDraftGenerationRun({
      workspaceId: input.workspaceId,
      leadId: input.payload.leadId,
      aiRunId: prepared.aiRunId,
      draftContactId: prepared.draftContactId,
      sourceLeadScoreId: prepared.sourceLeadScoreId,
      context: prepared.context,
      completion,
      latencyMs: Date.now() - prepared.startedAt,
    });
  } catch (error) {
    await persistFailedDraftGenerationRun({
      workspaceId: input.workspaceId,
      leadId: input.payload.leadId,
      aiRunId: prepared?.aiRunId ?? null,
      completion,
      error,
    });

    throw error;
  }
}
