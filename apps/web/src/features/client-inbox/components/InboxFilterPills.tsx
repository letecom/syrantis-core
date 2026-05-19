import type { ClientInboxFilter } from "../types/ui";
import { ClientInboxIcon } from "./ClientInboxIcon";

type InboxFilterPillsProps = {
  filters: ClientInboxFilter[];
};

export function InboxFilterPills({ filters }: InboxFilterPillsProps) {
  return (
    <div className="client-filter-row">
      <div className="client-filter-pills" aria-label="Filtres de la boîte de réception">
        {filters.map((filter) => (
          <button
            className={["client-filter-pill", filter.active ? "is-active" : ""].join(" ")}
            key={filter.label}
            type="button"
          >
            <span className="client-pill-dot" />
            <span>{filter.label}</span>
            <span className="client-pill-count">{filter.count}</span>
          </button>
        ))}
      </div>
      <div className="client-sort-group">
        <button className="client-sort-button" type="button">
          Tri : plus récents <ClientInboxIcon className="small" name="chevronDown" />
        </button>
        <button aria-label="Filtrer les messages" className="client-filter-button" type="button">
          <ClientInboxIcon name="filter" />
        </button>
      </div>
    </div>
  );
}
