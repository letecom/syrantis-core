import { ClientInboxIcon } from "./ClientInboxIcon";

type ClientInboxTopbarProps = {
  accountName: string;
};

export function ClientInboxTopbar({ accountName }: ClientInboxTopbarProps) {
  return (
    <header className="client-topbar">
      <div>
        <h1 className="client-page-title">Boîte de réception</h1>
        <p className="client-page-subtitle">Messages et demandes priorisés par l'IA</p>
      </div>

      <label className="client-search">
        <ClientInboxIcon className="muted" name="search" />
        <input
          aria-label="Rechercher des messages"
          placeholder="Rechercher messages, contacts, entreprises..."
          readOnly
          value=""
        />
        <span className="client-keycap">K</span>
      </label>

      <div className="client-top-actions">
        <div className="client-picker" aria-label="Sélecteur de compte client">
          <ClientInboxIcon className="blue" name="building" />
          <span>{accountName}</span>
          <ClientInboxIcon className="small muted" name="chevronDown" />
        </div>
        <span className="client-top-divider" />
        <button aria-label="Notifications" className="client-icon-button" type="button">
          <ClientInboxIcon name="bell" />
        </button>
        <button aria-label="Aide" className="client-icon-button" type="button">
          <ClientInboxIcon name="help" />
        </button>
      </div>
    </header>
  );
}
