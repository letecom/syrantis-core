import { z } from "zod";

export const OrganizationStatusSchema = z.enum(["prospect", "active_client", "inactive", "archived"]);

const MetadataSchema = z.record(z.unknown());

const OptionalTrimmedStringSchema = (max: number) => z.string().trim().max(max).optional();

const EmailInputSchema = z.string().trim().email().max(320).transform((value) => value.toLowerCase());

const WebsiteUrlInputSchema = z.string().trim().max(2048).transform((value) => {
  if (value === "" || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
});

export const CreateOrganizationInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  sector: OptionalTrimmedStringSchema(120),
  websiteUrl: WebsiteUrlInputSchema.optional(),
  phone: OptionalTrimmedStringSchema(80),
  email: EmailInputSchema.optional(),
  status: OrganizationStatusSchema.optional(),
  metadata: MetadataSchema.optional()
});

export const UpdateOrganizationInputSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    sector: OptionalTrimmedStringSchema(120),
    websiteUrl: WebsiteUrlInputSchema.optional(),
    phone: OptionalTrimmedStringSchema(80),
    email: EmailInputSchema.optional(),
    status: OrganizationStatusSchema.optional(),
    metadata: MetadataSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required."
  });

export const OrganizationListQuerySchema = z.object({
  status: OrganizationStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const OrganizationOutputSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string(),
  sector: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  status: OrganizationStatusSchema,
  metadata: MetadataSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export const OrganizationSuccessSchema = z.object({
  success: z.literal(true),
  data: OrganizationOutputSchema
});

export const OrganizationListSuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(OrganizationOutputSchema)
});

export type OrganizationStatus = z.infer<typeof OrganizationStatusSchema>;
export type CreateOrganizationInput = z.infer<typeof CreateOrganizationInputSchema>;
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationInputSchema>;
export type OrganizationListQuery = z.infer<typeof OrganizationListQuerySchema>;
export type OrganizationOutput = z.infer<typeof OrganizationOutputSchema>;
export type OrganizationSuccess = z.infer<typeof OrganizationSuccessSchema>;
export type OrganizationListSuccess = z.infer<typeof OrganizationListSuccessSchema>;
