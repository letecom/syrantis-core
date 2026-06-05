import { and, asc, count, eq, ne } from "drizzle-orm";

import { workspaceResponseProfiles } from "@syrantis/db";
import type { ClientResponseProfileCreate, ClientResponseProfileUpdate } from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";

export type WorkspaceResponseProfileRow = typeof workspaceResponseProfiles.$inferSelect;

export type ResponseProfileConflictCode =
  | "DEFAULT_PROFILE_REQUIRED"
  | "DEFAULT_PROFILE_DEACTIVATION_BLOCKED"
  | "LAST_ACTIVE_PROFILE_DEACTIVATION_BLOCKED";

export type ResponseProfileMutationResult =
  | { result: "success"; profile: WorkspaceResponseProfileRow; changedFields: string[] }
  | { result: "not_found" }
  | { result: "conflict"; code: ResponseProfileConflictCode };

const profileFieldNames = [
  "name",
  "senderName",
  "roleLabel",
  "description",
  "tone",
  "styleNotes",
  "authorityLevel",
  "appliesToCategories",
  "specificRules",
  "escalationRules",
  "forbiddenClaims",
  "isDefault",
  "sortOrder",
] as const satisfies readonly (keyof ClientResponseProfileUpdate)[];

function activeFilter(workspaceId: string) {
  return and(
    eq(workspaceResponseProfiles.workspaceId, workspaceId),
    eq(workspaceResponseProfiles.isActive, true),
  );
}

function byIdAndWorkspace(workspaceId: string, id: string) {
  return and(eq(workspaceResponseProfiles.workspaceId, workspaceId), eq(workspaceResponseProfiles.id, id));
}

function valuesDiffer(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}

function changedProfileFields(
  existingProfile: WorkspaceResponseProfileRow,
  nextProfile: ClientResponseProfileUpdate,
): string[] {
  return profileFieldNames.filter((field) => valuesDiffer(existingProfile[field], nextProfile[field]));
}

async function hasActiveDefault(
  tx: WorkspaceDbTransaction,
  workspaceId: string,
  excludeId?: string,
): Promise<boolean> {
  const filters = [
    eq(workspaceResponseProfiles.workspaceId, workspaceId),
    eq(workspaceResponseProfiles.isActive, true),
    eq(workspaceResponseProfiles.isDefault, true),
  ];

  if (excludeId) {
    filters.push(ne(workspaceResponseProfiles.id, excludeId));
  }

  const [row] = await tx
    .select({ value: count() })
    .from(workspaceResponseProfiles)
    .where(and(...filters));

  return (row?.value ?? 0) > 0;
}

async function countActiveProfiles(tx: WorkspaceDbTransaction, workspaceId: string): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(workspaceResponseProfiles)
    .where(activeFilter(workspaceId));

  return row?.value ?? 0;
}

export async function listActiveResponseProfiles(
  workspaceId: string,
): Promise<WorkspaceResponseProfileRow[]> {
  return withWorkspaceDb(workspaceId, async (tx) =>
    tx
      .select()
      .from(workspaceResponseProfiles)
      .where(activeFilter(workspaceId))
      .orderBy(
        asc(workspaceResponseProfiles.sortOrder),
        asc(workspaceResponseProfiles.createdAt),
      ),
  );
}

export async function createResponseProfile(input: {
  workspaceId: string;
  actorUserId: string;
  profile: ClientResponseProfileCreate;
}): Promise<{ profile: WorkspaceResponseProfileRow; changedFields: string[] }> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const requestedDefault = input.profile.isDefault === true;
    const shouldBecomeDefault =
      requestedDefault || !(await hasActiveDefault(tx, input.workspaceId));

    if (shouldBecomeDefault) {
      await tx
        .update(workspaceResponseProfiles)
        .set({ isDefault: false })
        .where(activeFilter(input.workspaceId));
    }

    const [profile] = await tx
      .insert(workspaceResponseProfiles)
      .values({
        workspaceId: input.workspaceId,
        name: input.profile.name,
        senderName: input.profile.senderName,
        roleLabel: input.profile.roleLabel,
        description: input.profile.description ?? null,
        tone: input.profile.tone,
        styleNotes: input.profile.styleNotes ?? null,
        authorityLevel: input.profile.authorityLevel,
        appliesToCategories: input.profile.appliesToCategories,
        specificRules: input.profile.specificRules,
        escalationRules: input.profile.escalationRules,
        forbiddenClaims: input.profile.forbiddenClaims,
        isDefault: shouldBecomeDefault,
        isActive: true,
        sortOrder: input.profile.sortOrder ?? 0,
      })
      .returning();

    if (!profile) {
      throw new Error("Failed to create response profile.");
    }

    const changedFields = [...profileFieldNames];
    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "response_profile.created",
      entityType: "response_profile",
      entityId: profile.id,
      metadataJson: {
        profileId: profile.id,
        changedFields,
        source: "client_config",
        action: "created",
      },
    });

    return { profile, changedFields };
  });
}

export async function updateResponseProfile(input: {
  workspaceId: string;
  actorUserId: string;
  id: string;
  profile: ClientResponseProfileUpdate;
}): Promise<ResponseProfileMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [existingProfile] = await tx
      .select()
      .from(workspaceResponseProfiles)
      .where(byIdAndWorkspace(input.workspaceId, input.id))
      .limit(1);

    if (!existingProfile || !existingProfile.isActive) {
      return { result: "not_found" };
    }

    if (input.profile.isDefault) {
      await tx
        .update(workspaceResponseProfiles)
        .set({ isDefault: false })
        .where(and(activeFilter(input.workspaceId), ne(workspaceResponseProfiles.id, input.id)));
    } else if (!(await hasActiveDefault(tx, input.workspaceId, input.id))) {
      return { result: "conflict", code: "DEFAULT_PROFILE_REQUIRED" };
    }

    const changedFields = changedProfileFields(existingProfile, input.profile);
    const [profile] = await tx
      .update(workspaceResponseProfiles)
      .set({
        name: input.profile.name,
        senderName: input.profile.senderName,
        roleLabel: input.profile.roleLabel,
        description: input.profile.description,
        tone: input.profile.tone,
        styleNotes: input.profile.styleNotes,
        authorityLevel: input.profile.authorityLevel,
        appliesToCategories: input.profile.appliesToCategories,
        specificRules: input.profile.specificRules,
        escalationRules: input.profile.escalationRules,
        forbiddenClaims: input.profile.forbiddenClaims,
        isDefault: input.profile.isDefault,
        sortOrder: input.profile.sortOrder,
      })
      .where(byIdAndWorkspace(input.workspaceId, input.id))
      .returning();

    if (!profile) {
      throw new Error("Failed to update response profile.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "response_profile.updated",
      entityType: "response_profile",
      entityId: profile.id,
      metadataJson: {
        profileId: profile.id,
        changedFields,
        source: "client_config",
        action: "updated",
      },
    });

    return { result: "success", profile, changedFields };
  });
}

export async function deactivateResponseProfile(input: {
  workspaceId: string;
  actorUserId: string;
  id: string;
}): Promise<ResponseProfileMutationResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [existingProfile] = await tx
      .select()
      .from(workspaceResponseProfiles)
      .where(byIdAndWorkspace(input.workspaceId, input.id))
      .limit(1);

    if (!existingProfile || !existingProfile.isActive) {
      return { result: "not_found" };
    }

    if (existingProfile.isDefault) {
      return { result: "conflict", code: "DEFAULT_PROFILE_DEACTIVATION_BLOCKED" };
    }

    if ((await countActiveProfiles(tx, input.workspaceId)) <= 1) {
      return { result: "conflict", code: "LAST_ACTIVE_PROFILE_DEACTIVATION_BLOCKED" };
    }

    const [profile] = await tx
      .update(workspaceResponseProfiles)
      .set({
        isActive: false,
        isDefault: false,
      })
      .where(byIdAndWorkspace(input.workspaceId, input.id))
      .returning();

    if (!profile) {
      throw new Error("Failed to deactivate response profile.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "response_profile.deactivated",
      entityType: "response_profile",
      entityId: profile.id,
      metadataJson: {
        profileId: profile.id,
        source: "client_config",
        action: "deactivated",
      },
    });

    return { result: "success", profile, changedFields: ["isActive"] };
  });
}
