import { backgroundJobs } from "@syrantis/db";
import type { SendEmailJobPayload } from "@syrantis/shared";

import type { WorkspaceDbTransaction } from "../lib/db.js";

export type BackgroundJobRow = typeof backgroundJobs.$inferSelect;

export type EnqueueSendEmailJobInput = {
  workspaceId: string;
  emailSendId: string;
  runAfter?: Date;
};

export async function enqueueSendEmailJob(
  tx: WorkspaceDbTransaction,
  input: EnqueueSendEmailJobInput,
): Promise<BackgroundJobRow> {
  const payload: SendEmailJobPayload = {
    emailSendId: input.emailSendId,
  };

  const [job] = await tx
    .insert(backgroundJobs)
    .values({
      workspaceId: input.workspaceId,
      type: "send_email",
      payloadJson: payload,
      status: "pending",
      runAfter: input.runAfter ?? new Date(),
    })
    .returning();

  if (!job) {
    throw new Error("Failed to enqueue send_email job.");
  }

  return job;
}
