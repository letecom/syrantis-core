import { z } from "zod";

export const JobTypeSchema = z.enum(["send_email"]);

export const JobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const SendEmailJobPayloadSchema = z.object({
  emailSendId: z.string().uuid(),
});

export const BackgroundJobOutputSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  type: JobTypeSchema,
  payload: z.record(z.unknown()),
  status: JobStatusSchema,
  attempts: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  runAfter: z.string(),
  lockedAt: z.string().nullable(),
  lockedBy: z.string().nullable(),
  completedAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type JobType = z.infer<typeof JobTypeSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type SendEmailJobPayload = z.infer<typeof SendEmailJobPayloadSchema>;
export type BackgroundJobOutput = z.infer<typeof BackgroundJobOutputSchema>;
