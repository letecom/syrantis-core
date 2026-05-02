import { z } from "zod";

export const WorkspaceApiKeyStatusSchema = z.enum(["active", "revoked"]);

export const WorkspaceApiKeyCreateInputSchema = z.object({
  name: z.string().min(1).max(160)
});

export const WorkspaceApiKeyOutputSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  last4: z.string(),
  status: WorkspaceApiKeyStatusSchema,
  lastUsedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const WorkspaceApiKeyCreateOutputSchema = WorkspaceApiKeyOutputSchema.extend({
  plaintextApiKey: z.string().startsWith("syr_live_")
});

export const WorkspaceApiKeySuccessSchema = z.object({
  success: z.literal(true),
  data: WorkspaceApiKeyOutputSchema
});

export const WorkspaceApiKeyCreateSuccessSchema = z.object({
  success: z.literal(true),
  data: WorkspaceApiKeyCreateOutputSchema
});

export const WorkspaceApiKeyListSuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(WorkspaceApiKeyOutputSchema)
});

export type WorkspaceApiKeyStatus = z.infer<typeof WorkspaceApiKeyStatusSchema>;
export type WorkspaceApiKeyCreateInput = z.infer<typeof WorkspaceApiKeyCreateInputSchema>;
export type WorkspaceApiKeyOutput = z.infer<typeof WorkspaceApiKeyOutputSchema>;
export type WorkspaceApiKeyCreateOutput = z.infer<typeof WorkspaceApiKeyCreateOutputSchema>;
export type WorkspaceApiKeySuccess = z.infer<typeof WorkspaceApiKeySuccessSchema>;
export type WorkspaceApiKeyCreateSuccess = z.infer<typeof WorkspaceApiKeyCreateSuccessSchema>;
export type WorkspaceApiKeyListSuccess = z.infer<typeof WorkspaceApiKeyListSuccessSchema>;
