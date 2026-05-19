import type { ClientInboxUser } from "../types/ui";
import { ClientInboxIcon } from "./ClientInboxIcon";

type ClientInboxSidebarProps = {
  accountName: string;
  inboxCount: number;
  user: ClientInboxUser;
};

export function ClientInboxSidebar({ accountName, inboxCount, user }: ClientInboxSidebarProps) {
  return (
    <aside className="client-sidebar" aria-label="Application client">
      <div className="client-brand">
        <span className="client-brand-mark">
          <ClientInboxIcon className="blue" name="spark" />
        </span>
        <span>syrantis</span>
      </div>

      <nav className="client-sidebar-nav" aria-label="Navigation client">
        <button className="client-nav-item" type="button">
          <ClientInboxIcon className="muted" name="dashboard" />
          <span>Tableau de bord</span>
        </button>
        <button className="client-nav-item is-active" type="button">
          <ClientInboxIcon name="mail" />
          <span>Boîte de réception</span>
          <span className="client-nav-count">{inboxCount}</span>
        </button>
        <button className="client-nav-item" type="button">
          <ClientInboxIcon className="muted" name="config" />
          <span>Configuration</span>
        </button>
      </nav>

      <div className="client-sidebar-footer">
        <div className="client-workspace-card">
          <div className="client-workspace-main">
            <span className="client-workspace-icon">
              <ClientInboxIcon className="small" name="building" />
            </span>
            <strong>{accountName}</strong>
          </div>
          <ClientInboxIcon className="small muted" name="chevronDown" />
        </div>
        <div className="client-user-card">
          <div className="client-user-main">
            <span className="client-user-avatar">{user.initials}</span>
            <div>
              <strong>{user.name}</strong>
              <p className="client-user-role">{user.roleText}</p>
            </div>
          </div>
          <ClientInboxIcon className="small muted" name="chevronUp" />
        </div>
      </div>
    </aside>
  );
}
