import type { ClientInboxCompanyPolicyContext } from "../types/ui";
import { ClientInboxIcon } from "./ClientInboxIcon";

type CompanyPolicyContextProps = {
  companyPolicyContext: ClientInboxCompanyPolicyContext;
};

export function CompanyPolicyContext({ companyPolicyContext }: CompanyPolicyContextProps) {
  return (
    <section className="client-ai-card" aria-label="Configuration utilisée">
      <div className="client-card-header">
        <h2 className="client-card-title">
          <ClientInboxIcon className="violet" name="shield" />
          Configuration utilisée
        </h2>
      </div>
      <div className="client-card-body">
        <div>
          <p className="client-card-kicker">{companyPolicyContext.title}</p>
          <p className="client-card-muted">Statut: {companyPolicyContext.statusText}</p>
          <p className="client-policy-heading">Règles respectées</p>
          <ul className="client-policy-list">
            {companyPolicyContext.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <p className="client-policy-match">
            <ClientInboxIcon className="xsmall" name="check" />
            {companyPolicyContext.matchText}
          </p>
        </div>
      </div>
    </section>
  );
}
