import { eq } from "drizzle-orm";

import { workspaceContextProfiles } from "@syrantis/db";
import type { ClientResponsePolicy } from "@syrantis/shared";

import { withWorkspaceDb } from "../lib/db.js";
import { createActivityLog } from "./activity-logs.js";
import type { WorkspaceContextProfileRow } from "./workspace-context.js";

export type ClientResponsePolicyRepositoryResult = {
  row: WorkspaceContextProfileRow;
  created: boolean;
  changedFields: string[];
};

const policyFieldNames = [
  "language",
  "tone",
  "customToneNotes",
  "signature",
  "defaultGreeting",
  "defaultClosing",
  "responseStructure",
  "businessRules",
  "forbiddenClaims",
  "escalationRules",
  "offerNotes",
  "catalogSummary",
  "exampleReplies",
] as const satisfies readonly (keyof ClientResponsePolicy)[];

function valuesDiffer(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}

function changedPolicyFields(
  existingPolicy: ClientResponsePolicy | null,
  nextPolicy: ClientResponsePolicy,
): string[] {
  if (!existingPolicy) {
    return [...policyFieldNames];
  }

  return policyFieldNames.filter((field) => valuesDiffer(existingPolicy[field], nextPolicy[field]));
}

export async function putClientResponsePolicy(input: {
  workspaceId: string;
  actorUserId: string;
  policy: ClientResponsePolicy;
  existingPolicy: ClientResponsePolicy | null;
}): Promise<ClientResponsePolicyRepositoryResult> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [existingProfile] = await tx
      .select()
      .from(workspaceContextProfiles)
      .where(eq(workspaceContextProfiles.workspaceId, input.workspaceId))
      .limit(1);

    const changedFields = changedPolicyFields(input.existingPolicy, input.policy);

    if (!existingProfile) {
      const [profile] = await tx
        .insert(workspaceContextProfiles)
        .values({
          workspaceId: input.workspaceId,
          contextJson: {
            responsePolicy: input.policy,
          },
          createdBy: input.actorUserId,
          updatedBy: input.actorUserId,
        })
        .returning();

      if (!profile) {
        throw new Error("Failed to create response policy.");
      }

      await createActivityLog(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        action: "client_response_policy.created",
        entityType: "workspace_context_profile",
        entityId: profile.id,
        metadataJson: {
          policyConfigured: input.policy.status === "configured",
          changedFields,
          source: "admin_ui",
        },
      });

      return { row: profile, created: true, changedFields };
    }

    const [profile] = await tx
      .update(workspaceContextProfiles)
      .set({
        contextJson: {
          ...(existingProfile.contextJson as Record<string, unknown>),
          responsePolicy: input.policy,
        },
        updatedBy: input.actorUserId,
      })
      .where(eq(workspaceContextProfiles.workspaceId, input.workspaceId))
      .returning();

    if (!profile) {
      throw new Error("Failed to update response policy.");
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "client_response_policy.updated",
      entityType: "workspace_context_profile",
      entityId: profile.id,
      metadataJson: {
        policyConfigured: input.policy.status === "configured",
        changedFields,
        source: "admin_ui",
      },
    });

    return { row: profile, created: false, changedFields };
  });
}
