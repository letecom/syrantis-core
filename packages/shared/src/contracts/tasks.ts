import { z } from "zod";

export const TaskTypeSchema = z.enum(["followup", "approval", "review", "call", "note", "setup"]);

export const TaskStatusSchema = z.enum(["pending", "in_progress", "done", "cancelled"]);

const MetadataSchema = z.record(z.unknown());

export const CreateTaskInputSchema = z.object({
  type: TaskTypeSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
  assignedTo: z.string().uuid().optional(),
  opportunityId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  metadata: MetadataSchema.optional()
});

export const UpdateTaskInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    status: TaskStatusSchema.optional(),
    dueDate: z.string().datetime({ offset: true }).nullable().optional(),
    assignedTo: z.string().uuid().nullable().optional(),
    metadata: MetadataSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required."
  });

export const TaskOutputSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  type: TaskTypeSchema,
  status: TaskStatusSchema,
  title: z.string(),
  description: z.string().nullable(),
  dueDate: z.string().nullable(),
  assignedTo: z.string().uuid().nullable(),
  opportunityId: z.string().uuid().nullable(),
  leadId: z.string().uuid().nullable(),
  contactId: z.string().uuid().nullable(),
  metadata: MetadataSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export const TaskListQuerySchema = z.object({
  status: TaskStatusSchema.optional(),
  type: TaskTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const TaskSuccessSchema = z.object({
  success: z.literal(true),
  data: TaskOutputSchema
});

export const TaskListSuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(TaskOutputSchema)
});

export type TaskType = z.infer<typeof TaskTypeSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;
export type TaskOutput = z.infer<typeof TaskOutputSchema>;
export type TaskListQuery = z.infer<typeof TaskListQuerySchema>;
