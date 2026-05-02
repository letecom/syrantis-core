import { z } from "zod";

export const PublicLeadSourceSchema = z.enum(["form", "email", "phone", "manual", "import"]);

const ForbiddenSecretKeyFragments = [
  "token",
  "password",
  "secret",
  "api_key",
  "apikey",
  "private_key",
  "authorization",
  "bearer",
  "client_secret",
  "refresh_token",
  "access_token"
] as const;

const MetadataSchema = z.record(z.unknown());

const OptionalTrimmedStringSchema = (max: number) => z.string().trim().min(1).max(max).optional();

function hasForbiddenSecretKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenSecretKey);
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.entries(value).some(([key, childValue]) => {
    const normalizedKey = key.toLowerCase();
    return (
      ForbiddenSecretKeyFragments.some((fragment) => normalizedKey.includes(fragment)) ||
      hasForbiddenSecretKey(childValue)
    );
  });
}

function hasLeadSignal(value: {
  email?: string | undefined;
  firstName?: string | undefined;
  phone?: string | undefined;
  organizationName?: string | undefined;
  message?: string | undefined;
}): boolean {
  return Boolean(value.email || value.phone || value.message || (value.firstName && value.organizationName));
}

function hasCompleteExternalMapping(value: {
  externalConnectionId?: string | undefined;
  externalObjectType?: string | undefined;
  externalObjectId?: string | undefined;
}): boolean {
  const mappingFields = [
    value.externalConnectionId,
    value.externalObjectType,
    value.externalObjectId
  ].filter((field) => field !== undefined);

  return mappingFields.length === 0 || mappingFields.length === 3;
}

export const PublicLeadIntakeInputSchema = z
  .object({
    email: z.string().trim().email().max(320).optional(),
    firstName: OptionalTrimmedStringSchema(120),
    lastName: OptionalTrimmedStringSchema(120),
    phone: OptionalTrimmedStringSchema(80),
    organizationName: OptionalTrimmedStringSchema(255),
    source: PublicLeadSourceSchema.default("form"),
    message: OptionalTrimmedStringSchema(2000),
    externalConnectionId: z.string().uuid().optional(),
    externalObjectType: OptionalTrimmedStringSchema(80),
    externalObjectId: OptionalTrimmedStringSchema(255),
    metadata: MetadataSchema.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!hasLeadSignal(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one lead signal is required."
      });
    }

    if (!hasCompleteExternalMapping(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "External mapping fields must be provided together."
      });
    }

    if (hasForbiddenSecretKey(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Secret-like keys are not accepted."
      });
    }
  });

export const PublicLeadIntakeCreatedStatusSchema = z.enum(["created", "idempotent_replay"]);

export const PublicLeadIntakeSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string().uuid(),
    status: PublicLeadIntakeCreatedStatusSchema
  })
});

export type PublicLeadSource = z.infer<typeof PublicLeadSourceSchema>;
export type PublicLeadIntakeInput = z.infer<typeof PublicLeadIntakeInputSchema>;
export type PublicLeadIntakeCreatedStatus = z.infer<typeof PublicLeadIntakeCreatedStatusSchema>;
export type PublicLeadIntakeSuccess = z.infer<typeof PublicLeadIntakeSuccessSchema>;
