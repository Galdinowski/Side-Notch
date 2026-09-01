interface ContextMeterProps {
  percent: number;
  showLabels?: boolean;
  usedLabel?: string;
  limitLabel?: string;
}

function levelClass(percent: number): string {
  if (percent >= 85) return "context-meter__fill--danger";
  if (percent >= 65) return "context-meter__fill--warning";
  return "context-meter__fill--safe";
}

export function ContextMeter({
  percent,
  showLabels = false,
  usedLabel,
  limitLabel,
}: ContextMeterProps) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className="context-meter">
      {showLabels && (
        <div className="context-meter__labels">
          <span>Contexto</span>
          <span>
            {clamped.toFixed(1)}%
            {usedLabel && limitLabel ? ` · ${usedLabel}/${limitLabel}` : ""}
          </span>
        </div>
      )}
      <div
        className="context-meter__track"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`context-meter__fill ${levelClass(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
