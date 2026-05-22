import { z } from "zod";

const maxSerializedPolicyLength = 30_000;

const credentialValuePatterns = [
  /\bsyr_live_[a-z0-9_-]{8,}\b/i,
  /\bsk-[a-z0-9_-]{16,}\b/i,
  /\bAIza[0-9A-Za-z_-]{16,}\b/,
  /\b[A-Za-z0-9+/]{20,}[+/=][A-Za-z0-9+/=]{8,}\b/,
];

const forbiddenFieldNames = new Set([
  "workspaceId",
  "workspace_id",
  "workspace-id",
  "x-workspace-id",
  "tenantId",
  "tenant_id",
  "tenant-id",
  "x-tenant-id",
  "role",
  "apiKey",
  "api_key",
  "apikey",
  "token",
  "secret",
  "password",
  "credential",
  "privateKey",
  "private_key",
  "prompt",
  "output",
  "metadata",
  "metadataJson",
  "metadata_json",
  "rawMetadata",
  "raw_metadata",
  "rawJson",
  "raw_json",
  "provider",
  "providerId",
  "provider_id",
  "providerMessageId",
  "provider_message_id",
]);

function nullableTrimmed(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length ? value : null))
    .nullable();
}

function trimmedItem(max: number) {
  return z.string().trim().min(1).max(max);
}

function containsUnsafeFieldOrCredential(value: unknown): boolean {
  if (typeof value === "string") {
    return credentialValuePatterns.some((pattern) => pattern.test(value));
  }

  if (Array.isArray(value)) {
    return value.some(containsUnsafeFieldOrCredential);
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value).some(
      ([key, child]) => forbiddenFieldNames.has(key) || containsUnsafeFieldOrCredential(child),
    );
  }

  return false;
}

function enforceClientConfigPolicySafety(value: unknown, ctx: z.RefinementCtx) {
  if (containsUnsafeFieldOrCredential(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unsafe response policy field or credential-like material is not allowed.",
    });
  }

  if (JSON.stringify(value).length > maxSerializedPolicyLength) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Response policy payload is too large.",
    });
  }
}

export const ClientConfigResponsePolicyExampleReplySchema = z
  .object({
    label: trimmedItem(100),
    body: trimmedItem(1500),
  })
  .strict();

const ClientConfigResponsePolicyBaseSchema = z
  .object({
    language: z.enum(["fr", "en", "auto"]),
    tone: z.enum(["professional", "warm", "direct", "premium", "technical", "custom"]),
    customToneNotes: nullableTrimmed(1000),
    defaultGreeting: nullableTrimmed(300),
    defaultClosing: nullableTrimmed(500),
    signature: nullableTrimmed(1000),
    structureLines: z.array(trimmedItem(300)).max(8),
    businessRules: z.array(trimmedItem(500)).max(20),
    forbiddenClaims: z.array(trimmedItem(300)).max(20),
    escalationRules: z.array(trimmedItem(500)).max(20),
    offerNotes: z.array(trimmedItem(500)).max(20),
    catalogSummary: nullableTrimmed(3000),
    exampleReplies: z.array(ClientConfigResponsePolicyExampleReplySchema).max(5),
  })
  .strict();

export const ClientConfigResponsePolicyUpdateSchema =
  ClientConfigResponsePolicyBaseSchema.superRefine(enforceClientConfigPolicySafety);

export const ClientConfigResponsePolicySchema = ClientConfigResponsePolicyBaseSchema.extend({
  configured: z.boolean(),
  updatedAt: z.string().datetime().nullable(),
})
  .strip()
  .superRefine(enforceClientConfigPolicySafety);

export const ClientConfigResponsePolicySuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    policy: ClientConfigResponsePolicySchema,
  }),
});

export type ClientConfigResponsePolicyUpdate = z.infer<
  typeof ClientConfigResponsePolicyUpdateSchema
>;
export type ClientConfigResponsePolicy = z.infer<typeof ClientConfigResponsePolicySchema>;
export type ClientConfigResponsePolicySuccess = z.infer<
  typeof ClientConfigResponsePolicySuccessSchema
>;
