import { eq, and } from "drizzle-orm";

import { emailSends, drafts, leads } from "@syrantis/db";
import { withWorkspaceDb } from "../lib/db.js";

export type PushbackDataRow = {
  syrantis_lead_id: string | null;
  syrantis_draft_id: string | null;
  syrantis_email_send_id: string;
  lead_label: string | null;
  contact_email: string;
  send_status: string;
  delivery_status: string | null;
  requested_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  delivery_error_code: string | null;
  safe_summary: string | null;
};

export async function findPushbackData(workspaceId: string, emailSendId: string): Promise<PushbackDataRow | null> {
  return withWorkspaceDb(workspaceId, async (tx) => {
    const [row] = await tx
      .select({
        syrantis_lead_id: emailSends.leadId,
        syrantis_draft_id: emailSends.draftId,
        syrantis_email_send_id: emailSends.id,
        contact_email: emailSends.toEmail,
        send_status: emailSends.status,
        delivery_status: emailSends.deliveryStatus,
        requested_at: emailSends.createdAt,
        sent_at: emailSends.sentAt,
        delivered_at: emailSends.deliveredAt,
        bounced_at: emailSends.bouncedAt,
        complained_at: emailSends.complainedAt,
        delivery_error_code: emailSends.deliveryErrorCode,
        leadIdForLabel: leads.id, // we might format label later, wait just use id for MVP or wait? The MVP says lead_label. Let's use lead.id for label if nothing else? Wait, no, maybe leads.id or something else? Let's read lead label logic if it exists.
        draftSubject: drafts.subject,
      })
      .from(emailSends)
      .leftJoin(drafts, eq(emailSends.draftId, drafts.id))
      .leftJoin(leads, eq(emailSends.leadId, leads.id))
      .where(and(eq(emailSends.id, emailSendId), eq(emailSends.workspaceId, workspaceId)))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      syrantis_lead_id: row.syrantis_lead_id,
      syrantis_draft_id: row.syrantis_draft_id,
      syrantis_email_send_id: row.syrantis_email_send_id,
      lead_label: row.leadIdForLabel ? `Lead ${row.leadIdForLabel.split('-')[0]}` : null,
      contact_email: row.contact_email,
      send_status: row.send_status,
      delivery_status: row.delivery_status,
      requested_at: row.requested_at.toISOString(),
      sent_at: row.sent_at?.toISOString() ?? null,
      delivered_at: row.delivered_at?.toISOString() ?? null,
      bounced_at: row.bounced_at?.toISOString() ?? null,
      complained_at: row.complained_at?.toISOString() ?? null,
      delivery_error_code: row.delivery_error_code,
      safe_summary: row.draftSubject ?? null,
    };
  });
}
