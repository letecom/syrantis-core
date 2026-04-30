import { eq, type AnyColumn, type SQL } from "drizzle-orm";

import type { AuthMe } from "@syrantis/shared";

import type { AppContext } from "../types/hono.js";

type WorkspaceScopedTable = {
  workspaceId: AnyColumn;
};

function internalTenantError(name: string): Error {
  return new Error(`${name} requires tenantGuard to run before the current handler.`);
}

export function getCurrentUser(c: AppContext): AuthMe {
  const currentUser = c.get("currentUser");

  if (!currentUser) {
    throw internalTenantError("getCurrentUser");
  }

  return currentUser;
}

export function getWorkspaceId(c: AppContext): string {
  return requireWorkspaceId(c);
}

export function requireWorkspaceId(c: AppContext): string {
  const workspaceId = c.get("workspaceId");

  if (!workspaceId) {
    throw internalTenantError("requireWorkspaceId");
  }

  return workspaceId;
}

export function tenantWhere<TTable extends WorkspaceScopedTable>(table: TTable, c: AppContext): SQL {
  return eq(table.workspaceId, requireWorkspaceId(c));
}
