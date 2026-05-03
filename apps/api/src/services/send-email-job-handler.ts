import { and, eq } from "drizzle-orm";

import { drafts, emailSends } from "@syrantis/db";
import type { SendEmailJobPayload } from "@syrantis/shared";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";
import { createActivityLog } from "../repositories/activity-logs.js";
import { createEmailProvider, type EmailProvider } from "./email/email-provider.js";
import type { SendEmailProviderInput } from "./email/resend-provider.js";

export type SendEmailJobHandlerInput = {
  workspaceId: string;
  jobId: string;
  payload: SendEmailJobPayload;
  provider?: EmailProvider;
};

type PreparedSendEmail =
  | {
      result: "noop";
      emailSendId: string;
      status: "queued" | "sent" | "failed" | "cancelled";
    }
  | { result: "internal_queued"; emailSendId: string }
  | {
      result: "send";
      emailSendId: string;
      providerInput: SendEmailProviderInput;
    };

class EmailSendProcessError extends Error {
  constructor(
    message: string,
    public readonly emailSendId: string,
  ) {
    super(message);
  }
}

function resolveProviderErrorCode(error: unknown): string {
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_:-]+$/.test(error.code.trim())
  ) {
    return error.code.trim().slice(0, 120) || "EMAIL_SEND_FAILED";
  }

  return "EMAIL_SEND_FAILED";
}

function resolveProviderStatusCode(error: unknown): number | undefined {
  if (
    error instanceof Error &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return undefined;
}

function resolveFromEmail(input: { provider: EmailProvider; fromEmail: string }): string {
  if (input.provider.mode === "resend" && process.env.RESEND_FROM_EMAIL) {
    return process.env.RESEND_FROM_EMAIL;
  }

  return input.fromEmail;
}

function resolveReplyToEmail(input: { provider: EmailProvider; replyToEmail: string | null }): string | undefined {
  if (input.provider.mode === "resend" && process.env.RESEND_REPLY_TO) {
    return process.env.RESEND_REPLY_TO;
  }

  return input.replyToEmail ?? undefined;
}

async function prepareSendEmail(
  tx: WorkspaceDbTransaction,
  input: {
    workspaceId: string;
    payload: SendEmailJobPayload;
    provider: EmailProvider;
  },
): Promise<PreparedSendEmail> {
  const [emailSend] = await tx
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

  if (
    emailSend.status === "queued" ||
    emailSend.status === "sent" ||
    emailSend.status === "failed" ||
    emailSend.status === "cancelled"
  ) {
    return { result: "noop", emailSendId: emailSend.id, status: emailSend.status };
  }

  if (emailSend.status !== "pending") {
    throw new EmailSendProcessError("EMAIL_SEND_INVALID_STATUS", emailSend.id);
  }

  const [draft] = await tx
    .select({ id: drafts.id, status: drafts.status })
    .from(drafts)
    .where(and(eq(drafts.id, emailSend.draftId), eq(drafts.workspaceId, input.workspaceId)))
    .limit(1);

  if (!draft || draft.status !== "approved") {
    throw new EmailSendProcessError("DRAFT_NOT_APPROVED", emailSend.id);
  }

  if (input.provider.mode === "internal") {
    if (emailSend.status === "pending") {
      const [updatedEmailSend] = await tx
        .update(emailSends)
        .set({
          status: "queued",
        })
        .where(
          and(
            eq(emailSends.id, emailSend.id),
            eq(emailSends.workspaceId, input.workspaceId),
            eq(emailSends.status, "pending"),
          ),
        )
        .returning();

      if (!updatedEmailSend) {
        return { result: "noop", emailSendId: emailSend.id, status: "queued" };
      }
    }

    return { result: "internal_queued", emailSendId: emailSend.id };
  }

  const replyTo = resolveReplyToEmail({ provider: input.provider, replyToEmail: emailSend.replyToEmail });

  return {
    result: "send",
    emailSendId: emailSend.id,
    providerInput: {
      emailSendId: emailSend.id,
      to: emailSend.toEmail,
      from: resolveFromEmail({ provider: input.provider, fromEmail: emailSend.fromEmail }),
      ...(replyTo ? { replyTo } : {}),
      subject: emailSend.subject,
      html: emailSend.htmlBody,
      text: emailSend.textBody,
    },
  };
}

async function persistSendSuccess(input: {
  workspaceId: string;
  emailSendId: string;
  provider: "resend";
  messageId: string;
}): Promise<boolean> {
  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [updatedEmailSend] = await tx
      .update(emailSends)
      .set({
        status: "sent",
        provider: input.provider,
        providerMessageId: input.messageId,
        sentAt: new Date(),
        failedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      })
      .where(
        and(
          eq(emailSends.id, input.emailSendId),
          eq(emailSends.workspaceId, input.workspaceId),
          eq(emailSends.status, "pending"),
        ),
      )
      .returning();

    if (!updatedEmailSend) {
      return false;
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "email_send.sent",
      entityType: "email_send",
      entityId: input.emailSendId,
      metadataJson: {
        emailSendId: input.emailSendId,
        provider: input.provider,
        messageId: input.messageId,
      },
    });

    return true;
  });
}

async function persistSendFailure(input: {
  workspaceId: string;
  emailSendId: string;
  provider: "resend";
  error: unknown;
}): Promise<boolean> {
  const errorType = resolveProviderErrorCode(input.error);
  const statusCode = resolveProviderStatusCode(input.error);

  return withWorkspaceDb(input.workspaceId, async (tx) => {
    const [updatedEmailSend] = await tx
      .update(emailSends)
      .set({
        status: "failed",
        provider: input.provider,
        failedAt: new Date(),
        lastErrorCode: errorType,
        lastErrorMessage: errorType,
      })
      .where(
        and(
          eq(emailSends.id, input.emailSendId),
          eq(emailSends.workspaceId, input.workspaceId),
          eq(emailSends.status, "pending"),
        ),
      )
      .returning();

    if (!updatedEmailSend) {
      return false;
    }

    await createActivityLog(tx, {
      workspaceId: input.workspaceId,
      actorUserId: null,
      action: "email_send.failed",
      entityType: "email_send",
      entityId: input.emailSendId,
      metadataJson: {
        emailSendId: input.emailSendId,
        provider: input.provider,
        errorType,
        ...(statusCode ? { statusCode } : {}),
      },
    });

    return true;
  });
}

export async function handleSendEmailJob(input: SendEmailJobHandlerInput): Promise<void> {
  const provider = input.provider ?? createEmailProvider();
  let prepared: PreparedSendEmail | null = null;

  try {
    prepared = await withWorkspaceDb(input.workspaceId, async (tx) =>
      prepareSendEmail(tx, {
        workspaceId: input.workspaceId,
        payload: input.payload,
        provider,
      }),
    );

    if (prepared.result !== "send") {
      return;
    }

    const result = await provider.send(prepared.providerInput);

    await persistSendSuccess({
      workspaceId: input.workspaceId,
      emailSendId: prepared.emailSendId,
      provider: result.provider,
      messageId: result.messageId,
    });
  } catch (error) {
    if (prepared?.result === "send" && provider.mode === "resend") {
      await persistSendFailure({
        workspaceId: input.workspaceId,
        emailSendId: prepared.emailSendId,
        provider: "resend",
        error,
      });

      throw new Error(resolveProviderErrorCode(error));
    } else if (error instanceof EmailSendProcessError && provider.mode === "resend") {
      await persistSendFailure({
        workspaceId: input.workspaceId,
        emailSendId: error.emailSendId,
        provider: "resend",
        error,
      });
    }

    throw error;
  }
}
