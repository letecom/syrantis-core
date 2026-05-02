import { ResendProvider, type SendEmailProviderInput, type SendEmailProviderResult } from "./resend-provider.js";

export type EmailProviderMode = "internal" | "resend";

export type EmailProvider = {
  mode: EmailProviderMode;
  send(input: SendEmailProviderInput): Promise<SendEmailProviderResult>;
};

export class EmailProviderInvalidError extends Error {
  code = "EMAIL_PROVIDER_INVALID" as const;

  constructor() {
    super("EMAIL_PROVIDER_INVALID");
  }
}

export function resolveEmailProviderMode(value = process.env.SEND_EMAIL_PROVIDER): EmailProviderMode {
  if (!value || value === "internal") {
    return "internal";
  }

  if (value === "resend") {
    return "resend";
  }

  throw new EmailProviderInvalidError();
}

export function createEmailProvider(): EmailProvider {
  const mode = resolveEmailProviderMode();

  if (mode === "internal") {
    return {
      mode,
      async send() {
        throw new Error("EMAIL_PROVIDER_INTERNAL_NOOP");
      },
    };
  }

  const provider = new ResendProvider();

  return {
    mode,
    send(input) {
      return provider.send(input);
    },
  };
}
