import { z } from "zod";

const maxSerializedProfilesPayloadLength = 20_000;

const forbiddenFieldNames = new Set([
  "workspaceId",
  "workspace_id",
  "prompt",
  "systemPrompt",
  "template",
  "output",
  "generatedText",
  "providerId",
  "modelId",
  "apiKey",
  "api_key",
  "token",
  "secret",
  "raw",
  "metadata",
  "config",
  "settings",
  "password",
  "passwordHash",
]);

const credentialValuePatterns = [
  /\bsyr_live_[a-z0-9_-]{8,}\b/i,
  /\bsk-[a-z0-9_-]{16,}\b/i,
  /\bAIza[0-9A-Za-z_-]{16,}\b/,
];

export const ClientResponseProfileToneSchema = z.enum([
  "professional",
  "friendly",
  "formal",
  "empathetic",
  "concise",
  "direct",
]);

export const ClientResponseProfileAuthorityLevelSchema = z.enum([
  "standard",
  "manager",
  "direction",
]);

function nullableTrimmed(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length ? value : null))
    .nullable();
}

function optionalNullableTrimmed(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length ? value : null))
    .nullable()
    .optional();
}

function trimmedString(max: number) {
  return z.string().trim().min(1).max(max);
}

function trimmedStringArray() {
  return z.array(trimmedString(200)).max(12);
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

function enforceClientResponseProfileSafety(value: unknown, ctx: z.RefinementCtx) {
  if (containsUnsafeFieldOrCredential(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unsafe response profile field or credential-like material is not allowed.",
    });
  }

  if (JSON.stringify(value).length > maxSerializedProfilesPayloadLength) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Response profile payload is too large.",
    });
  }
}

const ClientResponseProfileEditableSchema = z
  .object({
    name: trimmedString(100),
    senderName: trimmedString(100),
    roleLabel: trimmedString(120),
    description: nullableTrimmed(500),
    tone: ClientResponseProfileToneSchema,
    styleNotes: nullableTrimmed(1000),
    authorityLevel: ClientResponseProfileAuthorityLevelSchema,
    appliesToCategories: trimmedStringArray(),
    specificRules: trimmedStringArray(),
    escalationRules: trimmedStringArray(),
    forbiddenClaims: trimmedStringArray(),
    isDefault: z.boolean(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .strict();

export const ClientResponseProfileCreateSchema = ClientResponseProfileEditableSchema.extend({
  description: optionalNullableTrimmed(500),
  styleNotes: optionalNullableTrimmed(1000),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
})
  .strict()
  .superRefine(enforceClientResponseProfileSafety);

export const ClientResponseProfileUpdateSchema =
  ClientResponseProfileEditableSchema.superRefine(enforceClientResponseProfileSafety);

export const ClientResponseProfileSchema = ClientResponseProfileEditableSchema.extend({
  id: z.string().uuid(),
  description: z.string().nullable(),
  styleNotes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
  .strip()
  .superRefine(enforceClientResponseProfileSafety);

export const ClientResponseProfilesListSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    profiles: z.array(ClientResponseProfileSchema),
  }),
});

export const ClientResponseProfileSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    profile: ClientResponseProfileSchema,
  }),
});

export type ClientResponseProfileTone = z.infer<typeof ClientResponseProfileToneSchema>;
export type ClientResponseProfileAuthorityLevel = z.infer<
  typeof ClientResponseProfileAuthorityLevelSchema
>;
export type ClientResponseProfileCreate = z.infer<typeof ClientResponseProfileCreateSchema>;
export type ClientResponseProfileUpdate = z.infer<typeof ClientResponseProfileUpdateSchema>;
export type ClientResponseProfile = z.infer<typeof ClientResponseProfileSchema>;
export type ClientResponseProfilesListSuccess = z.infer<
  typeof ClientResponseProfilesListSuccessSchema
>;
export type ClientResponseProfileSuccess = z.infer<typeof ClientResponseProfileSuccessSchema>;
