import { and, eq } from "drizzle-orm";

import { emailSends } from "@syrantis/db";
import type { SendEmailJobPayload } from "@syrantis/shared";

import type { WorkspaceDbTransaction } from "../lib/db.js";

export type SendEmailJobHandlerInput = {
  tx: WorkspaceDbTransaction;
  workspaceId: string;
  jobId: string;
  payload: SendEmailJobPayload;
};

export async function handleSendEmailJob(input: SendEmailJobHandlerInput): Promise<void> {
  const [emailSend] = await input.tx
    .select()
    .from(emailSends)
    .where(
      and(
        eq(emailSends.id, input.payload.emailSendId),
        eq(emailSends.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);

  if (!emailSend) {
    throw new Error("EMAIL_SEND_NOT_FOUND");
  }

  if (emailSend.status === "pending") {
    const [updatedEmailSend] = await input.tx
      .update(emailSends)
      .set({
        status: "queued",
      })
      .where(and(eq(emailSends.id, emailSend.id), eq(emailSends.workspaceId, input.workspaceId)))
      .returning();

    if (!updatedEmailSend) {
      throw new Error("EMAIL_SEND_NOT_FOUND");
    }

    return;
  }

  if (emailSend.status === "queued" || emailSend.status === "sent") {
    return;
  }

  throw new Error("EMAIL_SEND_NOT_PROCESSABLE");
}
