import { z } from "zod";

const MetadataSchema = z.record(z.unknown());

const OptionalTrimmedStringSchema = (max: number) => z.string().trim().max(max).optional();

const EmailInputSchema = z.string().trim().email().max(320).transform((value) => value.toLowerCase());

function hasContactIdentity(value: {
  email?: string | undefined;
  phone?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
}): boolean {
  return Boolean(value.email || value.phone || value.firstName || value.lastName);
}

export const CreateContactInputSchema = z
  .object({
    organizationId: z.string().uuid().nullable().optional(),
    firstName: OptionalTrimmedStringSchema(120),
    lastName: OptionalTrimmedStringSchema(120),
    email: EmailInputSchema.optional(),
    phone: OptionalTrimmedStringSchema(80),
    roleTitle: OptionalTrimmedStringSchema(160),
    optOut: z.boolean().optional(),
    metadata: MetadataSchema.optional()
  })
  .refine(hasContactIdentity, {
    message: "At least one contact identity field is required."
  });

export const UpdateContactInputSchema = z
  .object({
    organizationId: z.string().uuid().nullable().optional(),
    firstName: OptionalTrimmedStringSchema(120),
    lastName: OptionalTrimmedStringSchema(120),
    email: EmailInputSchema.optional(),
    phone: OptionalTrimmedStringSchema(80),
    roleTitle: OptionalTrimmedStringSchema(160),
    optOut: z.boolean().optional(),
    metadata: MetadataSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required."
  });

export const ContactListQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const ContactOutputSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  organizationId: z.string().uuid().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  roleTitle: z.string().nullable(),
  optOut: z.boolean(),
  metadata: MetadataSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export const ContactSuccessSchema = z.object({
  success: z.literal(true),
  data: ContactOutputSchema
});

export const ContactListSuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(ContactOutputSchema)
});

export type CreateContactInput = z.infer<typeof CreateContactInputSchema>;
export type UpdateContactInput = z.infer<typeof UpdateContactInputSchema>;
export type ContactListQuery = z.infer<typeof ContactListQuerySchema>;
export type ContactOutput = z.infer<typeof ContactOutputSchema>;
export type ContactSuccess = z.infer<typeof ContactSuccessSchema>;
export type ContactListSuccess = z.infer<typeof ContactListSuccessSchema>;
