import { and, desc, eq } from "drizzle-orm";

import { aiRuns, contacts, drafts, leadScores, leads, organizations } from "@syrantis/db";
import type { GenerateAiDraftJobPayload } from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import {
  buildDraftGenerationPrompt,
  DRAFT_GENERATION_PROMPT_TEMPLATE_ID,
  DraftGenerationOutputParseError,
  DraftGenerationOutputSchemaError,
  parseDraftGenerationOutput,
  type DraftGenerationPrompt,
} from "./ai/draft-generation-prompt.js";
import {
  AiFinishReasonError,
  AiProviderEmptyResponseError,
  OpenRouterProvider,
} from "./ai/openrouter-provider.js";
import { redactLeadForDraftGeneration } from "./ai/pii-redaction.js";
import { convertMicroUsdToCentsConservative, resolveAllowedAiModel } from "./ai/pricing.js";
import type { AiCompletionOutput, AiProvider } from "./ai/providers.js";

export type HandleGenerateAiDraftJobInput = {
  workspaceId: string;
  jobId: string;
  payload: GenerateAiDraftJobPayload;
  provider?: AiProvider;
  model?: string;
};

type LeadDraftContextRow = {
  leadId: string;
  source: string;
  status: string;
  rawContent: string | null;
  metadataJson: Record<string, unknown>;
  contactId: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactRoleTitle: string | null;
  organizationName: string | null;
  organizationSector: string | null;
  organizationStatus: string | null;
  organizationWebsiteUrl: string | null;
};

type LatestScoreRow = {
  id: string;
  score: number;
  qualification: string;
  summary: string;
  rationale: string;
  recommendedAction: string;
  confidence: number;
} | null;

type PreparedDraftGenerationRun = {
  aiRunId: string;
  model: string;
  prompt: DraftGenerationPrompt;
  lead: LeadDraftContextRow;
  latestScore: LatestScoreRow;
  startedAt: number;
};

function resolveModel(input?: string): string {
  return resolveAllowedAiModel(input);
}

function resolveErrorCode(error: unknown): string {
  if (
    error instanceof DraftGenerationOutputParseError ||
    error instanceof DraftGenerationOutputSchemaError
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
    error instanceof DraftGenerationOutputSchemaError
  ) {
    return error.rawPreview;
  }

  return null;
}

async function loadLeadDraftContext(
  tx: WorkspaceDbTransaction,
  input: { workspaceId: string; leadId: string },
): Promise<{ lead: LeadDraftContextRow; latestScore: LatestScoreRow } | null> {
  const [lead] = await tx
    .select({
      leadId: leads.id,
      source: leads.source,
      status: leads.status,
      rawContent: leads.rawContent,
      metadataJson: leads.normalizedJson,
      contactId: leads.contactId,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactRoleTitle: contacts.roleTitle,
      organizationName: organizations.name,
      organizationSector: organizations.sector,
      organizationStatus: organizations.status,
      organizationWebsiteUrl: organizations.websiteUrl,
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

  if (!lead) {
    return null;
  }

  const [latestScore] = await tx
    .select({
      id: leadScores.id,
      score: leadScores.score,
      qualification: leadScores.qualification,
      summary: leadScores.summary,
      rationale: leadScores.rationale,
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

async function prepareDraftGenerationRun(input: {
  workspaceId: string;
  jobId: string;
  leadId: string;
  model: string;
}): Promise<PreparedDraftGenerationRun> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const context = await loadLeadDraftContext(tx, {
      workspaceId: input.workspaceId,
      leadId: input.leadId,
    });

    if (!context) {
      throw new Error("LEAD_NOT_FOUND");
    }

    const prompt = buildDraftGenerationPrompt(
      redactLeadForDraftGeneration({
        lead: {
          source: context.lead.source,
          status: context.lead.status,
          rawContent: context.lead.rawContent,
          metadataJson: context.lead.metadataJson,
        },
        contact: {
          firstName: context.lead.contactFirstName,
          lastName: context.lead.contactLastName,
          roleTitle: context.lead.contactRoleTitle,
        },
        organization: {
          name: context.lead.organizationName,
          sector: context.lead.organizationSector,
          status: context.lead.organizationStatus,
          websiteUrl: context.lead.organizationWebsiteUrl,
        },
        latestScore: context.latestScore,
      }),
    );

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
      },
    });

    return {
      aiRunId: aiRun.id,
      model: input.model,
      prompt,
      lead: context.lead,
      latestScore: context.latestScore,
      startedAt: Date.now(),
    };
  });
}

function draftMetadata(input: {
  aiRunId: string;
  latestScore: LatestScoreRow;
}): Record<string, unknown> {
  return {
    origin: "ai_draft_generation",
    aiRunId: input.aiRunId,
    promptTemplateId: DRAFT_GENERATION_PROMPT_TEMPLATE_ID,
    ...(input.latestScore ? { sourceLeadScoreId: input.latestScore.id } : {}),
  };
}

async function persistSuccessfulDraftGenerationRun(input: {
  workspaceId: string;
  jobId: string;
  leadId: string;
  aiRunId: string;
  lead: LeadDraftContextRow;
  latestScore: LatestScoreRow;
  completion: AiCompletionOutput;
  latencyMs: number;
}): Promise<void> {
  const parsed = parseDraftGenerationOutput(input.completion.content);
  const costEstimateMicroUsd = input.completion.costEstimateMicroUsd;
  const costEstimateCents = convertMicroUsdToCentsConservative(costEstimateMicroUsd);

  await withWorkspaceDb(input.workspaceId, async (tx) => {
    const [draft] = await tx
      .insert(drafts)
      .values({
        workspaceId: input.workspaceId,
        leadId: input.leadId,
        contactId: input.lead.contactId ?? null,
        channel: "email",
        status: "draft",
        subject: parsed.subject,
        textBody: parsed.textBody,
        ...(parsed.htmlBody !== undefined ? { htmlBody: parsed.htmlBody } : {}),
        metadataJson: draftMetadata({
          aiRunId: input.aiRunId,
          latestScore: input.latestScore,
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
        aiRunId: input.aiRunId,
        leadId: input.leadId,
        draftId: draft.id,
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
        ...(input.latestScore ? { sourceLeadScoreId: input.latestScore.id } : {}),
      },
    });
  });
}

async function persistFailedDraftGenerationRun(input: {
  workspaceId: string;
  jobId: string;
  leadId: string;
  aiRunId: string | null;
  model: string | null;
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
    prepared = await prepareDraftGenerationRun({
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      leadId: input.payload.leadId,
      model,
    });

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
      jobId: input.jobId,
      leadId: input.payload.leadId,
      aiRunId: prepared.aiRunId,
      lead: prepared.lead,
      latestScore: prepared.latestScore,
      completion,
      latencyMs: Date.now() - prepared.startedAt,
    });
  } catch (error) {
    await persistFailedDraftGenerationRun({
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      leadId: input.payload.leadId,
      aiRunId: prepared?.aiRunId ?? null,
      model: prepared?.model ?? model,
      completion,
      error,
    });

    throw error;
  }
}
