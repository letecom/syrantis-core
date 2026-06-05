import {
  type ClientResponseProfileCreate,
  type ClientResponseProfileUpdate,
} from "@syrantis/shared";

import {
  createResponseProfile,
  deactivateResponseProfile,
  listActiveResponseProfiles,
  updateResponseProfile,
  type ResponseProfileMutationResult,
  type WorkspaceResponseProfileRow,
} from "../repositories/client-response-profiles.js";

export type ClientResponseProfilesService = {
  listProfiles(workspaceId: string): Promise<WorkspaceResponseProfileRow[]>;
  createProfile(
    workspaceId: string,
    actorUserId: string,
    input: ClientResponseProfileCreate,
  ): Promise<{ profile: WorkspaceResponseProfileRow; changedFields: string[] }>;
  updateProfile(
    workspaceId: string,
    actorUserId: string,
    id: string,
    input: ClientResponseProfileUpdate,
  ): Promise<ResponseProfileMutationResult>;
  deactivateProfile(
    workspaceId: string,
    actorUserId: string,
    id: string,
  ): Promise<ResponseProfileMutationResult>;
};

export function createProductionClientResponseProfilesService(): ClientResponseProfilesService {
  return {
    listProfiles(workspaceId) {
      return listActiveResponseProfiles(workspaceId);
    },
    createProfile(workspaceId, actorUserId, input) {
      return createResponseProfile({ workspaceId, actorUserId, profile: input });
    },
    updateProfile(workspaceId, actorUserId, id, input) {
      return updateResponseProfile({ workspaceId, actorUserId, id, profile: input });
    },
    deactivateProfile(workspaceId, actorUserId, id) {
      return deactivateResponseProfile({ workspaceId, actorUserId, id });
    },
  };
}
