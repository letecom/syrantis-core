import type { ClientInboxDetail } from "../types/ui";
import { ClientInboxIcon } from "./ClientInboxIcon";

type MessageDetailProps = {
  detail: ClientInboxDetail;
};

export function MessageDetail({ detail }: MessageDetailProps) {
  return (
    <section className="client-panel client-reading-panel" aria-label="Message ouvert">
      <div className="client-mail-toolbar">
        <div className="client-toolbar-left">
          <span className="client-toolbar-round">
            <ClientInboxIcon name="arrowLeft" />
          </span>
          <ClientInboxIcon className="muted" name="clock" />
          <ClientInboxIcon className="muted" name="tag" />
          <ClientInboxIcon className="muted" name="mail" />
        </div>
        <div className="client-toolbar-right">
          <ClientInboxIcon className="muted" name="more" />
        </div>
      </div>

      <div className="client-mail-body">
        <div className="client-mail-heading">
          <h2>{detail.subject}</h2>
          <span className="client-mail-label">Boîte de réception</span>
        </div>

        <div className="client-mail-sender">
          <span className="client-initials">{getInitials(detail.fromDisplay)}</span>
          <div>
            <p className="client-mail-from">{detail.fromDisplay}</p>
            <p className="client-mail-address">{detail.fromEmail}</p>
            <p className="client-mail-recipient">
              à {detail.toDisplay} · {detail.toEmail}
            </p>
          </div>
          <div>
            <p className="client-mail-date">{detail.receivedText}</p>
            <div className="client-mail-actions">
              <ClientInboxIcon className="small muted" name="arrowLeft" />
              <ClientInboxIcon className="small muted" name="more" />
            </div>
          </div>
        </div>

        <div className="client-mail-text">
          {splitParagraphs(detail.bodyText).map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <button
            aria-label="Plus d'actions sur le message"
            className="client-more-button"
            type="button"
          >
            <ClientInboxIcon className="small" name="more" />
          </button>
        </div>
      </div>

      <QuickContextCard detail={detail} />
    </section>
  );
}

function QuickContextCard({ detail }: MessageDetailProps) {
  return (
    <div className="client-context-section">
      <div className="client-context-block">
        <h3 className="client-context-title">
          <ClientInboxIcon className="small muted" name="shield" />
          Contexte rapide
        </h3>
        <div className="client-quick-grid">
          {detail.quickContext.map((item) => (
            <span className="client-quick-item" key={item.label}>
              <ClientInboxIcon className="xsmall muted" name={item.icon} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <div className="client-context-block">
        <h3 className="client-context-title">
          <ClientInboxIcon className="small muted" name="paperclip" />
          Pièces jointes
        </h3>
        {detail.attachments.length === 0 ? (
          <p className="client-card-muted">Aucune pièce jointe</p>
        ) : (
          detail.attachments.map((attachment) => (
            <div className="client-attachment-row" key={attachment.name}>
              <ClientInboxIcon className="xsmall muted" name="draft" />
              <span>{attachment.name}</span>
              <span>{attachment.sizeText}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function splitParagraphs(bodyText: string) {
  return bodyText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function getInitials(displayName: string) {
  return displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
