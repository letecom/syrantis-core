import type { ClientInboxCompanyPolicyContext } from "../types/ui";
import { ClientInboxIcon } from "./ClientInboxIcon";

type CompanyPolicyContextProps = {
  companyPolicyContext: ClientInboxCompanyPolicyContext;
};

export function CompanyPolicyContext({ companyPolicyContext }: CompanyPolicyContextProps) {
  return (
    <section className="client-ai-card" aria-label="Règles entreprise">
      <div className="client-card-header">
        <h2 className="client-card-title">
          <ClientInboxIcon className="violet" name="shield" />
          Règles entreprise
        </h2>
      </div>
      <div className="client-card-body">
        <div className="client-context-card-top">
          <div>
            <p className="client-card-kicker">{companyPolicyContext.title}</p>
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
          <button className="client-secondary-button" type="button">
            Modifier
          </button>
        </div>
      </div>
    </section>
  );
}
