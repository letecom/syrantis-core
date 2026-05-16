import { z } from "zod";

const maxSerializedPolicyLength = 30_000;

const credentialValuePatterns = [
  /\bsyr_live_[a-z0-9_-]{8,}\b/i,
  /\bsk-[a-z0-9_-]{16,}\b/i,
  /\bAIza[0-9A-Za-z_-]{16,}\b/,
  /\b[A-Za-z0-9+/]{20,}[+/=][A-Za-z0-9+/=]{8,}\b/,
];

const credentialKeyParts = [
  "apiKey",
  "api_key",
  "apikey",
  "secret",
  "token",
  "password",
  "credential",
  "privateKey",
  "private_key",
];

function nullableTrimmed(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length ? value : null))
    .nullable()
    .default(null);
}

function trimmedItem(max: number) {
  return z.string().trim().min(1).max(max);
}

function findUnsafeCredentialValue(value: unknown): boolean {
  if (typeof value === "string") {
    return credentialValuePatterns.some((pattern) => pattern.test(value));
  }

  if (Array.isArray(value)) {
    return value.some(findUnsafeCredentialValue);
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value).some(
      ([key, child]) =>
        credentialKeyParts.some((part) => key.toLowerCase().includes(part.toLowerCase())) ||
        findUnsafeCredentialValue(child),
    );
  }

  return false;
}

function enforcePolicySafety(value: unknown, ctx: z.RefinementCtx) {
  if (findUnsafeCredentialValue(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Credential-like material is not allowed.",
    });
  }

  if (JSON.stringify(value).length > maxSerializedPolicyLength) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Response policy payload is too large.",
    });
  }
}

export const ClientResponsePolicyExampleReplySchema = z
  .object({
    label: trimmedItem(100),
    bodyText: trimmedItem(1500),
  })
  .strict();

const ClientResponsePolicyBaseSchema = z
  .object({
    language: z.enum(["fr", "en", "auto"]).default("auto"),
    tone: z
      .enum(["professional", "warm", "direct", "premium", "technical", "custom"])
      .default("professional"),
    customToneNotes: nullableTrimmed(1000),
    signature: nullableTrimmed(1000),
    defaultGreeting: nullableTrimmed(300),
    defaultClosing: nullableTrimmed(500),
    responseStructure: z.array(trimmedItem(300)).max(8).default([]),
    businessRules: z.array(trimmedItem(500)).max(20).default([]),
    forbiddenClaims: z.array(trimmedItem(300)).max(20).default([]),
    escalationRules: z.array(trimmedItem(500)).max(20).default([]),
    offerNotes: z.array(trimmedItem(500)).max(20).default([]),
    catalogSummary: nullableTrimmed(3000),
    exampleReplies: z.array(ClientResponsePolicyExampleReplySchema).max(5).default([]),
  })
  .strict();

export const ClientResponsePolicyInputSchema =
  ClientResponsePolicyBaseSchema.superRefine(enforcePolicySafety);

export const ClientResponsePolicySchema = ClientResponsePolicyBaseSchema.extend({
  updatedAt: z.string().datetime().nullable(),
  status: z.enum(["empty", "configured"]),
})
  .strip()
  .superRefine(enforcePolicySafety);

export const ClientResponsePolicyGetSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    policy: ClientResponsePolicySchema,
  }),
});

export const ClientResponsePolicyPutSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    policy: ClientResponsePolicySchema,
  }),
});

export type ClientResponsePolicyInput = z.infer<typeof ClientResponsePolicyInputSchema>;
export type ClientResponsePolicy = z.infer<typeof ClientResponsePolicySchema>;
export type ClientResponsePolicyGetSuccess = z.infer<
  typeof ClientResponsePolicyGetSuccessSchema
>;
export type ClientResponsePolicyPutSuccess = z.infer<
  typeof ClientResponsePolicyPutSuccessSchema
>;
