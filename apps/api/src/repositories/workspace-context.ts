import { eq } from "drizzle-orm";

import { workspaceContextProfiles } from "@syrantis/db";
import type { WorkspaceContextInput } from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

export type WorkspaceContextProfileRow = typeof workspaceContextProfiles.$inferSelect;

export type UpsertWorkspaceContextProfileResult = {
  row: WorkspaceContextProfileRow;
  created: boolean;
  changedFields: string[];
};

const contextJsonFields = [
  "companySummary",
  "offers",
  "serviceAreas",
  "idealCustomerProfile",
  "badFitSignals",
  "qualificationRules",
  "commonObjections",
  "proofPoints",
  "tone",
  "ctaPreference",
  "forbiddenClaims",
  "handoffRules",
] as const satisfies readonly (keyof WorkspaceContextInput)[];

const topLevelContextFields = [
  "companyName",
  "sector",
  "language",
  "timezone",
  ...contextJsonFields,
] as const satisfies readonly (keyof WorkspaceContextInput)[];

function toContextJson(input: WorkspaceContextInput): Record<string, unknown> {
  return Object.fromEntries(contextJsonFields.map((field) => [field, input[field]]));
}

function toComparableInput(row: WorkspaceContextProfileRow): WorkspaceContextInput {
  return {
    ...(row.contextJson as Record<string, unknown>),
    companyName: row.companyName,
    sector: row.sector,
    language: row.language,
    timezone: row.timezone,
  } as WorkspaceContextInput;
}

function valuesDiffer(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}

function changedTopLevelFields(
  existing: WorkspaceContextProfileRow,
  input: WorkspaceContextInput,
): string[] {
  const existingInput = toComparableInput(existing);

  return topLevelContextFields.filter((field) => valuesDiffer(existingInput[field], input[field]));
}

export async function findWorkspaceContextProfile(
  workspaceId: string,
): Promise<WorkspaceContextProfileRow | null> {
  return withWorkspaceDb(workspaceId, async (tx) => findWorkspaceContextProfileInTx(tx, workspaceId));
}

export async function findWorkspaceContextProfileInTx(
  tx: WorkspaceDbTransaction,
  workspaceId: string,
): Promise<WorkspaceContextProfileRow | null> {
    const [profile] = await tx
      .select()
      .from(workspaceContextProfiles)
      .where(eq(workspaceContextProfiles.workspaceId, workspaceId))
      .limit(1);

    return profile ?? null;
}

export async function upsertWorkspaceContextProfile(
  workspaceId: string,
  userId: string,
  parsedInput: WorkspaceContextInput,
): Promise<UpsertWorkspaceContextProfileResult> {
  return withWorkspaceDb(workspaceId, async (tx) => {
    const [existingProfile] = await tx
      .select()
      .from(workspaceContextProfiles)
      .where(eq(workspaceContextProfiles.workspaceId, workspaceId))
      .limit(1);

    if (!existingProfile) {
      const [profile] = await tx
        .insert(workspaceContextProfiles)
        .values({
          workspaceId,
          companyName: parsedInput.companyName,
          sector: parsedInput.sector,
          language: parsedInput.language,
          timezone: parsedInput.timezone,
          contextJson: toContextJson(parsedInput),
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      if (!profile) {
        throw new Error("Failed to create workspace context profile.");
      }

      await createActivityLog(tx, {
        workspaceId,
        actorUserId: userId,
        action: "workspace_context.created",
        entityType: "workspace_context_profile",
        entityId: profile.id,
        metadataJson: {
          profileId: profile.id,
          changedFields: ["*"],
          source: "admin_api",
        },
      });

      return { row: profile, created: true, changedFields: ["*"] };
    }

    const changedFields = changedTopLevelFields(existingProfile, parsedInput);
    const [profile] = await tx
      .update(workspaceContextProfiles)
      .set({
        companyName: parsedInput.companyName,
        sector: parsedInput.sector,
        language: parsedInput.language,
        timezone: parsedInput.timezone,
        contextJson: toContextJson(parsedInput),
        updatedBy: userId,
      })
      .where(eq(workspaceContextProfiles.workspaceId, workspaceId))
      .returning();

    if (!profile) {
      throw new Error("Failed to update workspace context profile.");
    }

    await createActivityLog(tx, {
      workspaceId,
      actorUserId: userId,
      action: "workspace_context.updated",
      entityType: "workspace_context_profile",
      entityId: profile.id,
      metadataJson: {
        profileId: profile.id,
        changedFields,
        source: "admin_api",
      },
    });

    return { row: profile, created: false, changedFields };
  });
}
