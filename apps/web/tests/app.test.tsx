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
    },
    workspaceId: "hidden-workspace-id",
    workspace_id: "hidden_workspace_id"
  }
};

const emailSendId = "33333333-3333-4333-8333-333333333333";
const replayUrl = `/api/email-sends/${emailSendId}/pushback-replay`;
const statusUrl = `/api/email-sends/${emailSendId}/pushback-status`;

const replayResponse = {
  success: true,
  data: {
    emailSendId,
    result: "succeeded",
    diagnosticTraceId: "66666666-6666-4666-8666-666666666666",
    providerMessageId: "forbidden-replay-provider",
    workspaceId: "forbidden-replay-workspace"
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

function pushbackStatusFixture(canReplay = true) {
  const clone = JSON.parse(JSON.stringify(pushbackStatus)) as {
    data: {
      pushback: {
        canReplay: boolean;
        canReplayReason: string | null;
        replay: {
          emailSendId: string | null;
          endpoint: string | null;
        };
        counts: {
          manualReplayEvents: number;
        };
      };
    };
  };
  clone.data.pushback.canReplay = canReplay;
  clone.data.pushback.canReplayReason = canReplay ? null : "send_not_terminal";
  clone.data.pushback.replay.emailSendId = canReplay ? emailSendId : null;
  clone.data.pushback.replay.endpoint = canReplay ? replayUrl : null;
  return clone;
}

async function lookupEmailSendStatus(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("UUID"), emailSendId);
  await user.click(screen.getByRole("button", { name: "Look up status" }));
  await screen.findByLabelText("Result");
}

function replayPostCalls(request: ReturnType<typeof vi.fn>) {
  return request.mock.calls.filter(([url, init]) => url === replayUrl && init?.method === "POST");
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
      if (url === statusUrl) {
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
        statusUrl,
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
    expect(screen.queryByText("hidden-workspace-id")).not.toBeInTheDocument();
    expect(screen.queryByText("hidden_workspace_id")).not.toBeInTheDocument();
    expect(screen.queryByText("sheet...1234")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden!A:Q")).not.toBeInTheDocument();
  });

  it("does not render the replay button when canReplay is false", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => (url === statusUrl ? mockJson(pushbackStatusFixture(false)) : mockJson(currentUser))),
    );

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);

    expect(screen.queryByRole("button", { name: "Replay pushback" })).not.toBeInTheDocument();
    expect(screen.getByText("Replay unavailable for this status.")).toBeInTheDocument();
  });

  it("renders the replay button when canReplay is true", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => (url === statusUrl ? mockJson(pushbackStatusFixture(true)) : mockJson(currentUser))),
    );

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);

    expect(screen.getByRole("button", { name: "Replay pushback" })).toBeInTheDocument();
  });

  it("requires confirmation before replay POST", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => (url === statusUrl ? mockJson(pushbackStatus) : mockJson(currentUser)));
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);
    await user.click(screen.getByRole("button", { name: "Replay pushback" }));

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Replay Google Sheets pushback for this email send?",
    );
    expect(screen.getByText("This will not resend the email.")).toBeInTheDocument();
    expect(replayPostCalls(request)).toHaveLength(0);
  });

  it("does not call replay POST when confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => (url === statusUrl ? mockJson(pushbackStatus) : mockJson(currentUser)));
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);
    await user.click(screen.getByRole("button", { name: "Replay pushback" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(replayPostCalls(request)).toHaveLength(0);
  });

  it("confirms replay with emailSendId only and no workspaceId", async () => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === statusUrl) {
        return mockJson(pushbackStatus);
      }

      if (url === replayUrl) {
        return mockJson(replayResponse);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);
    await user.click(screen.getByRole("button", { name: "Replay pushback" }));
    await user.click(screen.getByRole("button", { name: "Confirm replay" }));

    await screen.findByText(/Replay result:/);
    const postCalls = replayPostCalls(request);
    expect(postCalls).toHaveLength(1);
    const [, init] = postCalls[0] ?? [];
    expect(init).toEqual(expect.objectContaining({ credentials: "include", method: "POST" }));
    expect(init).not.toHaveProperty("body");
    expect(JSON.stringify(init)).not.toContain("workspaceId");
    expect(JSON.stringify(init)).not.toContain("workspace_id");
    expect(JSON.stringify(init)).not.toContain("Authorization");
    expect(JSON.stringify(init)).not.toContain("Bearer");
  });

  it("locks replay UI during POST and prevents rapid double confirm", async () => {
    const user = userEvent.setup();
    let resolveReplay: (response: Response) => void = () => undefined;
    const replayPromise = new Promise<Response>((resolve) => {
      resolveReplay = resolve;
    });
    const request = vi.fn((url: string) => {
      if (url === statusUrl) {
        return mockJson(pushbackStatus);
      }

      if (url === replayUrl) {
        return replayPromise;
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);
    await user.click(screen.getByRole("button", { name: "Replay pushback" }));
    await user.dblClick(screen.getByRole("button", { name: "Confirm replay" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Replaying..." })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(replayPostCalls(request)).toHaveLength(1);

    resolveReplay(
      new Response(JSON.stringify(replayResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }),
    );
    expect(await screen.findByText(/Replay result:/)).toBeInTheDocument();
  });

  it("displays replay success and refetches pushback status", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    const refreshedStatus = pushbackStatusFixture(true);
    refreshedStatus.data.pushback.counts.manualReplayEvents = 2;
    const request = vi.fn((url: string) => {
      if (url === statusUrl) {
        statusCalls += 1;
        return mockJson(statusCalls === 1 ? pushbackStatus : refreshedStatus);
      }

      if (url === replayUrl) {
        return mockJson(replayResponse);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);
    await user.click(screen.getByRole("button", { name: "Replay pushback" }));
    await user.click(screen.getByRole("button", { name: "Confirm replay" }));

    expect(await screen.findByText(/Replay result:/)).toBeInTheDocument();
    expect(screen.getAllByText("succeeded").length).toBeGreaterThan(0);
    expect(screen.getByText("66666666-6666-4666-8666-666666666666")).toBeInTheDocument();
    await waitFor(() => expect(statusCalls).toBe(2));
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.queryByText("forbidden-replay-provider")).not.toBeInTheDocument();
    expect(screen.queryByText("forbidden-replay-workspace")).not.toBeInTheDocument();
  });

  it("preserves replay success when status refresh fails", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    const request = vi.fn((url: string) => {
      if (url === statusUrl) {
        statusCalls += 1;
        return statusCalls === 1 ? mockJson(pushbackStatus) : mockJson({ success: false }, 500);
      }

      if (url === replayUrl) {
        return mockJson(replayResponse);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);
    await user.click(screen.getByRole("button", { name: "Replay pushback" }));
    await user.click(screen.getByRole("button", { name: "Confirm replay" }));

    expect(await screen.findByText(/Replay result:/)).toBeInTheDocument();
    expect(screen.getByText("66666666-6666-4666-8666-666666666666")).toBeInTheDocument();
    expect(await screen.findByText("Replay completed, but status refresh failed.")).toBeInTheDocument();
  });

  it.each([
    [401, "Replay failed (401)."],
    [403, "Replay failed (403)."],
    [404, "Replay failed (404)."],
    [500, "Replay failed (500)."]
  ])("shows safe replay handling for %s responses", async (status, message) => {
    const user = userEvent.setup();
    const request = vi.fn((url: string) => {
      if (url === statusUrl) {
        return mockJson(pushbackStatus);
      }

      if (url === replayUrl) {
        return mockJson({ success: false, rawProvider: "do-not-render" }, status);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);
    await user.click(screen.getByRole("button", { name: "Replay pushback" }));
    await user.click(screen.getByRole("button", { name: "Confirm replay" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText("do-not-render")).not.toBeInTheDocument();
  });

  it("refetches status when backend refuses replay after canReplay was true", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    const refusedStatus = pushbackStatusFixture(false);
    const request = vi.fn((url: string) => {
      if (url === statusUrl) {
        statusCalls += 1;
        return mockJson(statusCalls === 1 ? pushbackStatusFixture(true) : refusedStatus);
      }

      if (url === replayUrl) {
        return mockJson({ success: false, errorCode: "PUSHBACK_NOT_REPLAYABLE" }, 409);
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/pushback");
    await lookupEmailSendStatus(user);
    await user.click(screen.getByRole("button", { name: "Replay pushback" }));
    await user.click(screen.getByRole("button", { name: "Confirm replay" }));

    expect(await screen.findByText("Replay failed (409).")).toBeInTheDocument();
    await waitFor(() => expect(statusCalls).toBe(2));
    expect(screen.queryByRole("button", { name: "Replay pushback" })).not.toBeInTheDocument();
    expect(screen.getByText("Replay unavailable for this status.")).toBeInTheDocument();
  });
});
