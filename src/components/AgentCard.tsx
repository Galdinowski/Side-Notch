import type { AgentSnapshot } from "../../shared/types";
import { ContextMeter } from "./ContextMeter";

interface AgentCardProps {
  agent: AgentSnapshot;
  subagents?: AgentSnapshot[];
  variant?: "default" | "preview";
}

function shortPath(fullPath: string | null): string {
  if (!fullPath) return "Sem workspace";
  const parts = fullPath.split(/[\\/]/);
  return parts[parts.length - 1] || fullPath;
}

export function AgentCard({
  agent,
  subagents = [],
  variant = "default",
}: AgentCardProps) {
  const percent = agent.contextUsagePercent;
  const isPreview = variant === "preview";
  const rounded = percent != null ? Math.round(percent) : null;

  if (isPreview) {
    return (
      <article className="task-row">
        <div className="task-row__header">
          <span
            className={`status-indicator status-indicator--${
              agent.hasBlockingPendingActions
                ? "warning"
                : agent.isRunning
                  ? "processing"
                  : "idle"
            } status-indicator--inline`}
            aria-hidden="true"
          />
          <span className="task-row__name">{agent.name}</span>
          <span className="task-row__percent">
            {rounded != null ? `${rounded}%` : agent.hasBlockingPendingActions ? "ação" : "ao vivo"}
          </span>
        </div>
        {percent != null ? <ContextMeter percent={percent} /> : null}
      </article>
    );
  }

  return (
    <article className="agent-card">
      <div className="agent-card__header">
        <div className="agent-card__title-row">
          <span
            className={`status-indicator status-indicator--${
              agent.hasBlockingPendingActions
                ? "warning"
                : agent.isRunning
                  ? "processing"
                  : "idle"
            } status-indicator--inline`}
            aria-hidden="true"
          />
          <h3 className="agent-card__title">{agent.name}</h3>
        </div>
        <span className="agent-card__workspace" title={agent.workspacePath ?? undefined}>
          {shortPath(agent.workspacePath)}
        </span>
      </div>

      {agent.subtitle ? <p className="agent-card__subtitle">{agent.subtitle}</p> : null}

      {percent != null ? (
        <ContextMeter percent={percent} showLabels />
      ) : null}

      <div className="agent-card__meta">
        {agent.linesAdded > 0 || agent.linesRemoved > 0 ? (
          <span>
            +{agent.linesAdded} / -{agent.linesRemoved}
          </span>
        ) : null}
        {agent.filesChanged > 0 ? <span>{agent.filesChanged} arquivos</span> : null}
        {agent.hasBlockingPendingActions ? (
          <span className="agent-card__blocking">Aguardando ação</span>
        ) : null}
      </div>

      {subagents.length > 0 ? (
        <div className="agent-card__subagents">
          {subagents.map((sub) => (
            <div key={sub.composerId} className="subagent-row">
              <span className="subagent-row__name">{sub.name}</span>
              <span className="subagent-row__percent">
                {sub.contextUsagePercent != null
                  ? `${Math.round(sub.contextUsagePercent)}%`
                  : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
