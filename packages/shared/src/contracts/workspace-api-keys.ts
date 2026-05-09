import { z } from "zod";

export const WorkspaceApiKeyStatusSchema = z.enum(["active", "revoked"]);

export const WorkspaceApiKeyCreateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
  })
  .strict();

export const WorkspaceApiKeySafeDtoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  last4: z.string(),
  status: WorkspaceApiKeyStatusSchema,
  lastUsedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const WorkspaceApiKeyCreateResponseSchema = WorkspaceApiKeySafeDtoSchema.extend({
  plaintextApiKey: z.string().startsWith("syr_live_"),
});

export const WorkspaceApiKeyRevokeResponseSchema = z.object({
  success: z.literal(true),
  data: WorkspaceApiKeySafeDtoSchema,
});

export const WorkspaceApiKeyCreateSuccessSchema = z.object({
  success: z.literal(true),
  data: WorkspaceApiKeyCreateResponseSchema,
});

export const WorkspaceApiKeyListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(WorkspaceApiKeySafeDtoSchema),
});

export const WorkspaceApiKeySuccessSchema = z.object({
  success: z.literal(true),
  data: WorkspaceApiKeySafeDtoSchema,
});

export type WorkspaceApiKeyStatus = z.infer<typeof WorkspaceApiKeyStatusSchema>;
export type WorkspaceApiKeyCreateRequest = z.infer<typeof WorkspaceApiKeyCreateRequestSchema>;
export type WorkspaceApiKeySafeDto = z.infer<typeof WorkspaceApiKeySafeDtoSchema>;
export type WorkspaceApiKeyCreateResponse = z.infer<typeof WorkspaceApiKeyCreateResponseSchema>;
export type WorkspaceApiKeyRevokeResponse = z.infer<typeof WorkspaceApiKeyRevokeResponseSchema>;
export type WorkspaceApiKeyListResponse = z.infer<typeof WorkspaceApiKeyListResponseSchema>;
export type WorkspaceApiKeySuccess = z.infer<typeof WorkspaceApiKeySuccessSchema>;
export type WorkspaceApiKeyCreateSuccess = z.infer<typeof WorkspaceApiKeyCreateSuccessSchema>;
export type WorkspaceApiKeyListSuccess = WorkspaceApiKeyListResponse;

export const WorkspaceApiKeyCreateInputSchema = WorkspaceApiKeyCreateRequestSchema;
export const WorkspaceApiKeyOutputSchema = WorkspaceApiKeySafeDtoSchema;
export const WorkspaceApiKeyCreateOutputSchema = WorkspaceApiKeyCreateResponseSchema;
export const WorkspaceApiKeyListSuccessSchema = WorkspaceApiKeyListResponseSchema;

export type WorkspaceApiKeyCreateInput = WorkspaceApiKeyCreateRequest;
export type WorkspaceApiKeyOutput = WorkspaceApiKeySafeDto;
export type WorkspaceApiKeyCreateOutput = WorkspaceApiKeyCreateResponse;
