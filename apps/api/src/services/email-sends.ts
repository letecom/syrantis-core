import {
  EmailSendOutputSchema,
  type EmailSendListQuery,
  type EmailSendOutput,
  type RequestEmailSendInput,
} from "@syrantis/shared";

import type { EmailSendRequestResult, EmailSendRow } from "../repositories/email-sends.js";
import {
  findEmailSendById,
  listEmailSends,
  requestEmailSendFromDraft,
} from "../repositories/email-sends.js";

export type EmailSendRequestServiceResult =
  | { result: "ok"; emailSend: EmailSendOutput }
  | { result: "not_found" }
  | { result: "conflict" }
  | { result: "recipient_missing" };

export type EmailSendService = {
  listEmailSends(workspaceId: string, query: EmailSendListQuery): Promise<EmailSendOutput[]>;
  getEmailSend(workspaceId: string, id: string): Promise<EmailSendOutput | null>;
  requestSendFromDraft(
    workspaceId: string,
    actorUserId: string,
    draftId: string,
    input: RequestEmailSendInput,
  ): Promise<EmailSendRequestServiceResult>;
};

function mapEmailSendRow(row: EmailSendRow): EmailSendOutput {
  return EmailSendOutputSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    draftId: row.draftId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function mapRequestResult(result: EmailSendRequestResult): EmailSendRequestServiceResult {
  if (result.result !== "ok") {
    return result;
  }

  return {
    result: "ok",
    emailSend: mapEmailSendRow(result.emailSend),
  };
}

export function createProductionEmailSendService(): EmailSendService {
  return {
    async listEmailSends(
      workspaceId: string,
      query: EmailSendListQuery,
    ): Promise<EmailSendOutput[]> {
      const rows = await listEmailSends({
        workspaceId,
        limit: query.limit,
        offset: query.offset,
      });

      return rows.map(mapEmailSendRow);
    },

    async getEmailSend(workspaceId: string, id: string): Promise<EmailSendOutput | null> {
      const row = await findEmailSendById({ workspaceId, id });
      return row ? mapEmailSendRow(row) : null;
    },

    async requestSendFromDraft(
      workspaceId: string,
      actorUserId: string,
      draftId: string,
      input: RequestEmailSendInput,
    ): Promise<EmailSendRequestServiceResult> {
      return mapRequestResult(
        await requestEmailSendFromDraft({
          workspaceId,
          actorUserId,
          draftId,
          data: input,
        }),
      );
    },
  };
}
