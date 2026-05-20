import { and, desc, eq } from "drizzle-orm";

import { users } from "@syrantis/db";

import { withWorkspaceDb } from "../lib/db.js";

export type ClientUserRow = Pick<
  typeof users.$inferSelect,
  "id" | "email" | "name" | "role" | "status" | "createdAt" | "updatedAt"
>;

export type ClientUserMutationResult =
  | { result: "ok"; user: ClientUserRow }
  | { result: "conflict" };

export type CreateClientUserInput = {
  workspaceId: string;
  email: string;
  displayName: string | null;
  passwordHash: string;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export async function listClientUsers(workspaceId: string): Promise<ClientUserRow[]> {
  return withWorkspaceDb(workspaceId, async (tx) => {
    return tx
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(and(eq(users.workspaceId, workspaceId), eq(users.role, "client")))
      .orderBy(desc(users.createdAt));
  });
}

export async function createClientUser(
  input: CreateClientUserInput,
): Promise<ClientUserMutationResult> {
  try {
    return await withWorkspaceDb(input.workspaceId, async (tx) => {
      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (existingUser) {
        return { result: "conflict" };
      }

      const [user] = await tx
        .insert(users)
        .values({
          workspaceId: input.workspaceId,
          email: input.email,
          name: input.displayName,
          passwordHash: input.passwordHash,
          role: "client",
          status: "active",
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      if (!user) {
        throw new Error("Failed to create client user.");
      }

      return { result: "ok", user };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { result: "conflict" };
    }

    throw error;
  }
}
