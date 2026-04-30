import { z } from "zod";

export const LoginInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200)
});

export const AuthMeSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  role: z.enum(["founder", "admin", "operator", "client"]),
  workspaceId: z.string().uuid(),
  workspaceName: z.string().min(1)
});

export const AuthSuccessSchema = z.object({
  success: z.literal(true),
  data: AuthMeSchema
});

export const AuthErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string()
});

export type LoginInput = z.infer<typeof LoginInputSchema>;
export type AuthMe = z.infer<typeof AuthMeSchema>;
export type AuthSuccess = z.infer<typeof AuthSuccessSchema>;
export type AuthError = z.infer<typeof AuthErrorSchema>;
