import { afterEach, describe, expect, it, vi } from "vitest";

import { getCurrentUser, getDraftPushbackStatus, getEmailSendPushbackStatus, login } from "../src/lib/api-client";

const userResponse = {
  success: true,
  data: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    workspaceName: "Hidden tenant"
  }
};

const pushbackResponse = {
  success: true,
  data: {
    target: {
      type: "email_send",
      draftId: null,
      emailSendId: "33333333-3333-4333-8333-333333333333",
      resolvedFromDraft: false
    },
    send: {
      exists: true,
      status: "sent",
      deliveryStatus: "delivered",
      deliveryProofAvailable: true,
      requestedAt: null,
      sentAt: null,
      updatedAt: null
    },
    pushback: {
      status: "succeeded",
      latestEventType: "crm_pushback.succeeded",
      latestSource: "system",
      latestAt: null,
      canReplay: true,
      canReplayReason: null,
      replay: {
        emailSendId: "33333333-3333-4333-8333-333333333333",
        endpoint: "/api/email-sends/33333333-3333-4333-8333-333333333333/pushback-replay"
      },
      diagnostic: null,
      counts: {
        totalPushbackEvents: 1,
        manualReplayEvents: 0
      },
      recentHistory: []
    }
  }
};

function mockResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" }
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api client", () => {
  it("uses credentials include for login", async () => {
    const request = vi.fn(() => mockResponse(userResponse));
    vi.stubGlobal("fetch", request);

    await login({ email: "admin@example.com", password: "password123" });

    expect(request).toHaveBeenCalledWith(
      "/auth/login",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
  });

  it("strips unknown auth fields from the current user", async () => {
    vi.stubGlobal("fetch", vi.fn(() => mockResponse(userResponse)));

    await expect(getCurrentUser()).resolves.toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      email: "admin@example.com",
      name: "Admin",
      role: "admin"
    });
  });

  it("calls the email send pushback status endpoint", async () => {
    const request = vi.fn(() => mockResponse(pushbackResponse));
    vi.stubGlobal("fetch", request);

    await getEmailSendPushbackStatus("33333333-3333-4333-8333-333333333333");

    expect(request).toHaveBeenCalledWith(
      "/api/email-sends/33333333-3333-4333-8333-333333333333/pushback-status",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("calls the draft pushback status endpoint", async () => {
    const request = vi.fn(() => mockResponse(pushbackResponse));
    vi.stubGlobal("fetch", request);

    await getDraftPushbackStatus("44444444-4444-4444-8444-444444444444");

    expect(request).toHaveBeenCalledWith(
      "/api/drafts/44444444-4444-4444-8444-444444444444/pushback-status",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
