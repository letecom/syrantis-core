import { and, eq, sql } from "drizzle-orm";

import { contacts, leads } from "@syrantis/db";

import { withWorkspaceDb, type WorkspaceDbTransaction } from "../lib/db.js";

export type LeadContactContextSourceRow = {
  id: string;
  safeContactId: string | null;
  contactEmail: string | null;
  normalizedJsonFromEmail: string | null;
  normalizedJsonEmail: string | null;
};

export type ContactContextMatchKey =
  | {
      matchedBy: "contact_id";
      contactId: string;
      email: string | null;
    }
  | {
      matchedBy: "email";
      email: string;
    };

export type LeadContactContextAggregateRow = {
  previousLeadCount: number;
  previousDraftCount: number;
  previousOutboundCount: number;
  lastPriorLeadAt: Date | null;
  lastOutboundAt: Date | null;
  lastOutboundDeliveryStatus: "delivered" | "bounced" | "complained" | null;
  hasPriorBounce: boolean;
  hasPriorComplaint: boolean;
};

export type FindLeadContactContextSourceInput = {
  workspaceId: string;
  leadId: string;
};

export type FindLeadContactContextAggregateInput = {
  workspaceId: string;
  leadId: string;
  key: ContactContextMatchKey;
};

type QueryResultLike<T> = {
  rows?: T[];
};

type RawAggregateRow = {
  previous_lead_count: number | string | null;
  previous_draft_count: number | string | null;
  previous_outbound_count: number | string | null;
  last_prior_lead_at: Date | string | null;
  last_outbound_at: Date | string | null;
  last_outbound_delivery_status: string | null;
  has_prior_bounce: boolean | null;
  has_prior_complaint: boolean | null;
};

function toCount(value: number | string | null): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function toDate(value: Date | string | null): Date | null {
  return value instanceof Date ? value : value ? new Date(value) : null;
}

function deliveryStatus(
  value: string | null,
): LeadContactContextAggregateRow["lastOutboundDeliveryStatus"] {
  return value === "delivered" || value === "bounced" || value === "complained" ? value : null;
}

function mapAggregate(row: RawAggregateRow | undefined): LeadContactContextAggregateRow {
  return {
    previousLeadCount: toCount(row?.previous_lead_count ?? 0),
    previousDraftCount: toCount(row?.previous_draft_count ?? 0),
    previousOutboundCount: toCount(row?.previous_outbound_count ?? 0),
    lastPriorLeadAt: toDate(row?.last_prior_lead_at ?? null),
    lastOutboundAt: toDate(row?.last_outbound_at ?? null),
    lastOutboundDeliveryStatus: deliveryStatus(row?.last_outbound_delivery_status ?? null),
    hasPriorBounce: Boolean(row?.has_prior_bounce),
    hasPriorComplaint: Boolean(row?.has_prior_complaint),
  };
}

async function findSourceInTx(
  tx: WorkspaceDbTransaction,
  input: FindLeadContactContextSourceInput,
): Promise<LeadContactContextSourceRow | null> {
  const [lead] = await tx
    .select({
      id: leads.id,
      safeContactId: contacts.id,
      contactEmail: contacts.email,
      normalizedJsonFromEmail: sql<string | null>`${leads.normalizedJson}->>'fromEmail'`,
      normalizedJsonEmail: sql<string | null>`${leads.normalizedJson}->>'email'`,
    })
    .from(leads)
    .leftJoin(
      contacts,
      and(eq(contacts.id, leads.contactId), eq(contacts.workspaceId, input.workspaceId)),
    )
    .where(and(eq(leads.workspaceId, input.workspaceId), eq(leads.id, input.leadId)))
    .limit(1);

  return lead ?? null;
}

function previousLeadPredicate(input: FindLeadContactContextAggregateInput) {
  if (input.key.matchedBy === "contact_id") {
    return sql`l.contact_id = ${input.key.contactId}`;
  }

  return sql`(
    lower(btrim(pc.email)) = ${input.key.email}
    OR lower(btrim(l.normalized_json->>'fromEmail')) = ${input.key.email}
    OR lower(btrim(l.normalized_json->>'email')) = ${input.key.email}
  )`;
}

function previousSendPredicate(input: FindLeadContactContextAggregateInput) {
  if (input.key.matchedBy === "contact_id") {
    return sql`es.contact_id = ${input.key.contactId}`;
  }

  return sql`lower(btrim(es.to_email)) = ${input.key.email}`;
}

async function findAggregateInTx(
  tx: WorkspaceDbTransaction,
  input: FindLeadContactContextAggregateInput,
): Promise<LeadContactContextAggregateRow> {
  const result = (await tx.execute(sql`
    WITH previous_leads AS (
      SELECT l.id, l.created_at
      FROM leads l
      LEFT JOIN contacts pc
        ON pc.id = l.contact_id
        AND pc.workspace_id = ${input.workspaceId}
      WHERE
        l.workspace_id = ${input.workspaceId}
        AND l.id <> ${input.leadId}
        AND ${previousLeadPredicate(input)}
    ),
    previous_drafts AS (
      SELECT DISTINCT d.id
      FROM drafts d
      INNER JOIN previous_leads pl
        ON pl.id = d.lead_id
      WHERE d.workspace_id = ${input.workspaceId}
    ),
    previous_sends AS (
      SELECT DISTINCT es.id, es.created_at, es.delivery_status
      FROM email_sends es
      WHERE
        es.workspace_id = ${input.workspaceId}
        AND (es.lead_id IS NULL OR es.lead_id <> ${input.leadId})
        AND NOT EXISTS (
          SELECT 1
          FROM drafts current_draft
          WHERE
            current_draft.workspace_id = ${input.workspaceId}
            AND current_draft.id = es.draft_id
            AND current_draft.lead_id = ${input.leadId}
        )
        AND (
          es.lead_id IN (SELECT id FROM previous_leads)
          OR es.draft_id IN (SELECT id FROM previous_drafts)
          OR ${previousSendPredicate(input)}
        )
    ),
    latest_delivery AS (
      SELECT delivery_status
      FROM previous_sends
      WHERE delivery_status IN ('delivered', 'bounced', 'complained')
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    )
    SELECT
      (SELECT count(*) FROM previous_leads)::int AS previous_lead_count,
      (SELECT count(*) FROM previous_drafts)::int AS previous_draft_count,
      (SELECT count(*) FROM previous_sends)::int AS previous_outbound_count,
      (SELECT max(created_at) FROM previous_leads) AS last_prior_lead_at,
      (SELECT max(created_at) FROM previous_sends) AS last_outbound_at,
      (SELECT delivery_status FROM latest_delivery) AS last_outbound_delivery_status,
      EXISTS (
        SELECT 1 FROM previous_sends WHERE delivery_status = 'bounced'
      ) AS has_prior_bounce,
      EXISTS (
        SELECT 1 FROM previous_sends WHERE delivery_status = 'complained'
      ) AS has_prior_complaint
  `)) as QueryResultLike<RawAggregateRow>;

  return mapAggregate(result.rows?.[0]);
}

export async function findLeadContactContextSource(
  input: FindLeadContactContextSourceInput,
): Promise<LeadContactContextSourceRow | null> {
  return withWorkspaceDb(input.workspaceId, async (tx) => findSourceInTx(tx, input));
}

export async function findLeadContactContextAggregate(
  input: FindLeadContactContextAggregateInput,
): Promise<LeadContactContextAggregateRow> {
  return withWorkspaceDb(input.workspaceId, async (tx) => findAggregateInTx(tx, input));
}
