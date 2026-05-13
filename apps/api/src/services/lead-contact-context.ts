import {
  LeadContactContextDtoSchema,
  type ContactContextWarningCode,
  type LeadContactContextDto,
} from "@syrantis/shared";

import {
  findLeadContactContextAggregate,
  findLeadContactContextSource,
  type ContactContextMatchKey,
  type LeadContactContextAggregateRow,
  type LeadContactContextSourceRow,
} from "../repositories/lead-contact-context.js";

export type LeadContactContextServiceResult =
  | { result: "ok"; context: LeadContactContextDto }
  | { result: "not_found" };

export type LeadContactContextService = {
  getContactContext(workspaceId: string, leadId: string): Promise<LeadContactContextServiceResult>;
};

export type LeadContactContextRepository = {
  findSource(input: {
    workspaceId: string;
    leadId: string;
  }): Promise<LeadContactContextSourceRow | null>;
  findAggregate(input: {
    workspaceId: string;
    leadId: string;
    key: ContactContextMatchKey;
  }): Promise<LeadContactContextAggregateRow>;
};

const recentWindowMs = 7 * 24 * 60 * 60 * 1000;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sharedInboxLocalParts = new Set([
  "contact",
  "info",
  "support",
  "sales",
  "admin",
  "hello",
  "bonjour",
  "accueil",
]);

const warningOrder: ContactContextWarningCode[] = [
  "no_contact_key",
  "shared_inbox_possible",
  "repeated_inbound_recent",
  "recently_contacted",
  "prior_bounce",
  "prior_complaint",
];

const productionRepository: LeadContactContextRepository = {
  findSource: findLeadContactContextSource,
  findAggregate: findLeadContactContextAggregate,
};

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized || normalized.length > 320 || !emailPattern.test(normalized)) {
    return null;
  }

  return normalized;
}

function sharedInboxWarningEmail(source: LeadContactContextSourceRow): string | null {
  return (
    normalizeEmail(source.contactEmail) ??
    normalizeEmail(source.normalizedJsonFromEmail) ??
    normalizeEmail(source.normalizedJsonEmail)
  );
}

function isSharedInbox(email: string | null): boolean {
  const localPart = email?.split("@", 1)[0] ?? "";
  return sharedInboxLocalParts.has(localPart);
}

function isRecent(value: Date | null, now: Date): boolean {
  if (!value) {
    return false;
  }

  const ageMs = now.getTime() - value.getTime();
  return ageMs >= 0 && ageMs <= recentWindowMs;
}

function chooseKey(source: LeadContactContextSourceRow): ContactContextMatchKey | null {
  if (source.safeContactId) {
    return {
      matchedBy: "contact_id",
      contactId: source.safeContactId,
      email: sharedInboxWarningEmail(source),
    };
  }

  const email =
    normalizeEmail(source.normalizedJsonFromEmail) ?? normalizeEmail(source.normalizedJsonEmail);

  return email
    ? {
        matchedBy: "email",
        email,
      }
    : null;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function orderedWarnings(warnings: Set<ContactContextWarningCode>): ContactContextWarningCode[] {
  return warningOrder.filter((warning) => warnings.has(warning));
}

function emptyContext(leadId: string, source: LeadContactContextSourceRow): LeadContactContextDto {
  const warnings = new Set<ContactContextWarningCode>(["no_contact_key"]);

  if (isSharedInbox(sharedInboxWarningEmail(source))) {
    warnings.add("shared_inbox_possible");
  }

  return LeadContactContextDtoSchema.parse({
    leadId,
    contactKeyPresent: false,
    matchedBy: null,
    hasPriorContext: false,
    previousLeadCount: 0,
    previousDraftCount: 0,
    previousOutboundCount: 0,
    lastPriorLeadAt: null,
    lastOutboundAt: null,
    lastOutboundDeliveryStatus: null,
    warnings: orderedWarnings(warnings),
  });
}

function buildContext(input: {
  leadId: string;
  key: ContactContextMatchKey;
  source: LeadContactContextSourceRow;
  aggregate: LeadContactContextAggregateRow;
  now: Date;
}): LeadContactContextDto {
  const warnings = new Set<ContactContextWarningCode>();
  const warningEmail =
    input.key.matchedBy === "email" ? input.key.email : sharedInboxWarningEmail(input.source);

  if (isSharedInbox(warningEmail)) {
    warnings.add("shared_inbox_possible");
  }

  if (isRecent(input.aggregate.lastPriorLeadAt, input.now)) {
    warnings.add("repeated_inbound_recent");
  }

  if (isRecent(input.aggregate.lastOutboundAt, input.now)) {
    warnings.add("recently_contacted");
  }

  if (input.aggregate.hasPriorBounce) {
    warnings.add("prior_bounce");
  }

  if (input.aggregate.hasPriorComplaint) {
    warnings.add("prior_complaint");
  }

  return LeadContactContextDtoSchema.parse({
    leadId: input.leadId,
    contactKeyPresent: true,
    matchedBy: input.key.matchedBy,
    hasPriorContext:
      input.aggregate.previousLeadCount > 0 ||
      input.aggregate.previousDraftCount > 0 ||
      input.aggregate.previousOutboundCount > 0,
    previousLeadCount: input.aggregate.previousLeadCount,
    previousDraftCount: input.aggregate.previousDraftCount,
    previousOutboundCount: input.aggregate.previousOutboundCount,
    lastPriorLeadAt: toIso(input.aggregate.lastPriorLeadAt),
    lastOutboundAt: toIso(input.aggregate.lastOutboundAt),
    lastOutboundDeliveryStatus: input.aggregate.lastOutboundDeliveryStatus,
    warnings: orderedWarnings(warnings),
  });
}

export function createLeadContactContextService(
  options: {
    repository?: LeadContactContextRepository;
    now?: () => Date;
  } = {},
): LeadContactContextService {
  const repository = options.repository ?? productionRepository;
  const now = options.now ?? (() => new Date());

  return {
    async getContactContext(
      workspaceId: string,
      leadId: string,
    ): Promise<LeadContactContextServiceResult> {
      const source = await repository.findSource({ workspaceId, leadId });

      if (!source) {
        return { result: "not_found" };
      }

      const key = chooseKey(source);

      if (!key) {
        return {
          result: "ok",
          context: emptyContext(leadId, source),
        };
      }

      const aggregate = await repository.findAggregate({ workspaceId, leadId, key });

      return {
        result: "ok",
        context: buildContext({
          leadId,
          key,
          source,
          aggregate,
          now: now(),
        }),
      };
    },
  };
}

export function createProductionLeadContactContextService(): LeadContactContextService {
  return createLeadContactContextService();
}
