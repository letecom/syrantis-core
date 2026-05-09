import { randomUUID } from "node:crypto";

import {
  AdminIntakeTestEmailResponseSchema,
  type AdminIntakeTestEmailRequest,
  type AdminIntakeTestEmailResponse,
} from "@syrantis/shared";

import {
  createAdminIntakeTestEmail,
  type AdminIntakeTestEmailRepositoryInput,
  type AdminIntakeTestEmailRepositoryResult,
} from "../repositories/admin-intake.js";
import { buildPendingScoreLeadJobDto, hasText } from "./intake-shared.js";

export type AdminIntakeTestEmailResult = AdminIntakeTestEmailResponse["data"];

export type AdminIntakeService = {
  createTestEmail(input: {
    workspaceId: string;
    actorUserId: string;
    data: AdminIntakeTestEmailRequest;
  }): Promise<AdminIntakeTestEmailResult>;
};

export type AdminIntakeRepository = {
  createTestEmail(input: AdminIntakeTestEmailRepositoryInput): Promise<AdminIntakeTestEmailRepositoryResult>;
};

const productionRepository: AdminIntakeRepository = {
  createTestEmail: createAdminIntakeTestEmail,
};

export function createProductionAdminIntakeService(
  repository: AdminIntakeRepository = productionRepository,
): AdminIntakeService {
  return {
    async createTestEmail(input): Promise<AdminIntakeTestEmailResult> {
      const diagnosticTraceId = randomUUID();
      const created = await repository.createTestEmail({
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        diagnosticTraceId,
        data: input.data,
      });

      const response = AdminIntakeTestEmailResponseSchema.parse({
        success: true,
        data: {
          diagnosticTraceId,
          testLabel: input.data.testLabel ?? null,
          lead: {
            id: created.lead.id,
            source: "inbound_email_test",
            hasBody: hasText(input.data.bodyText),
            subjectPresent: hasText(input.data.subject),
            contactNamePresent: hasText(input.data.contactName),
            createdAt: created.lead.createdAt.toISOString(),
          },
          scoringJob: buildPendingScoreLeadJobDto(created.job),
          workerBaseline: {
            failedJobsBefore: created.failedJobsBefore,
          },
          createdAt: created.lead.createdAt.toISOString(),
          processingNote:
            "Synthetic inbound email test lead created and score_lead job enqueued. Run the worker once to process scoring.",
        },
      });

      return response.data;
    },
  };
}
