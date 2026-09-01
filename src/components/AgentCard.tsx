import type { AgentSnapshot } from "../../shared/types";
import { ContextMeter } from "./ContextMeter";

interface AgentCardProps {
  agent: AgentSnapshot;
  subagents?: AgentSnapshot[];
  variant?: "default" | "preview";
}

function formatTokens(percent: number): { used: string; limit: string } {
  const limit = 200_000;
  const used = Math.round((percent / 100) * limit);
  const fmt = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  return { used: fmt(used), limit: fmt(limit) };
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
  const tokens = formatTokens(agent.contextUsagePercent);
  const isPreview = variant === "preview";
  const percent = Math.round(agent.contextUsagePercent);

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
          <span className="task-row__percent">{percent}%</span>
        </div>
        <ContextMeter percent={agent.contextUsagePercent} />
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

      {agent.subtitle && (
        <p className="agent-card__subtitle">{agent.subtitle}</p>
      )}

      <ContextMeter
        percent={agent.contextUsagePercent}
        usedLabel={tokens.used}
        limitLabel={tokens.limit}
        showLabels
      />

      <div className="agent-card__meta">
        <span>+{agent.linesAdded} / -{agent.linesRemoved}</span>
        <span>{agent.filesChanged} arquivos</span>
        {agent.hasBlockingPendingActions && (
          <span className="agent-card__blocking">Aguardando ação</span>
        )}
      </div>

      {subagents.length > 0 && (
        <div className="agent-card__subagents">
          {subagents.map((sub) => (
            <div key={sub.composerId} className="subagent-row">
              <span className="subagent-row__name">{sub.name}</span>
              <span className="subagent-row__percent">
                {Math.round(sub.contextUsagePercent)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
