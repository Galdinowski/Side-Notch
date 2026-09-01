import type { AgentSnapshot } from "../../shared/types";
import { AgentCard } from "./AgentCard";

interface GroupedAgent {
  parent: AgentSnapshot;
  children: AgentSnapshot[];
}

interface ExpandedViewProps {
  grouped: GroupedAgent[];
  error: string | null;
  activeCount: number;
}

export function ExpandedView({ grouped, error, activeCount }: ExpandedViewProps) {
  if (error) {
    return (
      <div className="expanded-view expanded-view--empty">
        <header className="panel-header">
          <span className="status-indicator status-indicator--error" aria-hidden="true" />
          <span className="panel-header__brand">Cursor</span>
        </header>
        <p className="panel-message panel-message--error">
          Erro ao ler Cursor: {error}
        </p>
        <footer className="expanded-view__hint">Clique para recolher</footer>
      </div>
    );
  }

  if (!grouped.length) {
    return (
      <div className="expanded-view expanded-view--empty">
        <header className="panel-header">
          <span className="status-indicator status-indicator--idle" aria-hidden="true" />
          <span className="panel-header__brand">Cursor</span>
        </header>
        <p className="panel-message panel-message--short">Sem tarefas ativas</p>
        <footer className="expanded-view__hint">Clique para recolher</footer>
      </div>
    );
  }

  const taskLabel =
    activeCount === 1 ? "1 tarefa ativa" : `${activeCount} tarefas ativas`;

  return (
    <div className="expanded-view">
      <header className="panel-header panel-header--expanded">
        <div className="panel-header__leading">
          <span
            className={`status-indicator status-indicator--${
              grouped.some(({ parent }) => parent.hasBlockingPendingActions)
                ? "warning"
                : grouped.some(({ parent }) => parent.isRunning)
                  ? "processing"
                  : "idle"
            }`}
            aria-hidden="true"
          />
          <span className="panel-header__brand">Cursor</span>
        </div>
        <span className="panel-header__meta">{taskLabel}</span>
      </header>
      <div className="expanded-view__list">
        {grouped.map(({ parent, children }) => (
          <AgentCard key={parent.composerId} agent={parent} subagents={children} />
        ))}
      </div>
      <footer className="expanded-view__hint">Clique para recolher</footer>
    </div>
  );
}
