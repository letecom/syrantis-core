type ErrorStateProps = {
  message?: string;
};

export function ErrorState({
  message = "Impossible d'afficher la boîte de réception pour le moment.",
}: ErrorStateProps) {
  return (
    <div className="client-state-panel is-error" role="alert">
      <strong>À vérifier</strong>
      <p>{message}</p>
    </div>
  );
}
