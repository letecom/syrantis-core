import { and, eq, gt } from "drizzle-orm";

import { AuthMeSchema, type AuthMe } from "@syrantis/shared";
import { createDbClient, getGlobalDbClient, sessions, users, workspaces } from "@syrantis/db";

import { createSessionToken, hashSessionToken, SESSION_TTL_MS } from "../lib/session-token.js";
import { verifyPassword } from "../lib/password.js";

export type AuthLoginResult = {
  user: AuthMe;
  token: string;
};

export type AuthService = {
  login(email: string, password: string): Promise<AuthLoginResult | null>;
  getCurrentUser(token: string): Promise<AuthMe | null>;
  logout(token: string): Promise<void>;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toAuthMe(row: {
  user: {
    id: string;
    workspaceId: string;
    email: string;
    name: string | null;
    role: string;
  };
  workspace: {
    name: string;
  };
}): AuthMe {
  return AuthMeSchema.parse({
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    role: row.user.role,
    workspaceId: row.user.workspaceId,
    workspaceName: row.workspace.name
  });
}

export function createProductionAuthService(): AuthService {
  return {
    async login(email: string, password: string): Promise<AuthLoginResult | null> {
      const normalizedEmail = normalizeEmail(email);
      const { db } = getGlobalDbClient();

      const [row] = await db
        .select({
          user: {
            id: users.id,
            workspaceId: users.workspaceId,
            email: users.email,
            name: users.name,
            role: users.role,
            passwordHash: users.passwordHash,
            status: users.status
          },
          workspace: {
            name: workspaces.name
          }
        })
        .from(users)
        .innerJoin(workspaces, eq(users.workspaceId, workspaces.id))
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (!row || row.user.status !== "active" || !row.user.passwordHash) {
        return null;
      }

      const passwordMatches = await verifyPassword(password, row.user.passwordHash);

      if (!passwordMatches) {
        return null;
      }

      const token = createSessionToken();
      const tokenHash = hashSessionToken(token);
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

      await db.insert(sessions).values({
        workspaceId: row.user.workspaceId,
        userId: row.user.id,
        tokenHash,
        status: "active",
        expiresAt
      });

      return {
        user: toAuthMe(row),
        token
      };
    },

    async getCurrentUser(token: string): Promise<AuthMe | null> {
      const tokenHash = hashSessionToken(token);
      const { db } = getGlobalDbClient();

      const [row] = await db
        .select({
          user: {
            id: users.id,
            workspaceId: users.workspaceId,
            email: users.email,
            name: users.name,
            role: users.role,
            status: users.status
          },
          workspace: {
            name: workspaces.name
          }
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .innerJoin(workspaces, eq(users.workspaceId, workspaces.id))
        .where(and(eq(sessions.tokenHash, tokenHash), eq(sessions.status, "active"), gt(sessions.expiresAt, new Date())))
        .limit(1);

      if (!row || row.user.status !== "active") {
        return null;
      }

      return toAuthMe(row);
    },

    async logout(token: string): Promise<void> {
      const tokenHash = hashSessionToken(token);
      const { db } = getGlobalDbClient();

      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    }
  };
}

export async function createFounderUser(input: {
  email: string;
  passwordHash: string;
}): Promise<{ userId: string; workspaceId: string }> {
  const normalizedEmail = normalizeEmail(input.email);
  const { db, close } = createDbClient();

  try {
    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (existingUser) {
      throw new Error("Founder user already exists. Refusing to overwrite password.");
    }

    const [existingWorkspace] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, "syrantis-internal"))
      .limit(1);

    const workspaceId =
      existingWorkspace?.id ??
      (
        await db
          .insert(workspaces)
          .values({
            name: "Syrantis Internal",
            slug: "syrantis-internal",
            status: "active"
          })
          .returning({ id: workspaces.id })
      )[0]?.id;

    if (!workspaceId) {
      throw new Error("Failed to create or reuse founder workspace.");
    }

    const [createdUser] = await db
      .insert(users)
      .values({
        workspaceId,
        email: normalizedEmail,
        passwordHash: input.passwordHash,
        role: "admin",
        status: "active"
      })
      .returning({ id: users.id });

    if (!createdUser) {
      throw new Error("Failed to create founder user.");
    }

    return {
      userId: createdUser.id,
      workspaceId
    };
  } finally {
    await close();
  }
}
