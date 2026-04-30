import { vi } from "vitest";

import type {
  CreateTaskInput,
  TaskListQuery,
  TaskOutput,
  UpdateTaskInput
} from "@syrantis/shared";

import type { TaskService } from "../../services/tasks.js";
import { testUser } from "./auth.js";

export const otherWorkspaceId = "00000000-0000-4000-8000-000000000003";
export const currentWorkspaceTaskId = "00000000-0000-4000-8000-000000000101";
export const otherWorkspaceTaskId = "00000000-0000-4000-8000-000000000201";
export const createdTaskId = "00000000-0000-4000-8000-000000000301";

export const currentWorkspaceTask: TaskOutput = {
  id: currentWorkspaceTaskId,
  workspaceId: testUser.workspaceId,
  type: "followup",
  status: "pending",
  title: "Call client about quote",
  description: "Confirm availability for next week.",
  dueDate: "2026-05-01T10:00:00.000Z",
  assignedTo: null,
  opportunityId: null,
  leadId: null,
  contactId: null,
  metadata: {},
  createdAt: "2026-04-30T10:00:00.000Z",
  updatedAt: "2026-04-30T10:00:00.000Z"
};

export const otherWorkspaceTask: TaskOutput = {
  id: otherWorkspaceTaskId,
  workspaceId: otherWorkspaceId,
  type: "call",
  status: "in_progress",
  title: "Other workspace task",
  description: null,
  dueDate: null,
  assignedTo: null,
  opportunityId: null,
  leadId: null,
  contactId: null,
  metadata: {},
  createdAt: "2026-04-30T11:00:00.000Z",
  updatedAt: "2026-04-30T11:00:00.000Z"
};

function applyTaskUpdate(task: TaskOutput, input: UpdateTaskInput): TaskOutput {
  const metadata = input.metadata ?? task.metadata;
  const assignedTo = input.assignedTo === undefined ? task.assignedTo : input.assignedTo;

  return {
    ...task,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
    metadata,
    assignedTo,
    updatedAt: "2026-04-30T12:00:00.000Z"
  };
}

export function createFakeTaskService(): TaskService {
  const tasks = new Map<string, TaskOutput>([
    [currentWorkspaceTask.id, currentWorkspaceTask],
    [otherWorkspaceTask.id, otherWorkspaceTask]
  ]);

  return {
    listTasks: vi.fn(async (workspaceId: string, query: TaskListQuery) => {
      const workspaceTasks = [...tasks.values()].filter((task) => task.workspaceId === workspaceId);
      const filteredTasks = workspaceTasks.filter((task) => {
        if (query.status && task.status !== query.status) {
          return false;
        }

        if (query.type && task.type !== query.type) {
          return false;
        }

        return true;
      });

      return filteredTasks.slice(0, query.limit);
    }),

    createTask: vi.fn(async (workspaceId: string, _userId: string, input: CreateTaskInput) => {
      const task: TaskOutput = {
        id: createdTaskId,
        workspaceId,
        type: input.type,
        status: "pending",
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
        assignedTo: input.assignedTo ?? null,
        opportunityId: input.opportunityId ?? null,
        leadId: input.leadId ?? null,
        contactId: input.contactId ?? null,
        metadata: input.metadata ?? {},
        createdAt: "2026-04-30T12:00:00.000Z",
        updatedAt: "2026-04-30T12:00:00.000Z"
      };

      tasks.set(task.id, task);

      return task;
    }),

    getTask: vi.fn(async (workspaceId: string, id: string) => {
      const task = tasks.get(id);
      return task?.workspaceId === workspaceId ? task : null;
    }),

    updateTask: vi.fn(async (workspaceId: string, _userId: string, id: string, input: UpdateTaskInput) => {
      const task = tasks.get(id);

      if (!task || task.workspaceId !== workspaceId) {
        return null;
      }

      const updatedTask = applyTaskUpdate(task, input);
      tasks.set(id, updatedTask);

      return updatedTask;
    })
  };
}
