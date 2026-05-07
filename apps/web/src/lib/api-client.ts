import { PushbackStatusSuccessSchema, type PushbackStatusResponse } from "@syrantis/shared";
import { z } from "zod";

const { stringify: encodeJsonBody } = JSON;

const loginSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string().nullable(),
    role: z.enum(["founder", "admin", "operator", "client"])
  })
});

const logoutSuccessSchema = z.object({
  success: z.literal(true)
});

export type CurrentUser = z.infer<typeof loginSuccessSchema>["data"];

export class ApiUnauthorizedError extends Error {
  constructor() {
    super("Authentication is required.");
    this.name = "ApiUnauthorizedError";
  }
}

export class ApiRequestError extends Error {
  constructor(message = "Request failed.") {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function requestJson(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    }
  });

  if (response.status === 401) {
    throw new ApiUnauthorizedError();
  }

  if (!response.ok) {
    throw new ApiRequestError();
  }

  return response.json();
}

export async function login(input: { email: string; password: string }): Promise<CurrentUser> {
  const payload = await requestJson("/auth/login", {
    method: "POST",
    body: encodeJsonBody(input)
  });

  return loginSuccessSchema.parse(payload).data;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const payload = await requestJson("/auth/me");
  return loginSuccessSchema.parse(payload).data;
}

export async function logout(): Promise<void> {
  const payload = await requestJson("/auth/logout", {
    method: "POST"
  });

  logoutSuccessSchema.parse(payload);
}

export async function getEmailSendPushbackStatus(id: string): Promise<PushbackStatusResponse> {
  const payload = await requestJson(`/api/email-sends/${encodeURIComponent(id)}/pushback-status`);
  return PushbackStatusSuccessSchema.parse(payload).data;
}

export async function getDraftPushbackStatus(id: string): Promise<PushbackStatusResponse> {
  const payload = await requestJson(`/api/drafts/${encodeURIComponent(id)}/pushback-status`);
  return PushbackStatusSuccessSchema.parse(payload).data;
}
