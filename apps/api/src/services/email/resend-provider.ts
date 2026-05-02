import { setTimeout as sleep } from "node:timers/promises";

import { z } from "zod";

export type SendEmailProviderInput = {
  emailSendId: string;
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html?: string | null;
  text?: string | null;
};

export type SendEmailProviderResult = {
  provider: "resend";
  messageId: string;
};

export class EmailProviderMissingApiKeyError extends Error {
  code = "RESEND_API_KEY_MISSING" as const;

  constructor() {
    super("RESEND_API_KEY_MISSING");
  }
}

export class EmailProviderHttpError extends Error {
  code = "EMAIL_PROVIDER_HTTP_ERROR" as const;

  constructor(public readonly statusCode: number) {
    super("EMAIL_PROVIDER_HTTP_ERROR");
  }
}

export class EmailProviderTimeoutError extends Error {
  code = "EMAIL_PROVIDER_TIMEOUT" as const;

  constructor() {
    super("EMAIL_PROVIDER_TIMEOUT");
  }
}

export class EmailProviderInvalidResponseError extends Error {
  code = "EMAIL_PROVIDER_INVALID_RESPONSE" as const;

  constructor() {
    super("EMAIL_PROVIDER_INVALID_RESPONSE");
  }
}

export class EmailRecipientNotAllowedError extends Error {
  code = "EMAIL_RECIPIENT_NOT_ALLOWED" as const;

  constructor() {
    super("EMAIL_RECIPIENT_NOT_ALLOWED");
  }
}

const ResendSendResponseSchema = z.object({
  id: z.string().min(1),
});

type ResendProviderOptions = {
  apiKey?: string | undefined;
  allowlist?: string | undefined;
  timeoutMs?: number | undefined;
  retryDelayMs?: {
    rateLimit: number;
    server: number;
  } | undefined;
};

function resolveAllowlist(value: string | undefined): Set<string> | null {
  const emails = (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return emails.length > 0 ? new Set(emails) : null;
}

function assertRecipientAllowed(input: { to: string; allowlist: Set<string> | null }) {
  if (!input.allowlist) {
    return;
  }

  if (!input.allowlist.has(input.to.trim().toLowerCase())) {
    throw new EmailRecipientNotAllowedError();
  }
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export class ResendProvider {
  private readonly apiKey: string | undefined;
  private readonly allowlist: Set<string> | null;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: { rateLimit: number; server: number };

  constructor(options: ResendProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.RESEND_API_KEY;
    this.allowlist = resolveAllowlist(options.allowlist ?? process.env.RESEND_TO_ALLOWLIST);
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.retryDelayMs = options.retryDelayMs ?? { rateLimit: 2_000, server: 1_000 };
  }

  async send(input: SendEmailProviderInput): Promise<SendEmailProviderResult> {
    if (!this.apiKey) {
      throw new EmailProviderMissingApiKeyError();
    }

    assertRecipientAllowed({ to: input.to, allowlist: this.allowlist });

    const firstAttempt = await this.sendAttempt(input);

    if (firstAttempt.ok) {
      return firstAttempt.result;
    }

    if (!firstAttempt.retry) {
      throw firstAttempt.error;
    }

    await sleep(firstAttempt.retryDelayMs);

    const secondAttempt = await this.sendAttempt(input);

    if (secondAttempt.ok) {
      return secondAttempt.result;
    }

    throw secondAttempt.error;
  }

  private async sendAttempt(
    input: SendEmailProviderInput,
  ): Promise<
    | { ok: true; result: SendEmailProviderResult }
    | { ok: false; retry: boolean; retryDelayMs: number; error: Error }
  > {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const body = {
        from: input.from,
        to: input.to,
        subject: input.subject,
        ...(input.html !== undefined ? { html: input.html } : {}),
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      };

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.emailSendId,
          "User-Agent": "Syrantis-Core/1.0",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new EmailProviderHttpError(response.status);
        return {
          ok: false,
          retry: isRetryableHttpStatus(response.status),
          retryDelayMs: response.status === 429 ? this.retryDelayMs.rateLimit : this.retryDelayMs.server,
          error,
        };
      }

      const parsed = ResendSendResponseSchema.safeParse(await response.json().catch(() => null));

      if (!parsed.success) {
        return {
          ok: false,
          retry: false,
          retryDelayMs: 0,
          error: new EmailProviderInvalidResponseError(),
        };
      }

      return {
        ok: true,
        result: {
          provider: "resend",
          messageId: parsed.data.id,
        },
      };
    } catch (error) {
      const resolvedError = isAbortError(error) ? new EmailProviderTimeoutError() : new EmailProviderTimeoutError();
      return {
        ok: false,
        retry: true,
        retryDelayMs: this.retryDelayMs.server,
        error: resolvedError,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
