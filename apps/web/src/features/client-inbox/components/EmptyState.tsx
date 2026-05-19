type EmptyStateProps = {
  title?: string;
  message?: string;
};

export function EmptyState({
  title = "Aucun message",
  message = "Aucune demande priorisée pour le moment.",
}: EmptyStateProps) {
  return (
    <div className="client-state-panel" role="status">
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}
