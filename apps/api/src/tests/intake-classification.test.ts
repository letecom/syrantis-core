import { describe, expect, it } from "vitest";

import { classifyInboundMessage } from "../services/intake-classifier.service.js";

function classify(overrides: Parameters<typeof classifyInboundMessage>[0]) {
  return classifyInboundMessage({
    fromEmail: "client@example.com",
    subject: "Question",
    bodySnippet: "Bonjour, pouvez-vous me rappeler ?",
    ...overrides,
  });
}

describe("intake classification gate", () => {
  it("ignores newsletter and bulk signals with high confidence", () => {
    expect(
      classify({
        fromEmail: "newsletter@example.com",
        subject: "Newsletter mai",
        bodySnippet: "Cliquez ici pour se desabonner",
      }),
    ).toMatchObject({
      classification: "ignored",
      category: "newsletter",
      action: "ignore",
      confidence: "high",
    });

    expect(classify({ isBulk: true })).toMatchObject({
      classification: "ignored",
      reasonCode: "bulk_flag",
    });
  });

  it("ignores no-reply/system notifications", () => {
    expect(
      classify({
        fromEmail: "no-reply@example.com",
        subject: "Notification",
        bodySnippet: "Ceci est un message automatique, merci de ne pas repondre.",
      }),
    ).toMatchObject({
      classification: "ignored",
      category: "notification",
      action: "ignore",
      confidence: "high",
    });
  });

  it("ignores automated invoice, shipping, job application, and spam noise", () => {
    expect(
      classify({
        fromEmail: "billing@example.com",
        subject: "Invoice receipt",
        bodySnippet: "Automated payment receipt.",
      }),
    ).toMatchObject({ classification: "ignored", category: "invoice" });

    expect(
      classify({
        fromEmail: "notifications@example.com",
        subject: "Commande expediee",
        bodySnippet: "Votre colis est shipped.",
      }),
    ).toMatchObject({ classification: "ignored", category: "notification" });

    expect(
      classify({
        fromEmail: "candidate@example.com",
        subject: "Candidature stage",
        bodySnippet: "Bonjour, veuillez trouver mon CV pour le poste.",
      }),
    ).toMatchObject({ classification: "ignored", category: "job_application" });

    expect(
      classify({
        fromEmail: "winner@example.com",
        subject: "Lottery prize",
        bodySnippet: "You won a crypto jackpot.",
      }),
    ).toMatchObject({ classification: "ignored", category: "spam" });
  });

  it("lets strong lead intent beat weak ignore words", () => {
    expect(
      classify({
        fromEmail: "client@example.com",
        subject: "Facture question devis intervention",
        bodySnippet: "Bonjour, j'ai une question facture et besoin d'un devis intervention.",
      }),
    ).toMatchObject({
      classification: "leadable",
      action: "create_lead",
    });
  });

  it("creates review leads for support, supplier ambiguity, human invoice question, and unknown", () => {
    expect(
      classify({
        fromEmail: "support@example.com",
        subject: "Question client",
        bodySnippet: "Bonjour, pouvez-vous me rappeler ?",
      }),
    ).toMatchObject({
      classification: "leadable",
      category: "customer_request",
      action: "review",
      confidence: "medium",
    });

    expect(
      classify({
        fromEmail: "supplier@example.com",
        subject: "Fournisseur",
        bodySnippet: "Information fournisseur disponible.",
      }),
    ).toMatchObject({
      classification: "unknown",
      action: "review",
      confidence: "low",
    });

    expect(
      classify({
        fromEmail: "client@example.com",
        subject: "Question facture",
        bodySnippet: "Bonjour, est-ce possible de m'expliquer cette facture ?",
      }),
    ).toMatchObject({
      classification: "leadable",
      action: "review",
    });

    expect(
      classify({
        fromEmail: "person@example.com",
        subject: "Info",
        bodySnippet: "Message court",
      }),
    ).toMatchObject({
      classification: "unknown",
      category: "unknown",
      action: "review",
      confidence: "low",
    });
  });

  it("classifies quote, urgent, appointment, and business inquiries as leadable", () => {
    expect(classify({ subject: "Demande de devis" })).toMatchObject({
      classification: "leadable",
      category: "quote_request",
    });
    expect(classify({ subject: "SOS fuite urgent" })).toMatchObject({
      classification: "leadable",
      category: "urgent_service_request",
    });
    expect(classify({ subject: "Rendez-vous disponibilite" })).toMatchObject({
      classification: "leadable",
      category: "appointment_request",
    });
    expect(classify({ subject: "Partnership collaboration" })).toMatchObject({
      classification: "leadable",
      category: "business_lead",
    });
  });

  it("is deterministic and truncates snippets internally", () => {
    const input = {
      fromEmail: "person@example.com",
      subject: "Info",
      bodySnippet: `${"x".repeat(800)} devis`,
    };

    expect(classifyInboundMessage(input)).toEqual(classifyInboundMessage(input));
    expect(classifyInboundMessage(input)).toMatchObject({
      classification: "unknown",
      action: "review",
      confidence: "low",
    });
  });
});
