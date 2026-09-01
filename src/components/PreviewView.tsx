import type { AgentSnapshot } from "../../shared/types";
import type { WidgetStatus } from "./CompactView";
import { AgentCard } from "./AgentCard";

interface GroupedAgent {
  parent: AgentSnapshot;
  children: AgentSnapshot[];
}

interface PreviewViewProps {
  grouped: GroupedAgent[];
  error: string | null;
  status: WidgetStatus;
  activeCount: number;
}

export function PreviewView({
  grouped,
  error,
  status,
  activeCount,
}: PreviewViewProps) {
  if (error) {
    return (
      <div className="preview-view preview-view--empty">
        <header className="panel-header">
          <span className={`status-indicator status-indicator--${status}`} aria-hidden="true" />
          <span className="panel-header__brand">Cursor</span>
        </header>
        <p className="panel-message panel-message--error">{error}</p>
      </div>
    );
  }

  if (!grouped.length) {
    return (
      <div className="preview-view preview-view--empty">
        <header className="panel-header">
          <span className={`status-indicator status-indicator--${status}`} aria-hidden="true" />
          <span className="panel-header__brand">Cursor</span>
        </header>
        <p className="panel-message panel-message--short">Sem tarefas ativas</p>
      </div>
    );
  }

  const top = grouped.slice(0, 2);
  const taskLabel =
    activeCount === 1 ? "1 tarefa ativa" : `${activeCount} tarefas ativas`;

  return (
    <div className="preview-view">
      <header className="panel-header">
        <span className={`status-indicator status-indicator--${status}`} aria-hidden="true" />
        <span className="panel-header__brand">Cursor</span>
      </header>
      <p className="preview-view__summary">{taskLabel}</p>
      <div className="preview-view__tasks">
        {top.map(({ parent, children }) => (
          <AgentCard
            key={parent.composerId}
            agent={parent}
            subagents={children}
            variant="preview"
          />
        ))}
      </div>
      {grouped.length > 2 && (
        <p className="preview-view__more">+{grouped.length - 2} mais</p>
      )}
    </div>
  );
}
