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

const pushbackStatusResponseSchema = z.object({
  target: z.object({
    type: z.enum(["draft", "email_send"]),
    draftId: z.string().uuid().nullable(),
    emailSendId: z.string().uuid().nullable(),
    resolvedFromDraft: z.boolean()
  }),
  send: z.object({
    exists: z.boolean(),
    status: z.string().nullable(),
    deliveryStatus: z.string().nullable(),
    deliveryProofAvailable: z.boolean(),
    requestedAt: z.string().nullable(),
    sentAt: z.string().nullable(),
    updatedAt: z.string().nullable()
  }),
  pushback: z.object({
    status: z.string(),
    latestEventType: z.string().nullable(),
    latestSource: z.string().nullable(),
    latestAt: z.string().nullable(),
    canReplay: z.boolean(),
    canReplayReason: z.string().nullable(),
    replay: z.object({
      emailSendId: z.string().uuid().nullable(),
      endpoint: z.string().nullable()
    }),
    diagnostic: z
      .object({
        diagnosticTraceId: z.string().uuid().nullable(),
        errorCode: z.string().nullable(),
        errorSummary: z.string().nullable()
      })
      .nullable(),
    counts: z.object({
      totalPushbackEvents: z.number().int().min(0),
      manualReplayEvents: z.number().int().min(0)
    }),
    recentHistory: z.array(
      z.object({
        eventType: z.string(),
        source: z.string(),
        occurredAt: z.string(),
        diagnosticTraceId: z.string().uuid().nullable(),
        errorCode: z.string().nullable()
      }),
    )
  })
});

const pushbackStatusSuccessSchema = z.object({
  success: z.literal(true),
  data: pushbackStatusResponseSchema
});

const emailSendPushbackReplaySuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    emailSendId: z.string().uuid(),
    result: z.enum(["succeeded", "failed", "skipped"]),
    diagnosticTraceId: z.string().uuid()
  })
});

export type CurrentUser = z.infer<typeof loginSuccessSchema>["data"];
export type PushbackStatusResponse = z.infer<typeof pushbackStatusResponseSchema>;
export type EmailSendPushbackReplayResponse = z.infer<
  typeof emailSendPushbackReplaySuccessSchema
>["data"];

export class ApiUnauthorizedError extends Error {
  constructor() {
    super("Authentication is required.");
    this.name = "ApiUnauthorizedError";
  }
}

export class ApiRequestError extends Error {
  readonly status: number | null;

  constructor(message = "Request failed.", status: number | null = null) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
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
    throw new ApiRequestError("Request failed.", response.status);
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
  return pushbackStatusSuccessSchema.parse(payload).data;
}

export async function getDraftPushbackStatus(id: string): Promise<PushbackStatusResponse> {
  const payload = await requestJson(`/api/drafts/${encodeURIComponent(id)}/pushback-status`);
  return pushbackStatusSuccessSchema.parse(payload).data;
}

export async function replayEmailSendPushback(id: string): Promise<EmailSendPushbackReplayResponse> {
  const payload = await requestJson(`/api/email-sends/${encodeURIComponent(id)}/pushback-replay`, {
    method: "POST"
  });

  return emailSendPushbackReplaySuccessSchema.parse(payload).data;
}
