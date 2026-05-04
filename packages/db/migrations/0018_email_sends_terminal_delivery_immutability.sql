CREATE OR REPLACE FUNCTION enforce_email_sends_terminal_delivery_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('failed', 'cancelled') THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
      OR NEW.approval_id IS DISTINCT FROM OLD.approval_id
      OR NEW.draft_id IS DISTINCT FROM OLD.draft_id
      OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
      OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
      OR NEW.from_email IS DISTINCT FROM OLD.from_email
      OR NEW.to_email IS DISTINCT FROM OLD.to_email
      OR NEW.reply_to_email IS DISTINCT FROM OLD.reply_to_email
      OR NEW.subject IS DISTINCT FROM OLD.subject
      OR NEW.text_body IS DISTINCT FROM OLD.text_body
      OR NEW.html_body IS DISTINCT FROM OLD.html_body
      OR NEW.provider IS DISTINCT FROM OLD.provider
      OR NEW.provider_message_id IS DISTINCT FROM OLD.provider_message_id
      OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
      OR NEW.approval_checked_at IS DISTINCT FROM OLD.approval_checked_at
      OR NEW.suppression_checked_at IS DISTINCT FROM OLD.suppression_checked_at
      OR NEW.attempt_count IS DISTINCT FROM OLD.attempt_count
      OR NEW.last_error_code IS DISTINCT FROM OLD.last_error_code
      OR NEW.last_error_message IS DISTINCT FROM OLD.last_error_message
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
      OR NEW.failed_at IS DISTINCT FROM OLD.failed_at
      OR NEW.delivery_status IS DISTINCT FROM OLD.delivery_status
      OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
      OR NEW.bounced_at IS DISTINCT FROM OLD.bounced_at
      OR NEW.complained_at IS DISTINCT FROM OLD.complained_at
      OR NEW.delivery_error_code IS DISTINCT FROM OLD.delivery_error_code
      OR NEW.metadata_json IS DISTINCT FROM OLD.metadata_json
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'email_sends terminal proof is immutable';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.status = 'sent' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
      OR NEW.approval_id IS DISTINCT FROM OLD.approval_id
      OR NEW.draft_id IS DISTINCT FROM OLD.draft_id
      OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
      OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
      OR NEW.from_email IS DISTINCT FROM OLD.from_email
      OR NEW.to_email IS DISTINCT FROM OLD.to_email
      OR NEW.reply_to_email IS DISTINCT FROM OLD.reply_to_email
      OR NEW.subject IS DISTINCT FROM OLD.subject
      OR NEW.text_body IS DISTINCT FROM OLD.text_body
      OR NEW.html_body IS DISTINCT FROM OLD.html_body
      OR NEW.provider IS DISTINCT FROM OLD.provider
      OR NEW.provider_message_id IS DISTINCT FROM OLD.provider_message_id
      OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
      OR NEW.approval_checked_at IS DISTINCT FROM OLD.approval_checked_at
      OR NEW.suppression_checked_at IS DISTINCT FROM OLD.suppression_checked_at
      OR NEW.attempt_count IS DISTINCT FROM OLD.attempt_count
      OR NEW.last_error_code IS DISTINCT FROM OLD.last_error_code
      OR NEW.last_error_message IS DISTINCT FROM OLD.last_error_message
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
      OR NEW.failed_at IS DISTINCT FROM OLD.failed_at
      OR NEW.metadata_json IS DISTINCT FROM OLD.metadata_json
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'email_sends terminal proof is immutable';
    END IF;
  END IF;

  IF OLD.delivery_status IS NOT NULL THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
      OR NEW.approval_id IS DISTINCT FROM OLD.approval_id
      OR NEW.draft_id IS DISTINCT FROM OLD.draft_id
      OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
      OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
      OR NEW.from_email IS DISTINCT FROM OLD.from_email
      OR NEW.to_email IS DISTINCT FROM OLD.to_email
      OR NEW.reply_to_email IS DISTINCT FROM OLD.reply_to_email
      OR NEW.subject IS DISTINCT FROM OLD.subject
      OR NEW.text_body IS DISTINCT FROM OLD.text_body
      OR NEW.html_body IS DISTINCT FROM OLD.html_body
      OR NEW.provider IS DISTINCT FROM OLD.provider
      OR NEW.provider_message_id IS DISTINCT FROM OLD.provider_message_id
      OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
      OR NEW.approval_checked_at IS DISTINCT FROM OLD.approval_checked_at
      OR NEW.suppression_checked_at IS DISTINCT FROM OLD.suppression_checked_at
      OR NEW.attempt_count IS DISTINCT FROM OLD.attempt_count
      OR NEW.last_error_code IS DISTINCT FROM OLD.last_error_code
      OR NEW.last_error_message IS DISTINCT FROM OLD.last_error_message
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
      OR NEW.failed_at IS DISTINCT FROM OLD.failed_at
      OR NEW.metadata_json IS DISTINCT FROM OLD.metadata_json
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'email_sends terminal proof is immutable';
    END IF;
  END IF;

  IF OLD.delivery_status = 'delivered' THEN
    IF NEW.delivery_status = 'complained'
      AND NEW.delivered_at IS NOT DISTINCT FROM OLD.delivered_at
      AND NEW.bounced_at IS NOT DISTINCT FROM OLD.bounced_at
      AND OLD.complained_at IS NULL
      AND NEW.complained_at IS NOT NULL
      AND NEW.delivery_error_code = 'RESEND_COMPLAINED'
    THEN
      RETURN NEW;
    END IF;

    IF NEW.delivery_status IS DISTINCT FROM OLD.delivery_status
      OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
      OR NEW.bounced_at IS DISTINCT FROM OLD.bounced_at
      OR NEW.complained_at IS DISTINCT FROM OLD.complained_at
      OR NEW.delivery_error_code IS DISTINCT FROM OLD.delivery_error_code
    THEN
      RAISE EXCEPTION 'email_sends delivery proof is immutable';
    END IF;
  END IF;

  IF OLD.delivery_status IN ('bounced', 'complained') THEN
    IF NEW.delivery_status IS DISTINCT FROM OLD.delivery_status
      OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
      OR NEW.bounced_at IS DISTINCT FROM OLD.bounced_at
      OR NEW.complained_at IS DISTINCT FROM OLD.complained_at
      OR NEW.delivery_error_code IS DISTINCT FROM OLD.delivery_error_code
    THEN
      RAISE EXCEPTION 'email_sends delivery proof is immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS email_sends_terminal_delivery_immutability_trg ON email_sends;
--> statement-breakpoint

CREATE TRIGGER email_sends_terminal_delivery_immutability_trg
BEFORE UPDATE ON email_sends
FOR EACH ROW
EXECUTE FUNCTION enforce_email_sends_terminal_delivery_immutability();
