import { z } from "zod";

export const DraftStatusSchema = z.enum(["draft", "pending_approval", "approved", "rejected", "archived"]);

export const DraftChannelSchema = z.enum(["email"]);

const MetadataSchema = z.record(z.unknown());

function hasDraftBody(value: { textBody?: string | undefined; htmlBody?: string | undefined }): boolean {
  return Boolean(value.textBody || value.htmlBody);
}

export const CreateDraftInputSchema = z
  .object({
    leadId: z.string().uuid(),
    contactId: z.string().uuid().optional(),
    channel: DraftChannelSchema.optional(),
    subject: z.string().trim().max(500).optional(),
    textBody: z.string().trim().max(20000).optional(),
    htmlBody: z.string().trim().max(50000).optional(),
    metadata: MetadataSchema.optional()
  })
  .refine(hasDraftBody, {
    message: "At least one draft body field is required."
  });

export const UpdateDraftInputSchema = z
  .object({
    subject: z.string().trim().max(500).nullable().optional(),
    textBody: z.string().trim().max(20000).nullable().optional(),
    htmlBody: z.string().trim().max(50000).nullable().optional(),
    metadata: MetadataSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required."
  });

export const DraftListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const DraftOutputSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  taskId: z.string().uuid().nullable(),
  leadId: z.string().uuid().nullable(),
  opportunityId: z.string().uuid().nullable(),
  contactId: z.string().uuid().nullable(),
  status: DraftStatusSchema,
  channel: DraftChannelSchema,
  subject: z.string().nullable(),
  textBody: z.string().nullable(),
  htmlBody: z.string().nullable(),
  metadata: MetadataSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export const DraftSuccessSchema = z.object({
  success: z.literal(true),
  data: DraftOutputSchema
});

export const DraftListSuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(DraftOutputSchema)
});

export type DraftStatus = z.infer<typeof DraftStatusSchema>;
export type DraftChannel = z.infer<typeof DraftChannelSchema>;
export type CreateDraftInput = z.infer<typeof CreateDraftInputSchema>;
export type UpdateDraftInput = z.infer<typeof UpdateDraftInputSchema>;
export type DraftListQuery = z.infer<typeof DraftListQuerySchema>;
export type DraftOutput = z.infer<typeof DraftOutputSchema>;
export type DraftSuccess = z.infer<typeof DraftSuccessSchema>;
export type DraftListSuccess = z.infer<typeof DraftListSuccessSchema>;
