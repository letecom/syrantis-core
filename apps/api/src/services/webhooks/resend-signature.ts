import { Webhook, WebhookVerificationError } from "svix";

export type ResendWebhookHeaders = {
  svixId: string | undefined;
  svixTimestamp: string | undefined;
  svixSignature: string | undefined;
};

export type ResendSignatureVerificationResult =
  | { result: "ok"; payload: unknown }
  | { result: "missing_headers" }
  | { result: "invalid_signature" }
  | { result: "invalid_payload" };

export function hasRequiredResendWebhookHeaders(headers: ResendWebhookHeaders): boolean {
  return Boolean(headers.svixId && headers.svixTimestamp && headers.svixSignature);
}

export function verifyResendWebhookSignature(input: {
  secret: string;
  rawBody: string;
  headers: ResendWebhookHeaders;
}): ResendSignatureVerificationResult {
  if (!hasRequiredResendWebhookHeaders(input.headers)) {
    return { result: "missing_headers" };
  }

  try {
    const webhook = new Webhook(input.secret);
    const payload = webhook.verify(input.rawBody, {
      "svix-id": input.headers.svixId ?? "",
      "svix-timestamp": input.headers.svixTimestamp ?? "",
      "svix-signature": input.headers.svixSignature ?? "",
    });

    return { result: "ok", payload };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { result: "invalid_payload" };
    }

    if (error instanceof WebhookVerificationError) {
      return { result: "invalid_signature" };
    }

    return { result: "invalid_signature" };
  }
}
