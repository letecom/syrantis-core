import { z } from "zod";

export const LeadStatusSchema = z.enum(["new", "scored", "drafted", "responded", "lost", "won"]);

export const LeadSourceSchema = z.enum(["email", "form", "phone", "manual", "import"]);

const MetadataSchema = z.record(z.unknown());

const OptionalTrimmedStringSchema = (max: number) => z.string().trim().max(max).optional();

function hasLeadContent(value: {
  organizationId?: string | null | undefined;
  contactId?: string | null | undefined;
  rawContent?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}): boolean {
  return Boolean(
    value.organizationId ||
      value.contactId ||
      value.rawContent ||
      (value.metadata && Object.keys(value.metadata).length > 0)
  );
}

export const CreateLeadInputSchema = z
  .object({
    organizationId: z.string().uuid().nullable().optional(),
    contactId: z.string().uuid().nullable().optional(),
    source: LeadSourceSchema.optional(),
    status: LeadStatusSchema.optional(),
    rawContent: OptionalTrimmedStringSchema(10000),
    receivedAt: z.string().datetime({ offset: true }).nullable().optional(),
    metadata: MetadataSchema.optional()
  })
  .refine(hasLeadContent, {
    message: "At least one lead content field is required."
  });

export const UpdateLeadInputSchema = z
  .object({
    organizationId: z.string().uuid().nullable().optional(),
    contactId: z.string().uuid().nullable().optional(),
    source: LeadSourceSchema.optional(),
    status: LeadStatusSchema.optional(),
    rawContent: OptionalTrimmedStringSchema(10000),
    receivedAt: z.string().datetime({ offset: true }).nullable().optional(),
    metadata: MetadataSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required."
  });

export const LeadListQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  source: LeadSourceSchema.optional(),
  status: LeadStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const LeadOutputSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  organizationId: z.string().uuid().nullable(),
  contactId: z.string().uuid().nullable(),
  source: LeadSourceSchema,
  status: LeadStatusSchema,
  rawContent: z.string().nullable(),
  metadata: MetadataSchema,
  score: z.number().int().nullable(),
  scoreReason: z.string().nullable(),
  receivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const LeadSuccessSchema = z.object({
  success: z.literal(true),
  data: LeadOutputSchema
});

export const LeadListSuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(LeadOutputSchema)
});

export const LeadScoreRequestSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    jobId: z.string().uuid(),
    leadId: z.string().uuid()
  })
});

export const LeadDraftGenerationRequestSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    jobId: z.string().uuid(),
    leadId: z.string().uuid()
  })
});

export type LeadStatus = z.infer<typeof LeadStatusSchema>;
export type LeadSource = z.infer<typeof LeadSourceSchema>;
export type CreateLeadInput = z.infer<typeof CreateLeadInputSchema>;
export type UpdateLeadInput = z.infer<typeof UpdateLeadInputSchema>;
export type LeadListQuery = z.infer<typeof LeadListQuerySchema>;
export type LeadOutput = z.infer<typeof LeadOutputSchema>;
export type LeadSuccess = z.infer<typeof LeadSuccessSchema>;
export type LeadListSuccess = z.infer<typeof LeadListSuccessSchema>;
export type LeadScoreRequestSuccess = z.infer<typeof LeadScoreRequestSuccessSchema>;
export type LeadDraftGenerationRequestSuccess = z.infer<typeof LeadDraftGenerationRequestSuccessSchema>;
