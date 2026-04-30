import type { Context } from "hono";

import type { AuthMe } from "@syrantis/shared";

export type AppVariables = {
  currentUser: AuthMe;
  userId: string;
  workspaceId: string;
};

export type AppEnv = {
  Variables: AppVariables;
};

export type AppContext = Context<AppEnv>;
