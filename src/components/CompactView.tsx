export type WidgetStatus = "idle" | "processing" | "warning" | "error";

interface CompactViewProps {
  activeCount: number;
  maxContext: number;
  status: WidgetStatus;
  layout: "island" | "side";
  tooltip?: string;
}

export function CompactView({
  activeCount,
  maxContext,
  status,
  layout,
  tooltip,
}: CompactViewProps) {
  const percent = Math.round(maxContext);

  return (
    <div
      className={`compact-view compact-view--${layout}`}
      title={tooltip}
      aria-label={tooltip ?? `${activeCount} tarefas, ${percent}% de contexto`}
    >
      <span
        className={`status-indicator status-indicator--${status}${
          activeCount > 0 && status === "idle" ? " status-indicator--active" : ""
        }`}
        aria-hidden="true"
      />
      <span className="compact-view__count" aria-hidden="true">
        {status === "error" ? "!" : activeCount}
      </span>
      <span className="compact-view__percent" aria-hidden="true">
        {status === "error" ? "err" : `${percent}%`}
      </span>
    </div>
  );
}
