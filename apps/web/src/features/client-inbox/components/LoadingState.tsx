type LoadingStateProps = {
  message?: string;
};

export function LoadingState({ message = "Chargement des messages..." }: LoadingStateProps) {
  return (
    <div className="client-state-panel" role="status">
      <strong>{message}</strong>
    </div>
  );
}
