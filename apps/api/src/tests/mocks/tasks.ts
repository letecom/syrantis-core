import { vi } from "vitest";

import type {
  CreateTaskInput,
  TaskListQuery,
  TaskOutput,
  UpdateTaskInput
} from "@syrantis/shared";

import type { TaskService, TaskServiceMutationResult } from "../../services/tasks.js";
import { testUser } from "./auth.js";

export const otherWorkspaceId = "00000000-0000-4000-8000-000000000003";
export const currentWorkspaceTaskId = "00000000-0000-4000-8000-000000000101";
export const otherWorkspaceTaskId = "00000000-0000-4000-8000-000000000201";
export const createdTaskId = "00000000-0000-4000-8000-000000000301";
export const currentWorkspaceOrganizationId = "00000000-0000-4000-8000-000000000401";
export const currentWorkspaceOtherOrganizationId = "00000000-0000-4000-8000-000000000402";
export const otherWorkspaceOrganizationId = "00000000-0000-4000-8000-000000000403";
export const currentWorkspaceContactId = "00000000-0000-4000-8000-000000000501";
export const currentWorkspaceOtherContactId = "00000000-0000-4000-8000-000000000502";
export const otherWorkspaceContactId = "00000000-0000-4000-8000-000000000503";
export const currentWorkspaceLeadId = "00000000-0000-4000-8000-000000000601";
export const currentWorkspaceOtherLeadId = "00000000-0000-4000-8000-000000000602";
export const otherWorkspaceLeadId = "00000000-0000-4000-8000-000000000603";
export const currentWorkspaceOpportunityId = "00000000-0000-4000-8000-000000000701";
export const currentWorkspaceOtherOpportunityId = "00000000-0000-4000-8000-000000000702";
export const otherWorkspaceOpportunityId = "00000000-0000-4000-8000-000000000703";

export const currentWorkspaceTask: TaskOutput = {
  id: currentWorkspaceTaskId,
  workspaceId: testUser.workspaceId,
  type: "followup",
  status: "pending",
  title: "Call client about quote",
  description: "Confirm availability for next week.",
  dueDate: "2026-05-01T10:00:00.000Z",
  assignedTo: null,
  organizationId: currentWorkspaceOrganizationId,
  opportunityId: null,
  leadId: null,
  contactId: currentWorkspaceContactId,
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
  organizationId: otherWorkspaceOrganizationId,
  opportunityId: null,
  leadId: null,
  contactId: otherWorkspaceContactId,
  metadata: {},
  createdAt: "2026-04-30T11:00:00.000Z",
  updatedAt: "2026-04-30T11:00:00.000Z"
};

type ContactRelation = { id: string; workspaceId: string; organizationId: string | null };
type LeadRelation = { id: string; workspaceId: string; organizationId: string | null; contactId: string | null };
type OpportunityRelation = {
  id: string;
  workspaceId: string;
  organizationId: string | null;
  contactId: string | null;
  leadId: string | null;
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
    ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
    ...(input.opportunityId !== undefined ? { opportunityId: input.opportunityId } : {}),
    ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
    ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
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
  const organizationIds = new Map([
    [currentWorkspaceOrganizationId, testUser.workspaceId],
    [currentWorkspaceOtherOrganizationId, testUser.workspaceId],
    [otherWorkspaceOrganizationId, otherWorkspaceId]
  ]);
  const contacts = new Map<string, ContactRelation>([
    [currentWorkspaceContactId, { id: currentWorkspaceContactId, workspaceId: testUser.workspaceId, organizationId: currentWorkspaceOrganizationId }],
    [
      currentWorkspaceOtherContactId,
      { id: currentWorkspaceOtherContactId, workspaceId: testUser.workspaceId, organizationId: currentWorkspaceOtherOrganizationId }
    ],
    [otherWorkspaceContactId, { id: otherWorkspaceContactId, workspaceId: otherWorkspaceId, organizationId: otherWorkspaceOrganizationId }]
  ]);
  const leads = new Map<string, LeadRelation>([
    [
      currentWorkspaceLeadId,
      { id: currentWorkspaceLeadId, workspaceId: testUser.workspaceId, organizationId: currentWorkspaceOrganizationId, contactId: currentWorkspaceContactId }
    ],
    [
      currentWorkspaceOtherLeadId,
      {
        id: currentWorkspaceOtherLeadId,
        workspaceId: testUser.workspaceId,
        organizationId: currentWorkspaceOtherOrganizationId,
        contactId: currentWorkspaceOtherContactId
      }
    ],
    [
      otherWorkspaceLeadId,
      { id: otherWorkspaceLeadId, workspaceId: otherWorkspaceId, organizationId: otherWorkspaceOrganizationId, contactId: otherWorkspaceContactId }
    ]
  ]);
  const opportunities = new Map<string, OpportunityRelation>([
    [
      currentWorkspaceOpportunityId,
      {
        id: currentWorkspaceOpportunityId,
        workspaceId: testUser.workspaceId,
        organizationId: currentWorkspaceOrganizationId,
        contactId: currentWorkspaceContactId,
        leadId: currentWorkspaceLeadId
      }
    ],
    [
      currentWorkspaceOtherOpportunityId,
      {
        id: currentWorkspaceOtherOpportunityId,
        workspaceId: testUser.workspaceId,
        organizationId: currentWorkspaceOtherOrganizationId,
        contactId: currentWorkspaceOtherContactId,
        leadId: currentWorkspaceOtherLeadId
      }
    ],
    [
      otherWorkspaceOpportunityId,
      {
        id: otherWorkspaceOpportunityId,
        workspaceId: otherWorkspaceId,
        organizationId: otherWorkspaceOrganizationId,
        contactId: otherWorkspaceContactId,
        leadId: otherWorkspaceLeadId
      }
    ]
  ]);

  function mutationOk(task: TaskOutput): TaskServiceMutationResult {
    return { result: "ok", task };
  }

  function validateRelationships(
    workspaceId: string,
    input: {
      organizationId?: string | null | undefined;
      contactId?: string | null | undefined;
      leadId?: string | null | undefined;
      opportunityId?: string | null | undefined;
    }
  ): Exclude<TaskServiceMutationResult, { result: "ok"; task: TaskOutput }> | null {
    if (input.organizationId && organizationIds.get(input.organizationId) !== workspaceId) {
      return { result: "not_found" };
    }

    const contact = input.contactId ? contacts.get(input.contactId) : null;
    if (input.contactId && contact?.workspaceId !== workspaceId) {
      return { result: "not_found" };
    }

    const lead = input.leadId ? leads.get(input.leadId) : null;
    if (input.leadId && lead?.workspaceId !== workspaceId) {
      return { result: "not_found" };
    }

    const opportunity = input.opportunityId ? opportunities.get(input.opportunityId) : null;
    if (input.opportunityId && opportunity?.workspaceId !== workspaceId) {
      return { result: "not_found" };
    }

    if (contact?.organizationId && input.organizationId && contact.organizationId !== input.organizationId) {
      return { result: "invalid_relation" };
    }

    if (lead?.organizationId && input.organizationId && lead.organizationId !== input.organizationId) {
      return { result: "invalid_relation" };
    }

    if (lead?.contactId && input.contactId && lead.contactId !== input.contactId) {
      return { result: "invalid_relation" };
    }

    if (opportunity?.organizationId && input.organizationId && opportunity.organizationId !== input.organizationId) {
      return { result: "invalid_relation" };
    }

    if (opportunity?.contactId && input.contactId && opportunity.contactId !== input.contactId) {
      return { result: "invalid_relation" };
    }

    if (opportunity?.leadId && input.leadId && opportunity.leadId !== input.leadId) {
      return { result: "invalid_relation" };
    }

    return null;
  }

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
      const validationError = validateRelationships(workspaceId, input);

      if (validationError) {
        return validationError;
      }

      const task: TaskOutput = {
        id: createdTaskId,
        workspaceId,
        type: input.type,
        status: "pending",
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
        assignedTo: input.assignedTo ?? null,
        organizationId: input.organizationId ?? null,
        opportunityId: input.opportunityId ?? null,
        leadId: input.leadId ?? null,
        contactId: input.contactId ?? null,
        metadata: input.metadata ?? {},
        createdAt: "2026-04-30T12:00:00.000Z",
        updatedAt: "2026-04-30T12:00:00.000Z"
      };

      tasks.set(task.id, task);

      return mutationOk(task);
    }),

    getTask: vi.fn(async (workspaceId: string, id: string) => {
      const task = tasks.get(id);
      return task?.workspaceId === workspaceId ? task : null;
    }),

    updateTask: vi.fn(async (workspaceId: string, _userId: string, id: string, input: UpdateTaskInput) => {
      const task = tasks.get(id);

      if (!task || task.workspaceId !== workspaceId) {
        return { result: "not_found" } satisfies TaskServiceMutationResult;
      }

      if (
        "organizationId" in input ||
        "contactId" in input ||
        "leadId" in input ||
        "opportunityId" in input
      ) {
        const validationError = validateRelationships(workspaceId, {
          organizationId: "organizationId" in input ? input.organizationId ?? null : task.organizationId,
          contactId: "contactId" in input ? input.contactId ?? null : task.contactId,
          leadId: "leadId" in input ? input.leadId ?? null : task.leadId,
          opportunityId: "opportunityId" in input ? input.opportunityId ?? null : task.opportunityId
        });

        if (validationError) {
          return validationError;
        }
      }

      const updatedTask = applyTaskUpdate(task, input);
      tasks.set(id, updatedTask);

      return mutationOk(updatedTask);
    })
  };
}
