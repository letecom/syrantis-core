import {
  ContactOutputSchema,
  type ContactListQuery,
  type ContactOutput,
  type CreateContactInput,
  type UpdateContactInput
} from "@syrantis/shared";

import type { ContactListResult, ContactMutationResult, ContactRow } from "../repositories/contacts.js";
import {
  createContact,
  findContactById,
  listContacts,
  updateContact
} from "../repositories/contacts.js";

export type ContactServiceListResult =
  | { result: "ok"; contacts: ContactOutput[] }
  | { result: "not_found" };

export type ContactServiceMutationResult =
  | { result: "ok"; contact: ContactOutput }
  | { result: "not_found" };

export type ContactService = {
  listContacts(workspaceId: string, query: ContactListQuery): Promise<ContactServiceListResult>;
  getContact(workspaceId: string, id: string): Promise<ContactOutput | null>;
  createContact(
    workspaceId: string,
    actorUserId: string,
    input: CreateContactInput
  ): Promise<ContactServiceMutationResult>;
  updateContact(
    workspaceId: string,
    actorUserId: string,
    id: string,
    input: UpdateContactInput
  ): Promise<ContactServiceMutationResult>;
};

function mapContactRow(row: ContactRow): ContactOutput {
  return ContactOutputSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    organizationId: row.organizationId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    roleTitle: row.roleTitle,
    optOut: row.optOut,
    metadata: row.metadataJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
}

function mapListResult(result: ContactListResult): ContactServiceListResult {
  if (result.result !== "ok") {
    return result;
  }

  return {
    result: "ok",
    contacts: result.contacts.map(mapContactRow)
  };
}

function mapMutationResult(result: ContactMutationResult): ContactServiceMutationResult {
  if (result.result !== "ok") {
    return result;
  }

  return {
    result: "ok",
    contact: mapContactRow(result.contact)
  };
}

export function createProductionContactService(): ContactService {
  return {
    async listContacts(workspaceId: string, query: ContactListQuery): Promise<ContactServiceListResult> {
      return mapListResult(
        await listContacts({
          workspaceId,
          ...(query.organizationId !== undefined ? { organizationId: query.organizationId } : {}),
          limit: query.limit,
          offset: query.offset
        })
      );
    },

    async getContact(workspaceId: string, id: string): Promise<ContactOutput | null> {
      const row = await findContactById({ workspaceId, id });
      return row ? mapContactRow(row) : null;
    },

    async createContact(
      workspaceId: string,
      actorUserId: string,
      input: CreateContactInput
    ): Promise<ContactServiceMutationResult> {
      return mapMutationResult(
        await createContact({
          workspaceId,
          actorUserId,
          data: input
        })
      );
    },

    async updateContact(
      workspaceId: string,
      actorUserId: string,
      id: string,
      input: UpdateContactInput
    ): Promise<ContactServiceMutationResult> {
      return mapMutationResult(
        await updateContact({
          workspaceId,
          actorUserId,
          id,
          data: input
        })
      );
    }
  };
}
