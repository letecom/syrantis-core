import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmptyState, ErrorState, LoadingState } from "../src/features/client-inbox";
import { renderApp } from "./test-utils";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("client inbox shared preview", () => {
  it("renders the preview route through shared UI components", () => {
    renderApp("/app/client-inbox-preview");

    expect(screen.getByTestId("client-inbox-preview-shell")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Boîte de réception" })).toBeInTheDocument();
    expect(screen.getByText("Analyse Syrantis")).toBeInTheDocument();
    expect(screen.getByText("Contexte contact")).toBeInTheDocument();
    expect(screen.getByText("Configuration utilisée")).toBeInTheDocument();
    expect(screen.getByText("Brouillon IA")).toBeInTheDocument();
  });

  it("keeps the preview route mock-only without live API calls", () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);

    renderApp("/app/client-inbox-preview");

    expect(screen.getByTestId("client-inbox-preview-shell")).toBeInTheDocument();
    expect(screen.getByLabelText("Application client")).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it("shows subjectPreview and snippetPreview copy in the message list", () => {
    renderApp("/app/client-inbox-preview");

    const list = screen.getByLabelText("Messages priorisés");
    expect(within(list).getByText("Demande de devis - Isolation garage")).toBeInTheDocument();
    expect(
      within(list).getByText("Garage de 35 m2 à isoler avant fin juin, avec options souhaitées."),
    ).toBeInTheDocument();
  });

  it("keeps full body and email fields out of the list while detail can display them", () => {
    renderApp("/app/client-inbox-preview");

    const list = screen.getByLabelText("Messages priorisés");
    expect(
      within(list).queryByText(/Nous souhaitons isoler notre garage qui sert aussi d'atelier/),
    ).not.toBeInTheDocument();
    expect(within(list).queryByText("pierre.belanger@example.com")).not.toBeInTheDocument();
    expect(within(list).queryByText("contact@lumiereservices.fr")).not.toBeInTheDocument();

    const detail = screen.getByLabelText("Message ouvert");
    expect(
      within(detail).getByText(/Nous souhaitons isoler notre garage qui sert aussi d'atelier/),
    ).toBeInTheDocument();
    expect(within(detail).getByText("pierre.belanger@example.com")).toBeInTheDocument();
    expect(within(detail).getByText(/contact@lumiereservices.fr/)).toBeInTheDocument();
  });

  it("shows ignored, no-draft, and export-requested states without raw state names", () => {
    renderApp("/app/client-inbox-preview");

    expect(screen.getAllByText("Ignorés").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Aucun brouillon").length).toBeGreaterThan(0);
    expect(screen.getByText("Préparation Gmail demandée")).toBeInTheDocument();
    expect(screen.queryByText("export_requested")).not.toBeInTheDocument();
    expect(screen.queryByText("no_draft")).not.toBeInTheDocument();
  });

  it("does not render admin, lab, operational, or raw JSON language", () => {
    renderApp("/app/client-inbox-preview");

    for (const forbidden of [
      "Ops",
      "API Keys",
      "Google Sheets",
      "Pushback",
      "Lab",
      "Validation interne",
      "Smoke form",
      "Data completeness",
      "workspaceId",
      "providerMessageId",
    ]) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument();
    }

    expect(screen.queryByText(/raw json/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/debug/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("{");
  });

  it("renders empty, loading, and error shared states in isolation", () => {
    const { rerender } = render(<EmptyState />);

    expect(screen.getByText("Aucun message")).toBeInTheDocument();

    rerender(<LoadingState />);
    expect(screen.getByText("Chargement des messages...")).toBeInTheDocument();

    rerender(<ErrorState />);
    expect(screen.getByRole("alert")).toHaveTextContent("À vérifier");
  });
});
