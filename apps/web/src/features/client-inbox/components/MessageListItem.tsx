import type { ClientInboxListItem } from "../types/ui";
import {
  getDraftStatusText,
  getDraftStatusTone,
  getExportStatusText,
  getExportStatusTone,
} from "../utils/formatters";
import { ScoreBadge } from "./ScoreBadge";
import { StatusBadge } from "./StatusBadge";

type MessageListItemProps = {
  message: ClientInboxListItem;
};

export function MessageListItem({ message }: MessageListItemProps) {
  const initialsClassName = ["client-initials", message.avatarTone].filter(Boolean).join(" ");

  return (
    <article className={["client-message-item", message.selected ? "is-selected" : ""].join(" ")}>
      <span className={initialsClassName}>{message.initials}</span>
      <div className="client-message-content">
        <div className="client-message-meta">
          <span className="client-message-name">{message.contactName}</span>
          <span className="client-message-company">{message.companyName}</span>
        </div>
        <p className="client-message-subject">{message.subjectPreview}</p>
        <p className="client-message-preview">{message.snippetPreview}</p>
        <div className="client-message-badges">
          <StatusBadge label={message.categoryText} tone="category" />
          <StatusBadge label={message.contactStatusText} tone="contact" />
          <StatusBadge
            label={getDraftStatusText(message.draftStatus)}
            tone={getDraftStatusTone(message.draftStatus)}
          />
          {message.exportStatus !== "not_requested" ? (
            <StatusBadge
              label={getExportStatusText(message.exportStatus)}
              tone={getExportStatusTone(message.exportStatus)}
            />
          ) : null}
          {message.attentionTexts.map((label) => (
            <StatusBadge key={`${message.id}-${label}`} label={label} tone="approval" />
          ))}
        </div>
      </div>
      <div className="client-message-side">
        <span className="client-message-time">{message.receivedText}</span>
        <ScoreBadge score={message.score} scoreBand={message.scoreBand} />
      </div>
    </article>
  );
}
