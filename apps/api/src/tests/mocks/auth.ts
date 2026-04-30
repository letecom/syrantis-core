import { vi } from "vitest";

import type { AuthMe } from "@syrantis/shared";

import type { AuthService } from "../../services/auth.js";

export const validSessionToken = "test-session-token";

export const testUser: AuthMe = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "founder@syrantis.test",
  name: "Founder",
  role: "admin",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  workspaceName: "Syrantis Internal"
};

export function createFakeAuthService(): AuthService {
  return {
    login: vi.fn(async (email: string, password: string) => {
      if (email.trim().toLowerCase() !== testUser.email || password !== "valid-password") {
        return null;
      }

      return {
        user: testUser,
        token: validSessionToken
      };
    }),
    getCurrentUser: vi.fn(async (token: string) => (token === validSessionToken ? testUser : null)),
    logout: vi.fn(async () => undefined)
  };
}
