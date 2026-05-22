import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderApp } from "./test-utils";

const currentUser = {
  success: true,
  data: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "client@example.com",
    name: "Client Pilot",
    role: "client",
    workspaceId: "forbidden-workspace-id",
  },
};

const firstMailItemId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const noDraftMailItemId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const ignoredMailItemId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const exportRequestedMailItemId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";

const listUrl = "/api/client/inbox/messages?tab=all&sort=newest&limit=20";
const firstDetailUrl = `/api/client/inbox/messages/${firstMailItemId}`;
const noDraftDetailUrl = `/api/client/inbox/messages/${noDraftMailItemId}`;
const ignoredDetailUrl = `/api/client/inbox/messages/${ignoredMailItemId}`;
const exportRequestedDetailUrl = `/api/client/inbox/messages/${exportRequestedMailItemId}`;
const draftUrl = `/api/client/inbox/messages/${firstMailItemId}/draft`;
const exportRequestUrl = `/api/client/inbox/messages/${firstMailItemId}/gmail-export-request`;
const exportCancelUrl = `/api/client/inbox/messages/${exportRequestedMailItemId}/gmail-export-cancel`;

const liveMessages = {
  success: true,
  data: {
    generatedAt: "2026-05-18T10:00:00.000Z",
    pagination: {
      limit: 20,
      offset: 0,
      total: 4,
    },
    items: [
      {
        mailItemId: firstMailItemId,
        classificationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        leadId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
        draftId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
        receivedAt: "2026-05-18T09:30:00.000Z",
        senderDisplay: "Marie Dubois",
        companyDisplay: "Atelier Nord",
        subject: "Legacy full subject must stay hidden",
        snippet: "Legacy full snippet must stay hidden",
        subjectPreview: "Demande chauffage urgente",
        snippetPreview: "Chaudière en panne et demande de créneau rapide.",
        score: 92,
        scoreBand: "hot",
        category: "quote_request",
        intent: "quote_request",
        urgency: "high",
        contactStatus: "new_contact",
        previousThreadCount: 0,
        draftStatus: "ready",
        gmailExportStatus: "not_exported",
        pipelineState: "draft_ready",
        attentionFlags: ["high_score", "urgent_action"],
        needsReview: false,
        bodyText: "forbidden-list-body",
        fromEmail: "forbidden-list-from@example.test",
        toEmail: "forbidden-list-to@example.test",
        workspaceId: "forbidden-list-workspace",
        providerMessageId: "forbidden-provider-message-id",
      },
      {
        mailItemId: noDraftMailItemId,
        classificationId: "dddddddd-dddd-4ddd-8ddd-dddddddddd12",
        leadId: null,
        draftId: null,
        receivedAt: "2026-05-18T09:10:00.000Z",
        senderDisplay: "Jean Martin",
        companyDisplay: "Habitat Sud",
        subject: null,
        snippet: null,
        subjectPreview: "Demande sans brouillon",
        snippetPreview: "Le message est qualifié mais aucun brouillon n'est prêt.",
        score: 41,
        scoreBand: "warm",
        category: "follow_up",
        intent: "follow_up",
        urgency: "medium",
        contactStatus: "existing_contact",
        previousThreadCount: 2,
        draftStatus: "no_draft",
        gmailExportStatus: "none",
        pipelineState: "classified",
        attentionFlags: [],
        needsReview: true,
      },
      {
        mailItemId: ignoredMailItemId,
        classificationId: "dddddddd-dddd-4ddd-8ddd-dddddddddd13",
        leadId: null,
        draftId: null,
        receivedAt: "2026-05-18T08:45:00.000Z",
        senderDisplay: "Newsletter Chauffage",
        companyDisplay: "Info Energie",
        subject: null,
        snippet: null,
        subjectPreview: "Newsletter ignorée",
        snippetPreview: "Contenu informatif sans action commerciale.",
        score: null,
        scoreBand: "unknown",
        category: "newsletter",
        intent: "newsletter",
        urgency: "low",
        contactStatus: "unknown",
        previousThreadCount: 0,
        draftStatus: "no_draft",
        gmailExportStatus: "none",
        pipelineState: "ignored",
        attentionFlags: [],
        needsReview: false,
      },
      {
        mailItemId: exportRequestedMailItemId,
        classificationId: "dddddddd-dddd-4ddd-8ddd-dddddddddd14",
        leadId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc4",
        draftId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4",
        receivedAt: "2026-05-18T08:15:00.000Z",
        senderDisplay: "Claire Bernard",
        companyDisplay: "Maison Est",
        subject: null,
        snippet: null,
        subjectPreview: "Brouillon déjà demandé",
        snippetPreview: "La préparation Gmail est en attente de validation.",
        score: 74,
        scoreBand: "hot",
        category: "urgent_service",
        intent: "urgent_service",
        urgency: "high",
        contactStatus: "returning",
        previousThreadCount: 3,
        draftStatus: "requested",
        gmailExportStatus: "requested",
        pipelineState: "export_requested",
        attentionFlags: ["needs_review"],
        needsReview: false,
      },
    ],
  },
};

const emptyMessages = {
  success: true,
  data: {
    generatedAt: "2026-05-18T10:00:00.000Z",
    pagination: {
      limit: 20,
      offset: 0,
      total: 0,
    },
    items: [],
  },
};

function detailFixture(
  mailItemId: string,
  overrides: Partial<{
    subject: string | null;
    body: string | null;
    fromEmail: string | null;
    toEmail: string | null;
    draftSubject: string | null;
    draftBody: string | null;
    canEditDraft: boolean;
    canRequestGmailExport: boolean;
    canCancelGmailExport: boolean;
    gmailExportStatus: string;
    draftId: string | null;
  }> = {},
) {
  return {
    success: true,
    data: {
      mail: {
        mailItemId,
        subject: overrides.subject ?? "Objet detail chauffage",
        fromDisplay: "Marie Dubois",
        fromEmail: overrides.fromEmail ?? "marie@example.test",
        toDisplay: "Syrantis Pilot",
        toEmail: overrides.toEmail ?? "pilot@example.test",
        receivedAt: "2026-05-18T09:30:00.000Z",
        bodyText: overrides.body ?? "Corps detail visible uniquement dans le panneau detail.",
        snippet: "Snippet detail",
        attachments: [],
      },
      analysis: {
        category: "quote_request",
        action: "create_lead",
        reasonCode: "quote_request",
        intent: "quote_request",
        urgency: "high",
        score: 92,
        scoreBand: "hot",
        confidence: 88,
        recommendedAction: "Préparer une réponse de devis.",
        attentionFlags: ["high_score"],
      },
      contactContext: {
        contactKnown: false,
        contactStatus: "new_contact",
        previousLeadCount: 0,
        previousThreadCount: 0,
        lastInboundAt: "2026-05-18T09:30:00.000Z",
        lastOutboundAt: null,
        lastOutboundStatus: null,
      },
      companyPolicyContext: {
        companyName: "Atelier Nord",
        sector: "Chauffage",
        language: "fr",
        tone: "professionnel",
        keyRulesMatched: ["confirmer le créneau"],
        missingInfo: ["adresse complète"],
        forbiddenClaims: ["prix garanti"],
      },
      draft: {
        draftId:
          overrides.draftId === undefined
            ? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"
            : overrides.draftId,
        subject:
          overrides.draftSubject === undefined ? "Brouillon chauffage" : overrides.draftSubject,
        bodyText:
          overrides.draftBody === undefined
            ? "Bonjour, nous pouvons vous proposer un créneau."
            : overrides.draftBody,
        status: "draft",
        generatedAt: "2026-05-18T09:45:00.000Z",
        editedAt: null,
        source: "ai",
        policyMatchScore: 84,
        canEdit: overrides.canEditDraft ?? true,
        canRewrite: false,
        canExportToGmail: overrides.canRequestGmailExport ?? true,
      },
      gmailExport: {
        status: overrides.gmailExportStatus ?? "not_exported",
        requestedAt: null,
        exportedAt: null,
        blockingReasons: [],
      },
      actions: {
        canEditDraft: overrides.canEditDraft ?? true,
        canRequestGmailExport: overrides.canRequestGmailExport ?? true,
        canCancelGmailExport: overrides.canCancelGmailExport ?? false,
        canRewriteLater: false,
        canSendDirectLater: false,
      },
      workspaceId: "forbidden-detail-workspace",
      rawPayload: "forbidden-raw-detail",
      providerMessageId: "forbidden-detail-provider",
    },
  };
}

const firstDetail = detailFixture(firstMailItemId);
const noDraftDetail = detailFixture(noDraftMailItemId, {
  subject: "Message sans brouillon",
  body: "Corps detail sans brouillon.",
  draftId: null,
  draftSubject: null,
  draftBody: null,
  canEditDraft: false,
  canRequestGmailExport: false,
  canCancelGmailExport: false,
  gmailExportStatus: "none",
});
const ignoredDetail = detailFixture(ignoredMailItemId, {
  subject: "Message ignore",
  body: "Corps detail ignore.",
  draftId: null,
  draftSubject: null,
  draftBody: null,
  canEditDraft: false,
  canRequestGmailExport: false,
  canCancelGmailExport: false,
  gmailExportStatus: "none",
});
const exportRequestedDetail = detailFixture(exportRequestedMailItemId, {
  subject: "Message export demandé",
  body: "Corps detail export demandé.",
  canEditDraft: false,
  canRequestGmailExport: false,
  canCancelGmailExport: true,
  gmailExportStatus: "requested",
});

const draftEditResponse = {
  success: true,
  data: {
    mailItemId: firstMailItemId,
    draftId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    status: "draft",
    updatedAt: "2026-05-18T10:05:00.000Z",
    canExportToGmail: true,
    bodyText: "forbidden-edited-body",
  },
};

const exportRequestResponse = {
  success: true,
  data: {
    draftId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
    leadId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    requestStatus: "requested",
    requestedAt: "2026-05-18T10:10:00.000Z",
    requestExpiresAt: "2026-05-19T10:10:00.000Z",
    canExport: true,
  },
};

const exportCancelResponse = {
  success: true,
  data: {
    draftId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4",
    leadId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc4",
    requestStatus: "cancelled",
    cancelledAt: "2026-05-18T10:12:00.000Z",
  },
};

function mockJson(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function setupLiveFetch() {
  const request = vi.fn((url: string, init?: RequestInit) => {
    if (url === listUrl) {
      return mockJson(liveMessages);
    }

    if (url === firstDetailUrl) {
      return mockJson(firstDetail);
    }

    if (url === noDraftDetailUrl) {
      return mockJson(noDraftDetail);
    }

    if (url === ignoredDetailUrl) {
      return mockJson(ignoredDetail);
    }

    if (url === exportRequestedDetailUrl) {
      return mockJson(exportRequestedDetail);
    }

    if (url === draftUrl && init?.method === "PATCH") {
      return mockJson(draftEditResponse);
    }

    if (url === exportRequestUrl && init?.method === "POST") {
      return mockJson(exportRequestResponse);
    }

    if (url === exportCancelUrl && init?.method === "POST") {
      return mockJson(exportCancelResponse);
    }

    return mockJson(currentUser);
  });

  vi.stubGlobal("fetch", request);
  return request;
}

function callsTo(request: ReturnType<typeof setupLiveFetch>, url: string) {
  return request.mock.calls.filter(([callUrl]) => callUrl === url);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("client inbox live route", () => {
  it("renders /inbox inside ClientShell with one client navigation surface", async () => {
    setupLiveFetch();

    renderApp("/inbox");

    expect(await screen.findByTestId("client-shell-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("client-inbox-work-area")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Boîte de réception" })).toBeInTheDocument();

    const navigationSurfaces = screen.getAllByLabelText("Navigation client");
    expect(navigationSurfaces).toHaveLength(1);
    expect(
      within(screen.getByTestId("client-shell-sidebar"))
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Tableau de bord", "Boîte de réception", "Configuration"]);
  });

  it("does not render the preview sidebar or internal preview chrome on /inbox", async () => {
    setupLiveFetch();

    renderApp("/inbox");
    await screen.findByText("Demande chauffage urgente");

    expect(screen.queryByTestId("client-inbox-preview-shell")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Application client")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sélecteur de compte client")).not.toBeInTheDocument();
    expect(screen.queryByText("syrantis")).not.toBeInTheDocument();
    expect(screen.queryByText("Espace client interne")).not.toBeInTheDocument();
  });

  it("keeps admin, lab, debug, and raw identifiers out of /inbox", async () => {
    setupLiveFetch();

    renderApp("/inbox");
    await screen.findByText("Demande chauffage urgente");

    for (const forbidden of [
      "Ops",
      "API Keys",
      "Google Sheets",
      "Pushback",
      "Mail Queue",
      "Draft Queue",
      "Gmail Export",
      "Client Inbox Lab",
      "Response Policy",
      "Internal validation",
      "Smoke form",
      "Data completeness",
      "raw JSON",
      "workspaceId",
      "providerMessageId",
    ]) {
      expect(document.body.textContent).not.toContain(forbidden);
    }
  });

  it("keeps live list, detail, draft, and Gmail controls working on /inbox", async () => {
    const user = userEvent.setup();
    const request = setupLiveFetch();

    renderApp("/inbox");

    await screen.findByText("Demande chauffage urgente");
    const list = screen.getByLabelText("Messages priorisés");
    expect(within(list).getByText("Demande chauffage urgente")).toBeInTheDocument();
    expect(await screen.findByLabelText("Objet du brouillon")).toHaveValue("Brouillon chauffage");

    await user.click(screen.getByRole("button", { name: "Préparer dans Gmail" }));
    await user.click(screen.getByRole("button", { name: "Confirmer la préparation Gmail" }));
    await waitFor(() => expect(callsTo(request, exportRequestUrl).length).toBe(1));

    await user.click(within(list).getByText("Brouillon déjà demandé"));
    await user.click(await screen.findByRole("button", { name: "Annuler la préparation Gmail" }));
    await waitFor(() => expect(callsTo(request, exportCancelUrl).length).toBe(1));
  });

  it("renders the live route, calls the list endpoint, and keeps list previews safe", async () => {
    const request = setupLiveFetch();

    renderApp("/app/client/inbox");

    expect(await screen.findByRole("heading", { name: "Boîte de réception" })).toBeInTheDocument();
    await waitFor(() => expect(request).toHaveBeenCalledWith(listUrl, expect.anything()));

    const list = screen.getByLabelText("Messages priorisés");
    expect(within(list).getByText("Demande chauffage urgente")).toBeInTheDocument();
    expect(
      within(list).getByText("Chaudière en panne et demande de créneau rapide."),
    ).toBeInTheDocument();
    expect(
      within(list).queryByText("Legacy full subject must stay hidden"),
    ).not.toBeInTheDocument();
    expect(
      within(list).queryByText("Legacy full snippet must stay hidden"),
    ).not.toBeInTheDocument();
    expect(within(list).queryByText("forbidden-list-body")).not.toBeInTheDocument();
    expect(within(list).queryByText("forbidden-list-from@example.test")).not.toBeInTheDocument();
    expect(within(list).queryByText("forbidden-list-to@example.test")).not.toBeInTheDocument();
    expect(within(list).queryByText("null")).not.toBeInTheDocument();

    expect(
      await screen.findByText("Corps detail visible uniquement dans le panneau detail."),
    ).toBeInTheDocument();
    expect(screen.getByText("marie@example.test")).toBeInTheDocument();
    expect(screen.getByText(/pilot@example.test/)).toBeInTheDocument();
  });

  it("selects messages, shows state badges, and keeps unavailable actions hidden", async () => {
    const user = userEvent.setup();
    const request = setupLiveFetch();

    renderApp("/app/client/inbox");

    await screen.findByText("Newsletter ignorée");
    const list = screen.getByLabelText("Messages priorisés");
    expect(within(list).getByText("Newsletter ignorée")).toBeInTheDocument();
    expect(within(list).getAllByText("Aucun brouillon").length).toBeGreaterThan(0);
    expect(within(list).getByText("Préparation Gmail demandée")).toBeInTheDocument();

    await user.click(within(list).getByText("Demande sans brouillon"));
    await waitFor(() => expect(callsTo(request, noDraftDetailUrl).length).toBeGreaterThan(0));
    expect(await screen.findByText("Corps detail sans brouillon.")).toBeInTheDocument();
    expect(screen.getByText("Aucun brouillon disponible pour ce message.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enregistrer le brouillon" }),
    ).not.toBeInTheDocument();

    await user.click(within(list).getByText("Brouillon déjà demandé"));
    await waitFor(() =>
      expect(callsTo(request, exportRequestedDetailUrl).length).toBeGreaterThan(0),
    );
    expect(await screen.findByText("Corps detail export demandé.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Préparer dans Gmail" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Annuler la préparation Gmail" }),
    ).toBeInTheDocument();
  });

  it("edits a draft through PATCH and refetches list and detail", async () => {
    const user = userEvent.setup();
    const request = setupLiveFetch();

    renderApp("/app/client/inbox");

    const subjectInput = await screen.findByLabelText("Objet du brouillon");
    const bodyInput = screen.getByLabelText("Corps du brouillon");

    await user.clear(subjectInput);
    await user.type(subjectInput, "Objet mis à jour");
    await user.clear(bodyInput);
    await user.type(bodyInput, "Corps mis à jour sans stockage local.");
    await user.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));

    await waitFor(() => expect(callsTo(request, draftUrl).length).toBe(1));
    const patchCall = callsTo(request, draftUrl)[0];
    expect(patchCall?.[1]?.method).toBe("PATCH");
    expect(patchCall?.[1]?.body).toContain("Objet mis à jour");
    expect(patchCall?.[1]?.body).toContain("Corps mis à jour sans stockage local.");
    expect(await screen.findByText("Brouillon enregistré.")).toBeInTheDocument();
    await waitFor(() => expect(callsTo(request, listUrl).length).toBeGreaterThan(1));
    await waitFor(() => expect(callsTo(request, firstDetailUrl).length).toBeGreaterThan(1));
    expect(screen.queryByText("forbidden-edited-body")).not.toBeInTheDocument();
  });

  it("disables draft save while saving and renders mutation errors", async () => {
    const user = userEvent.setup();
    const patchResolver: { current: ((response: Response) => void) | null } = { current: null };
    const request = vi.fn((url: string, init?: RequestInit) => {
      if (url === listUrl) {
        return mockJson(liveMessages);
      }

      if (url === firstDetailUrl) {
        return mockJson(firstDetail);
      }

      if (url === draftUrl && init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          patchResolver.current = resolve;
        });
      }

      return mockJson(currentUser);
    });
    vi.stubGlobal("fetch", request);

    renderApp("/app/client/inbox");

    await user.click(await screen.findByRole("button", { name: "Enregistrer le brouillon" }));
    expect(await screen.findByRole("button", { name: "Enregistrement..." })).toBeDisabled();
   expect(patchResolver.current).not.toBeNull();

if (!patchResolver.current) {
  throw new Error("Expected draft PATCH resolver to be captured.");
}

patchResolver.current(
  new Response(JSON.stringify({ success: false }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  }),
);

    expect(await screen.findByText("Impossible d'enregistrer le brouillon.")).toBeInTheDocument();
  });

  it("confirms Gmail export request before POST and refetches list and detail", async () => {
    const user = userEvent.setup();
    const request = setupLiveFetch();

    renderApp("/app/client/inbox");

    await user.click(await screen.findByRole("button", { name: "Préparer dans Gmail" }));
    expect(
      screen.getByText(
        "Le brouillon sera préparé dans Gmail. L’envoi final reste à valider manuellement dans Gmail.",
      ),
    ).toBeInTheDocument();
    expect(callsTo(request, exportRequestUrl)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Confirmer la préparation Gmail" }));
    await waitFor(() => expect(callsTo(request, exportRequestUrl).length).toBe(1));
    expect(await screen.findByText("Préparation Gmail demandée.")).toBeInTheDocument();
    await waitFor(() => expect(callsTo(request, listUrl).length).toBeGreaterThan(1));
    await waitFor(() => expect(callsTo(request, firstDetailUrl).length).toBeGreaterThan(1));
  });

  it("cancels a pending Gmail export request and refetches list and detail", async () => {
    const user = userEvent.setup();
    const request = setupLiveFetch();

    renderApp("/app/client/inbox");

    await screen.findByText("Brouillon déjà demandé");
    const list = screen.getByLabelText("Messages priorisés");
    await user.click(within(list).getByText("Brouillon déjà demandé"));
    await user.click(await screen.findByRole("button", { name: "Annuler la préparation Gmail" }));

    await waitFor(() => expect(callsTo(request, exportCancelUrl).length).toBe(1));
    expect(await screen.findByText("Préparation Gmail annulée.")).toBeInTheDocument();
    await waitFor(() => expect(callsTo(request, listUrl).length).toBeGreaterThan(1));
    await waitFor(() =>
      expect(callsTo(request, exportRequestedDetailUrl).length).toBeGreaterThan(1),
    );
  });

  it("renders loading, empty, list error, and detail error states", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === listUrl) {
          return new Promise<Response>(() => undefined);
        }

        return mockJson(currentUser);
      }),
    );
    const { unmount } = renderApp("/app/client/inbox");
    expect(await screen.findByText("Chargement des messages...")).toBeInTheDocument();
    unmount();
    vi.restoreAllMocks();

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => (url === listUrl ? mockJson(emptyMessages) : mockJson(currentUser))),
    );
    const emptyRender = renderApp("/app/client/inbox");
    expect(await screen.findByText("Aucun message à ouvrir pour ce filtre.")).toBeInTheDocument();
    emptyRender.unmount();
    vi.restoreAllMocks();

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url === listUrl ? mockJson({ success: false }, 500) : mockJson(currentUser),
      ),
    );
    const errorRender = renderApp("/app/client/inbox");
    expect(await screen.findByText("Impossible de charger les messages.")).toBeInTheDocument();
    errorRender.unmount();
    vi.restoreAllMocks();

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === listUrl) {
          return mockJson(liveMessages);
        }

        if (url === firstDetailUrl) {
          return mockJson({ success: false }, 500);
        }

        return mockJson(currentUser);
      }),
    );
    renderApp("/app/client/inbox");
    expect(
      await screen.findByText("Impossible de charger le message sélectionné."),
    ).toBeInTheDocument();
  });

  it("does not render admin/debug labels, raw panels, or send-style controls", async () => {
    setupLiveFetch();

    renderApp("/app/client/inbox");
    await screen.findByText("Demande chauffage urgente");

    for (const forbidden of [
      "Ops",
      "API Keys",
      "Google Sheets",
      "Pushback",
      "Lab",
      "Validation interne",
      "Smoke form",
      "Data completeness",
      "missingForFinalUI",
      "hasBodyText",
      "workspaceId",
      "providerMessageId",
      "raw JSON",
      "debug",
      "Tableau de bord",
      "Configuration",
    ]) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument();
    }

    for (const forbiddenButton of [
      "Send",
      "Reply",
      "Forward",
      "Composer",
      "Archive",
      "Delete",
      "Spam",
    ]) {
      expect(screen.queryByRole("button", { name: forbiddenButton })).not.toBeInTheDocument();
    }

    expect(document.body.textContent).not.toContain("forbidden-list-workspace");
    expect(document.body.textContent).not.toContain("forbidden-provider-message-id");
    expect(document.body.textContent).not.toContain("forbidden-raw-detail");
    expect(document.body.textContent).not.toContain("{");
  });
});
