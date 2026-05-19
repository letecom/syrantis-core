import type { ClientInboxListItem } from "../types/ui";
import { EmptyState } from "./EmptyState";
import { MessageListItem } from "./MessageListItem";

type MessageListProps = {
  messages: ClientInboxListItem[];
};

export function MessageList({ messages }: MessageListProps) {
  return (
    <section className="client-message-list" aria-label="Messages priorisés">
      {messages.length === 0 ? (
        <EmptyState title="Aucun message" message="Aucune demande priorisée pour le moment." />
      ) : (
        messages.map((message) => <MessageListItem key={message.id} message={message} />)
      )}
    </section>
  );
}
