import { z } from "zod";

export const EmailSendStatusSchema = z.enum([
  "pending",
  "queued",
  "sent",
  "failed",
  "cancelled",
]);

export const RequestEmailSendInputSchema = z.object({
  message: z.string().trim().max(1000).optional(),
});

export const EmailSendListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const EmailSendOutputSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  draftId: z.string().uuid(),
  status: EmailSendStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const EmailSendSuccessSchema = z.object({
  success: z.literal(true),
  data: EmailSendOutputSchema,
});

export const EmailSendListSuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(EmailSendOutputSchema),
});

export type EmailSendStatus = z.infer<typeof EmailSendStatusSchema>;
export type RequestEmailSendInput = z.infer<typeof RequestEmailSendInputSchema>;
export type EmailSendListQuery = z.infer<typeof EmailSendListQuerySchema>;
export type EmailSendOutput = z.infer<typeof EmailSendOutputSchema>;
export type EmailSendSuccess = z.infer<typeof EmailSendSuccessSchema>;
export type EmailSendListSuccess = z.infer<typeof EmailSendListSuccessSchema>;
