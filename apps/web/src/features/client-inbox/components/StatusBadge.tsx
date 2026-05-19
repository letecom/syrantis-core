import type { ClientInboxBadgeTone } from "../types/ui";

type StatusBadgeProps = {
  label: string;
  tone: ClientInboxBadgeTone;
};

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return <span className={`client-badge ${tone}`}>{label}</span>;
}
