import { z } from "zod";

export const ClientUserCreateInputSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    displayName: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

export const ClientUserSafeDtoSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: z.literal("client"),
  status: z.literal("active"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ClientUserCreateResponseSchema = z.object({
  user: ClientUserSafeDtoSchema,
  temporaryPassword: z.string().min(16),
});

export const ClientUserCreateSuccessSchema = z.object({
  success: z.literal(true),
  data: ClientUserCreateResponseSchema,
});

export const ClientUserListSuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(ClientUserSafeDtoSchema),
});

export type ClientUserCreateInput = z.infer<typeof ClientUserCreateInputSchema>;
export type ClientUserSafeDto = z.infer<typeof ClientUserSafeDtoSchema>;
export type ClientUserCreateResponse = z.infer<typeof ClientUserCreateResponseSchema>;
export type ClientUserCreateSuccess = z.infer<typeof ClientUserCreateSuccessSchema>;
export type ClientUserListSuccess = z.infer<typeof ClientUserListSuccessSchema>;
