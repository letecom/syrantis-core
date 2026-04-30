import { z } from "zod";

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string()
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export function unauthorized(code = "UNAUTHORIZED"): ApiError {
  return ApiErrorSchema.parse({
    success: false,
    error: "Unauthorized.",
    code
  });
}

export function forbidden(code = "FORBIDDEN"): ApiError {
  return ApiErrorSchema.parse({
    success: false,
    error: "Forbidden.",
    code
  });
}
