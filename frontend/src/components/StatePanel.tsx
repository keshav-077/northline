interface Props {
  kind: "loading" | "error" | "empty";
  message?: string;
  onRetry?: () => void;
}

export function StatePanel({ kind, message, onRetry }: Props) {
  if (kind === "loading") {
    return (
      <div className="msg" role="status" aria-live="polite">
        <div className="sk" style={{ width: "70%" }} />
        <div className="sk" style={{ width: "45%" }} />
        <div className="sk" style={{ width: "58%" }} />
        <p>Loading the January replay.</p>
      </div>
    );
  }
  if (kind === "error") {
    return (
      <div className="al" role="alert">
        <span>{message ?? "The evaluation could not be loaded."}</span>
        <button type="button" onClick={onRetry}>Retry</button>
      </div>
    );
  }
  return (
    <div className="msg">
      <h2>No hours could be scored for this selection.</h2>
      <p>Missing intervals are left out of MAE, RMSE, and bias.</p>
    </div>
  );
}
