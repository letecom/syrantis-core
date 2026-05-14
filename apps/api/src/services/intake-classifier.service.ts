import type {
  IntakeClassification,
  IntakeClassificationAction,
  IntakeClassificationConfidence,
} from "@syrantis/shared";

export type IntakeClassifierInput = {
  fromEmail?: string | null | undefined;
  subject?: string | null | undefined;
  bodySnippet?: string | null | undefined;
  isBulk?: boolean | null | undefined;
};

export type IntakeClassifierResult = {
  classification: IntakeClassification;
  category: string;
  action: IntakeClassificationAction;
  confidence: IntakeClassificationConfidence;
  reasonCode: string;
  suggestedLabels: string[];
};

const maxClassifierSnippetLength = 500;

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .slice(0, maxClassifierSnippetLength);
}

function localPart(email: string): string {
  return email.split("@")[0] ?? "";
}

function includesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function result(input: {
  classification: IntakeClassification;
  category: string;
  action: IntakeClassificationAction;
  confidence: IntakeClassificationConfidence;
  reasonCode: string;
  suggestedLabels?: string[];
}): IntakeClassifierResult {
  return {
    classification: input.classification,
    category: input.category,
    action: input.action,
    confidence: input.confidence,
    reasonCode: input.reasonCode,
    suggestedLabels: input.suggestedLabels ?? [],
  };
}

const strongLeadIntentPatterns = [
  /\b(devis|quote|estimation|tarif|prix|budget|chiffrage)\b/,
  /\b(urgent|fuite|panne|depannage|intervention|sos)\b/,
  /\b(rdv|rendez vous|rendez-vous|disponibilite|creneau)\b/,
  /\b(demo|demonstration|interesse|interessee|contactez moi|rappelez moi)\b/,
  /\b(partnership|collaboration|business inquiry)\b/,
] as const;

const humanRequestPatterns = [
  /\bbonjour\b/,
  /\b(question|besoin d aide|besoin d'aide|pouvez vous|pouvez-vous|est ce possible|est-ce possible)\b/,
  /\b(vous pouvez me rappeler|rappelez moi|rappeler|suite a votre message)\b/,
  /\b(j aimerais|j'aimerais|je souhaite|je voudrais|nous souhaitons|merci de)\b/,
] as const;

const bulkPatterns = [
  /\b(unsubscribe|se desabonner|desabonnement|list-unsubscribe|newsletter|promo|promotion)\b/,
  /\b(mailchimp|sendinblue|brevo|constant contact|campaign monitor)\b/,
] as const;

const automatedPatterns = [
  /\b(automated|notification automatique|ceci est un message automatique)\b/,
  /\b(do not reply|ne pas repondre|merci de ne pas repondre)\b/,
] as const;

const invoicePatterns = [
  /\b(facture|invoice|recu|receipt|paiement|payment|billing|comptabilite|compta)\b/,
] as const;

const shippingPatterns = [
  /\b(livraison|colis|shipped|delivery|commande expediee|expedition|tracking)\b/,
] as const;

const jobPatterns = [
  /\b(cv|candidature|recrutement|poste|stage|alternance|emploi|resume)\b/,
] as const;

const spamPatterns = [
  /\b(lottery|jackpot|crypto|bitcoin|prize|winner|heritage|million dollars)\b/,
  /\b(mot de passe|password|verify your account|compte suspendu|urgent transfer)\b/,
] as const;

export function classifyInboundMessage(input: IntakeClassifierInput): IntakeClassifierResult {
  const fromEmail = normalizeText(input.fromEmail);
  const sender = localPart(fromEmail);
  const subject = normalizeText(input.subject);
  const bodySnippet = normalizeText(input.bodySnippet);
  const combined = `${subject} ${bodySnippet}`.trim();
  const allText = `${fromEmail} ${combined}`.trim();
  const hasHumanRequest = includesAny(combined, humanRequestPatterns);

  if (includesAny(combined, strongLeadIntentPatterns)) {
    if (/\b(urgent|fuite|panne|depannage|intervention|sos)\b/.test(combined)) {
      return result({
        classification: "leadable",
        category: "urgent_service_request",
        action: "create_lead",
        confidence: "high",
        reasonCode: "urgent_service_intent",
      });
    }

    if (/\b(rdv|rendez vous|rendez-vous|disponibilite|creneau)\b/.test(combined)) {
      return result({
        classification: "leadable",
        category: "appointment_request",
        action: "create_lead",
        confidence: "high",
        reasonCode: "appointment_intent",
      });
    }

    if (/\b(devis|quote|estimation|tarif|prix|budget|chiffrage)\b/.test(combined)) {
      return result({
        classification: "leadable",
        category: "quote_request",
        action: "create_lead",
        confidence: "high",
        reasonCode: "quote_intent",
      });
    }

    return result({
      classification: "leadable",
      category: "business_lead",
      action: "create_lead",
      confidence: "medium",
      reasonCode: "business_intent",
    });
  }

  if (
    input.isBulk ||
    includesAny(allText, bulkPatterns) ||
    /^(newsletter|marketing|promo)/.test(sender)
  ) {
    return result({
      classification: "ignored",
      category: "newsletter",
      action: "ignore",
      confidence: "high",
      reasonCode: input.isBulk ? "bulk_flag" : "bulk_or_unsubscribe_signal",
      suggestedLabels: ["Syrantis/Ignored"],
    });
  }

  if (
    includesAny(allText, invoicePatterns) &&
    !hasHumanRequest &&
    (includesAny(allText, automatedPatterns) ||
      /^(billing|comptabilite|compta|facturation|invoice|receipt)/.test(sender))
  ) {
    return result({
      classification: "ignored",
      category: "invoice",
      action: "ignore",
      confidence: "medium",
      reasonCode: "automated_invoice_or_receipt",
      suggestedLabels: ["Syrantis/Ignored"],
    });
  }

  if (
    /^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|bounce|notifications?)$/.test(
      sender,
    ) ||
    includesAny(allText, automatedPatterns)
  ) {
    return result({
      classification: "ignored",
      category: "notification",
      action: "ignore",
      confidence: "high",
      reasonCode: "automated_sender_or_language",
      suggestedLabels: ["Syrantis/Ignored"],
    });
  }

  if (includesAny(allText, spamPatterns)) {
    return result({
      classification: "ignored",
      category: "spam",
      action: "ignore",
      confidence: "high",
      reasonCode: "obvious_spam_language",
      suggestedLabels: ["Syrantis/Ignored"],
    });
  }

  if (includesAny(combined, jobPatterns)) {
    return result({
      classification: "ignored",
      category: "job_application",
      action: "ignore",
      confidence: "medium",
      reasonCode: "job_application_language",
      suggestedLabels: ["Syrantis/Ignored"],
    });
  }

  if (includesAny(combined, shippingPatterns) && !hasHumanRequest) {
    return result({
      classification: "ignored",
      category: "notification",
      action: "ignore",
      confidence: "high",
      reasonCode: "shipping_notification",
      suggestedLabels: ["Syrantis/Ignored"],
    });
  }

  if (/^(support|help|sav|client|customer)/.test(sender) || hasHumanRequest) {
    return result({
      classification: "leadable",
      category: "customer_request",
      action: "review",
      confidence: "medium",
      reasonCode: "human_request_signal",
    });
  }

  if (/\b(supplier|fournisseur|commande|achat)\b/.test(allText)) {
    return result({
      classification: "unknown",
      category: "supplier_request",
      action: "review",
      confidence: "low",
      reasonCode: "ambiguous_supplier_language",
    });
  }

  return result({
    classification: "unknown",
    category: "unknown",
    action: "review",
    confidence: "low",
    reasonCode: "no_high_confidence_noise_signal",
  });
}
