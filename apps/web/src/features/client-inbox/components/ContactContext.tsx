import type { ClientInboxContactContext } from "../types/ui";
import { ClientInboxIcon } from "./ClientInboxIcon";
import { StatusBadge } from "./StatusBadge";

type ContactContextProps = {
  contactContext: ClientInboxContactContext;
};

export function ContactContext({ contactContext }: ContactContextProps) {
  return (
    <section className="client-ai-card" aria-label="Contexte contact">
      <div className="client-card-header">
        <h2 className="client-card-title">
          <ClientInboxIcon className="blue" name="user" />
          Contexte contact
        </h2>
      </div>
      <div className="client-card-body">
        <div className="client-context-card-top">
          <div>
            <p className="client-card-kicker">
              {contactContext.contactName}{" "}
              <StatusBadge label={contactContext.statusText} tone="contact" />
            </p>
            <p className="client-card-muted">{contactContext.companyLine}</p>
            <p className="client-card-muted">{contactContext.relationshipSummary}</p>
          </div>
          <button className="client-secondary-button" type="button">
            {contactContext.actionText}
          </button>
        </div>
      </div>
    </section>
  );
}
