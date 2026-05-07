import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "./test-utils";

const currentUser = {
  success: true,
  data: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "admin@example.com",
    name: "Admin User",
    role: "admin",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    workspaceName: "Hidden tenant"
  }
};

const pushbackStatus = {
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
      requestedAt: "2026-05-06T10:00:00.000Z",
      sentAt: "2026-05-06T10:01:00.000Z",
      updatedAt: "2026-05-06T10:02:00.000Z"
    },
    pushback: {
      status: "succeeded",
      latestEventType: "crm_pushback.succeeded",
      latestSource: "manual_replay",
      latestAt: "2026-05-06T10:03:00.000Z",
      canReplay: true,
      canReplayReason: null,
      replay: {
        emailSendId: "33333333-3333-4333-8333-333333333333",
        endpoint: "/api/email-sends/33333333-3333-4333-8333-333333333333/pushback-replay"
      },
      diagnostic: {
        diagnosticTraceId: "55555555-5555-4555-8555-555555555555",
        errorCode: "PUSHBACK_RATE_LIMITED",
        errorSummary: "Pushback was rate limited.",
        durationMs: 42,
        maskedSpreadsheetId: "sheet...1234",
        range: "Hidden!A:Q"
      },
      counts: {
        totalPushbackEvents: 2,
        manualReplayEvents: 1
      },
      recentHistory: [
        {
          eventType: "crm_pushback.succeeded",
          source: "manual_replay",
          occurredAt: "2026-05-06T10:03:00.000Z",
          diagnosticTraceId: "55555555-5555-4555-8555-555555555555",
          errorCode: null
        }
      ],
      provider_message_id: "forbidden-provider",
      providerMessageId: "forbidden-provider-camel",
      metadata_json: { hidden: true },
      payload_json: { hidden: true },
      rawGoogle: "forbidden-google",
      rawProvider: "forbidden-provider-payload",
      rawError: "forbidden-provider-error",
      subject: "forbidden-subject",
      htmlBody: "forbidden-html",
      textBody: "forbidden-text",
      contactEmail: "hidden@example.com",
      leadLabel: "forbidden-lead-label",
      recipient: "hidden-recipient@example.com"
    }
  }
};

function mockJson(body: unknown, status = 200) {
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

describe("admin app", () => {
  it("renders the login form", () => {
    vi.stubGlobal("fetch", vi.fn(() => mockJson({ success: false }, 401)));

    renderApp("/login");

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("validates the login form", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(() => mockJson({ success: false }, 401)));

    renderApp("/login");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();
  });

  it("calls the login endpoint and redirects after success", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === "/auth/login") {
        return mockJson(currentUser);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/login");
    await user.type(screen.getByLabelText("Email"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith(
        "/auth/login",
        expect.objectContaining({ credentials: "include", method: "POST" }),
      );
    });
    expect(await screen.findByRole("heading", { name: "Admin dashboard" })).toBeInTheDocument();
  });

  it("shows a generic invalid credentials message", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(() => mockJson({ success: false }, 401)));

    renderApp("/login");
    await user.type(screen.getByLabelText("Email"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
  });

  it("redirects protected routes for unauthenticated users", async () => {
    vi.stubGlobal("fetch", vi.fn(() => mockJson({ success: false }, 401)));

    renderApp("/app");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("renders the protected shell for authenticated users", async () => {
    vi.stubGlobal("fetch", vi.fn(() => mockJson(currentUser)));

    renderApp("/app");

    expect(await screen.findByText("Syrantis Admin")).toBeInTheDocument();
    expect(screen.getByText("Admin User")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pushback" })).toBeInTheDocument();
  });

  it("logs out through the backend and redirects", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === "/auth/logout") {
        return mockJson({ success: true });
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app");
    await user.click(await screen.findByRole("button", { name: "Logout" }));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith(
        "/auth/logout",
        expect.objectContaining({ credentials: "include", method: "POST" }),
      );
    });
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("validates pushback UUID input", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(() => mockJson(currentUser)));

    renderApp("/app/pushback");
    await user.type(await screen.findByLabelText("UUID"), "not-a-uuid");
    await user.click(screen.getByRole("button", { name: "Look up status" }));

    expect(await screen.findByText("Enter a valid UUID.")).toBeInTheDocument();
  });

  it("looks up pushback status by email send ID", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === "/api/email-sends/33333333-3333-4333-8333-333333333333/pushback-status") {
        return mockJson(pushbackStatus);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await user.type(await screen.findByLabelText("UUID"), "33333333-3333-4333-8333-333333333333");
    await user.click(screen.getByRole("button", { name: "Look up status" }));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith(
        "/api/email-sends/33333333-3333-4333-8333-333333333333/pushback-status",
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  it("looks up pushback status by draft ID", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === "/api/drafts/44444444-4444-4444-8444-444444444444/pushback-status") {
        return mockJson({
          ...pushbackStatus,
          data: {
            ...pushbackStatus.data,
            target: {
              type: "draft",
              draftId: "44444444-4444-4444-8444-444444444444",
              emailSendId: "33333333-3333-4333-8333-333333333333",
              resolvedFromDraft: true
            }
          }
        });
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await user.click(await screen.findByLabelText("Draft ID"));
    await user.type(screen.getByLabelText("UUID"), "44444444-4444-4444-8444-444444444444");
    await user.click(screen.getByRole("button", { name: "Look up status" }));

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith(
        "/api/drafts/44444444-4444-4444-8444-444444444444/pushback-status",
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  it("renders safe pushback status fields only", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url === "/api/email-sends/33333333-3333-4333-8333-333333333333/pushback-status"
          ? mockJson(pushbackStatus)
          : mockJson(currentUser),
      ),
    );

    renderApp("/app/pushback");
    await user.type(await screen.findByLabelText("UUID"), "33333333-3333-4333-8333-333333333333");
    await user.click(screen.getByRole("button", { name: "Look up status" }));

    const result = await screen.findByLabelText("Result");
    expect(within(result).getByText("succeeded")).toBeInTheDocument();
    expect(within(result).getByText("manual_replay")).toBeInTheDocument();
    expect(within(result).getByText("PUSHBACK_RATE_LIMITED")).toBeInTheDocument();
    expect(within(result).getByText("Pushback was rate limited.")).toBeInTheDocument();
    expect(within(result).getByText("2")).toBeInTheDocument();
    expect(within(result).getByText("1")).toBeInTheDocument();

    expect(screen.queryByText("forbidden-provider")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-provider-camel")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-google")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-provider-payload")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-provider-error")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-subject")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-html")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-text")).not.toBeInTheDocument();
    expect(screen.queryByText("hidden@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-lead-label")).not.toBeInTheDocument();
    expect(screen.queryByText("hidden-recipient@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("sheet...1234")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden!A:Q")).not.toBeInTheDocument();
  });
});
