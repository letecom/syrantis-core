import { requestLeadDraftGeneration } from "../repositories/lead-draft-generation.js";

export type LeadDraftGenerationRequestResult =
  | { result: "ok"; jobId: string; leadId: string }
  | { result: "not_found" };

export type LeadDraftGenerationService = {
  requestLeadDraftGeneration(
    workspaceId: string,
    actorUserId: string,
    id: string,
  ): Promise<LeadDraftGenerationRequestResult>;
};

export function createProductionLeadDraftGenerationService(): LeadDraftGenerationService {
  return {
    async requestLeadDraftGeneration(
      workspaceId: string,
      actorUserId: string,
      id: string,
    ): Promise<LeadDraftGenerationRequestResult> {
      const result = await requestLeadDraftGeneration({
        workspaceId,
        actorUserId,
        leadId: id,
      });

      if (result.result === "not_found") {
        return result;
      }

      return {
        result: "ok",
        jobId: result.job.id,
        leadId: result.leadId,
      };
    },
  };
}
